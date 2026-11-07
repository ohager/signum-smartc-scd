import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  DEFAULT_HINTS,
  METHODS,
  MISMATCH_ERROR,
  PROTOCOL_VERSION,
  TAKEN_OVER_CLOSE,
  catalogHash,
  isAllowedOrigin,
  type ClientInfo,
  type ErrorCode,
  type ToolName,
  type ToolOutcome,
} from "@smartc-studio/assistant-protocol";

export type TabLinkState = "idle" | "pending" | "active" | "denied" | "mismatch" | "busy";

export interface TabLinkOptions {
  port: number;
  allowOrigins: string[];
  /** Also accept http://localhost and http://127.0.0.1 origins (the relay's --dev). */
  allowLocalhost?: boolean;
  host?: "127.0.0.1";
  /** How often a busy relay tries to take the port again. */
  busyRetryMs?: number;
  /** Human-readable lines; stdout belongs to MCP, so the default writes to stderr. */
  log?: (line: string) => void;
}

const BUSY_RETRY_MS = 3000;
const stderrLog = (line: string) => void process.stderr.write(`[smartc-studio-mcp] ${line}\n`);

interface Pending {
  socket: WebSocket;
  resolve: (outcome: ToolOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** The relay timer is a safety net behind the Studio's own timeout. */
const RELAY_GRACE_MS = 2000;

function fail(code: ErrorCode, message: string, hint: string = DEFAULT_HINTS[code]): ToolOutcome {
  return { ok: false, error: { code, message, hint } };
}

export class TabLink {
  #opts: TabLinkOptions;
  #server?: WebSocketServer;
  #busy = false;
  #stopped = false;
  #retry?: ReturnType<typeof setTimeout>;
  #hash = "";
  #client: ClientInfo | null = null;
  /** The accepted session. */
  #active: WebSocket | null = null;
  /** A tab that said hello and awaits the user's decision (or a hello that failed/was denied). */
  #candidate: WebSocket | null = null;
  #candidateState: "pending" | "denied" | "mismatch" = "pending";
  #mismatchHint = DEFAULT_HINTS.protocol_mismatch;
  #hello = new WeakSet<WebSocket>();
  #calls = new Map<number, Pending>();
  #nextId = 1;

  constructor(opts: TabLinkOptions) {
    this.#opts = opts;
  }

  get state(): TabLinkState {
    if (this.#busy) return "busy";
    if (this.#active) return "active";
    if (this.#candidate) return this.#candidateState;
    return "idle";
  }

  async start(): Promise<"listening" | "busy"> {
    this.#stopped = false;
    this.#hash = await catalogHash();
    const server = await this.#listen();
    if (server) {
      this.#adopt(server);
      return "listening";
    }
    this.#busy = true;
    this.#scheduleRetry();
    return "busy";
  }

  /*
   * A busy port usually means another agent session's relay. Once that session ends
   * its port is free, but nothing would tell this relay, and every call would keep
   * failing with another_session_connected until the agent restarts. So a busy relay
   * keeps trying to listen and quietly becomes a normal one when it gets the port.
   */
  #scheduleRetry() {
    if (this.#stopped) return;
    this.#retry = setTimeout(async () => {
      this.#retry = undefined;
      const server = await this.#listen().catch(() => null);
      if (this.#stopped) {
        server?.close();
        return;
      }
      if (!server) return this.#scheduleRetry();
      this.#adopt(server);
      this.#busy = false;
      (this.#opts.log ?? stderrLog)(`Port ${this.#opts.port} is free now. Waiting for SmartC Studio on ws://127.0.0.1:${this.#opts.port}`);
    }, this.#opts.busyRetryMs ?? BUSY_RETRY_MS);
    // A retry alone must not keep the process alive once MCP is gone.
    this.#retry.unref?.();
  }

  #adopt(server: WebSocketServer) {
    this.#server = server;
    server.on("error", () => {});
    server.on("connection", (socket) => this.#onConnection(socket));
  }

  /** Resolves the listening server, or null when the port is taken. */
  #listen(): Promise<WebSocketServer | null> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        port: this.#opts.port,
        host: this.#opts.host ?? "127.0.0.1",
        verifyClient: (info: { origin: string }, done: (ok: boolean, code?: number, message?: string) => void) =>
          isAllowedOrigin(info.origin, this.#opts.allowOrigins, { allowLocalhost: this.#opts.allowLocalhost }) ? done(true) : done(false, 403, "Forbidden origin"),
      });
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          server.close();
          resolve(null);
        } else reject(err);
      });
      server.once("listening", () => resolve(server));
    });
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearTimeout(this.#retry);
    this.#retry = undefined;
    for (const [id, p] of this.#calls) this.#settle(id, p, fail("studio_disconnected", "The relay is shutting down."));
    const server = this.#server;
    this.#server = undefined;
    this.#active = this.#candidate = null;
    if (!server) return;
    for (const c of server.clients) c.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  setClient(client: ClientInfo): void {
    this.#client = client;
    if (this.#active) this.#notify(this.#active, METHODS.client, { client });
  }

  call(tool: ToolName, args: unknown, timeoutMs: number): Promise<ToolOutcome> {
    const socket = this.#active;
    if (this.#busy) return Promise.resolve(fail("another_session_connected", "The Studio port is used by another relay."));
    if (!socket) {
      switch (this.state) {
        case "pending":
          return Promise.resolve(fail("studio_not_connected", "The user has not allowed the connection yet.", "Ask the user to allow the connection in the Studio tab."));
        case "denied":
          return Promise.resolve(fail("rejected_by_user", "The user denied the connection."));
        case "mismatch":
          return Promise.resolve(fail("protocol_mismatch", "The relay and the Studio speak different protocol versions.", this.#mismatchHint));
        default:
          return Promise.resolve(fail("studio_not_connected", "No Studio tab is connected."));
      }
    }
    return new Promise((resolve) => {
      const id = this.#nextId++;
      const timer = setTimeout(() => {
        const p = this.#calls.get(id);
        if (p) this.#settle(id, p, fail("timeout", `No answer from the Studio within ${timeoutMs} ms.`));
      }, timeoutMs + RELAY_GRACE_MS);
      this.#calls.set(id, { socket, resolve, timer });
      try {
        socket.send(JSON.stringify({ jsonrpc: "2.0", id, method: METHODS.call, params: { tool, args } }));
      } catch {
        this.#settle(id, this.#calls.get(id)!, fail("studio_disconnected", "Could not reach the Studio tab."));
      }
    });
  }

  #settle(id: number, p: Pending, outcome: ToolOutcome) {
    clearTimeout(p.timer);
    this.#calls.delete(id);
    p.resolve(outcome);
  }

  #failCallsOf(socket: WebSocket) {
    for (const [id, p] of this.#calls) {
      if (p.socket === socket) this.#settle(id, p, fail("studio_disconnected", "The Studio tab disconnected."));
    }
  }

  #send(socket: WebSocket, msg: unknown) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }
  #notify(socket: WebSocket, method: string, params?: unknown) {
    this.#send(socket, { jsonrpc: "2.0", method, params });
  }
  #reply(socket: WebSocket, id: number | string, result: unknown) {
    this.#send(socket, { jsonrpc: "2.0", id, result });
  }
  #replyError(socket: WebSocket, id: number | string, code: number, message: string, data?: unknown) {
    this.#send(socket, { jsonrpc: "2.0", id, error: { code, message, data } });
  }

  #onConnection(socket: WebSocket) {
    socket.on("error", () => {});
    socket.on("message", (raw) => this.#onMessage(socket, raw));
    socket.on("close", () => this.#onClose(socket));
  }

  #onClose(socket: WebSocket) {
    this.#failCallsOf(socket);
    if (this.#active === socket) this.#active = null;
    if (this.#candidate === socket) this.#candidate = null;
  }

  #onMessage(socket: WebSocket, raw: RawData) {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;

    // Response to a relay → tab request; only the session that was asked may answer.
    if (typeof msg.method !== "string") {
      const p = typeof msg.id === "number" ? this.#calls.get(msg.id) : undefined;
      if (p && p.socket === socket) this.#settle(msg.id, p, this.#toOutcome(msg));
      return;
    }

    const hasId = typeof msg.id === "number" || typeof msg.id === "string";
    switch (msg.method) {
      case METHODS.hello:
        if (hasId) this.#onHello(socket, msg.id, msg.params);
        return;
      case METHODS.accept:
        if (!hasId) return;
        if (!this.#hello.has(socket) || (socket !== this.#candidate && socket !== this.#active)) {
          return this.#replyError(socket, msg.id, -32600, "session.hello required first");
        }
        return this.#onAccept(socket, msg.id, msg.params);
      case METHODS.deny:
        if (socket === this.#candidate) this.#candidateState = "denied";
        return;
      default:
        if (hasId) this.#replyError(socket, msg.id, -32601, `Unknown method ${msg.method}`);
    }
  }

  #toOutcome(msg: any): ToolOutcome {
    if (msg.error) return fail("internal", String(msg.error.message ?? "Studio error"));
    const r = msg.result;
    if (r && typeof r === "object" && typeof r.ok === "boolean") return r as ToolOutcome;
    return fail("internal", "The Studio sent a malformed tool result.");
  }

  #onHello(socket: WebSocket, id: number | string, params: any) {
    const supported: unknown = params?.supported;
    if (!Array.isArray(supported) || !supported.every((v) => typeof v === "number")) {
      return this.#replyError(socket, id, -32602, "supported must be an array of numbers");
    }
    // A newer hello replaces a candidate that is still undecided.
    if (this.#candidate && this.#candidate !== socket) {
      const old = this.#candidate;
      this.#candidate = null;
      old.close();
    }
    this.#hello.add(socket);

    if (!supported.includes(PROTOCOL_VERSION)) {
      const relayOlder = supported.length > 0 && PROTOCOL_VERSION < Math.min(...supported);
      this.#mismatchHint = relayOlder
        ? "Update the relay: use `npx @smartc-studio/mcp@latest` in your MCP configuration and restart the agent."
        : "Ask the user to reload the Studio tab.";
      if (socket !== this.#active) {
        this.#candidate = socket;
        this.#candidateState = "mismatch";
      }
      return this.#replyError(socket, id, MISMATCH_ERROR, "Protocol version mismatch", { relayVersion: PROTOCOL_VERSION });
    }

    const occupied = !!this.#active && this.#active !== socket;
    if (this.#active !== socket) {
      this.#candidate = socket;
      this.#candidateState = "pending";
    }
    this.#reply(socket, id, { protocolVersion: PROTOCOL_VERSION, catalogHash: this.#hash, client: this.#client, occupied });
  }

  #onAccept(socket: WebSocket, id: number | string, params: any) {
    if (socket === this.#active) return this.#reply(socket, id, { ok: true });
    if (this.#candidateState !== "pending") {
      return this.#replyError(socket, id, -32600, "Protocol mismatch; cannot accept");
    }
    const previous = this.#active;
    if (previous && params?.takeover !== true) {
      return this.#replyError(socket, id, -32600, "Another session is active; accept with takeover to replace it");
    }
    if (previous) {
      this.#active = null;
      this.#failCallsOf(previous);
      this.#notify(previous, METHODS.takenOver);
      previous.close(TAKEN_OVER_CLOSE, "taken over");
    }
    this.#active = socket;
    this.#candidate = null;
    this.#reply(socket, id, { ok: true });
    if (this.#client) this.#notify(socket, METHODS.client, { client: this.#client });
  }
}
