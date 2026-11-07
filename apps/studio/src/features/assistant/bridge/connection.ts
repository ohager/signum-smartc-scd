import {
  DEFAULT_HINTS,
  METHODS,
  MISMATCH_ERROR,
  SUPPORTED_PROTOCOL_VERSIONS,
  TAKEN_OVER_CLOSE,
  type ClientInfo,
  type ToolOutcome,
} from "@smartc-studio/assistant-protocol";
import { createRpc, RpcError, type Rpc, type SocketLike } from "./rpc";

export type ConnectionState =
  | { kind: "idle" }
  | { kind: "connecting"; port: number }
  | { kind: "awaiting-approval"; client: ClientInfo | null; occupied: boolean }
  | { kind: "connected"; client: ClientInfo | null }
  | { kind: "taken-over" }
  | { kind: "mismatch"; action: "reload-studio" | "update-relay" }
  | { kind: "failed"; reason: "unreachable" | "closed" };

export interface ConnectionDeps {
  openSocket: (url: string) => SocketLike;
  onCall: (tool: string, args: unknown) => Promise<ToolOutcome>;
  /** Fires exactly once per transition out of `connected`; the provider ends rounds here. */
  onDisconnected: () => void;
  studioVersion: string;
  catalogHash: string;
  /* Injected so tests drive the backoff deterministically. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/*
 * The only place the relay address is built. Moving to wss://localhost (if browsers
 * start blocking mixed content to loopback) must change this function and nothing else.
 */
export function relayUrl(port: number): string {
  return `ws://127.0.0.1:${port}`;
}

const BACKOFF_MS = [1000, 2000, 5000];

function notConnected(): ToolOutcome {
  return {
    ok: false,
    error: {
      code: "studio_not_connected",
      message: "The Studio connection is not active.", // i18n-ignore
      hint: DEFAULT_HINTS.studio_not_connected,
    },
  };
}

function internal(err: unknown): ToolOutcome {
  return {
    ok: false,
    error: { code: "internal", message: err instanceof Error ? err.message : String(err), hint: DEFAULT_HINTS.internal },
  };
}

export class AssistantConnection {
  #deps: ConnectionDeps;
  #state: ConnectionState = { kind: "idle" };
  #listeners = new Set<(s: ConnectionState) => void>();
  #sock: SocketLike | null = null;
  #rpc: Rpc | null = null;
  #port = 0;
  #opened = false;
  #reconnecting = false;
  #retry = 0;
  #timer: unknown = null;
  #accepting = false;
  /* The user's allow decision and the client it applied to, to re-accept silently after a drop. */
  #allowed = false;
  #client: ClientInfo | null = null;

  constructor(deps: ConnectionDeps) {
    this.#deps = deps;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  subscribe(listener: (s: ConnectionState) => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  connect(port: number): void {
    this.#teardown();
    this.#allowed = false;
    this.#client = null;
    this.#reconnecting = false;
    this.#retry = 0;
    this.#port = port;
    this.#set({ kind: "connecting", port });
    this.#open();
  }

  allow(): void {
    const s = this.#state;
    if (s.kind !== "awaiting-approval" || !this.#rpc || this.#accepting) return;
    this.#accept(s.occupied);
  }

  deny(): void {
    if (this.#state.kind !== "awaiting-approval") return;
    this.#rpc?.notify(METHODS.deny, {});
    this.#allowed = false;
    this.#clearTimer();
    /*
     * The socket stays open on purpose: the relay answers later tool calls with
     * rejected_by_user only while the denied tab is still attached, which tells the
     * agent to stop instead of retrying. disconnect() or a new connect() closes it.
     */
    this.#set({ kind: "idle" });
  }

  disconnect(): void {
    this.#teardown();
    this.#allowed = false;
    this.#set({ kind: "idle" });
  }

  #set(next: ConnectionState): void {
    const prev = this.#state;
    this.#state = next;
    if (prev.kind === "connected" && next.kind !== "connected") {
      try {
        this.#deps.onDisconnected();
      } catch {
        /* the provider's cleanup must not wedge the state machine */
      }
    }
    for (const l of [...this.#listeners]) {
      try {
        l(next);
      } catch {
        /* one broken listener must not starve the others */
      }
    }
  }

  #clearTimer(): void {
    if (this.#timer !== null) (this.#deps.clearTimeout ?? clearTimeout)(this.#timer as never);
    this.#timer = null;
  }

  /** Detaches the socket so late callbacks from it are inert. */
  #teardown(): void {
    this.#clearTimer();
    const sock = this.#sock;
    this.#rpc?.dispose("disconnected");
    this.#sock = null;
    this.#rpc = null;
    this.#accepting = false;
    if (sock) {
      sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
      try {
        sock.close();
      } catch {
        /* already closed */
      }
    }
  }

  #open(): void {
    this.#opened = false;
    let sock: SocketLike;
    try {
      sock = this.#deps.openSocket(relayUrl(this.#port));
    } catch {
      this.#lost(null);
      return;
    }
    this.#sock = sock;
    this.#rpc = createRpc(sock, {
      onRequest: (method, params) => this.#onRequest(method, params),
      onNotification: (method, params) => this.#onNotification(method, params),
    });
    sock.onopen = () => {
      if (this.#sock !== sock) return;
      this.#opened = true;
      void this.#hello(sock);
    };
    sock.onclose = (e) => {
      if (this.#sock === sock) this.#lost(e.code);
    };
    sock.onerror = () => {
      if (this.#sock === sock && !this.#opened) this.#lost(null);
    };
  }

  async #hello(sock: SocketLike): Promise<void> {
    const rpc = this.#rpc!;
    let result: any;
    try {
      result = await rpc.request(METHODS.hello, {
        supported: SUPPORTED_PROTOCOL_VERSIONS,
        catalogHash: this.#deps.catalogHash,
        studioVersion: this.#deps.studioVersion,
      });
    } catch (err) {
      if (this.#sock !== sock) return;
      if (err instanceof RpcError && err.code === MISMATCH_ERROR) {
        const relayVersion = Number((err.data as { relayVersion?: unknown } | undefined)?.relayVersion);
        const newer = relayVersion > Math.max(...SUPPORTED_PROTOCOL_VERSIONS);
        this.#teardown();
        this.#set({ kind: "mismatch", action: newer ? "reload-studio" : "update-relay" });
      } else {
        this.#teardown();
        this.#set({ kind: "failed", reason: "closed" });
      }
      return;
    }
    if (this.#sock !== sock) return;

    const client: ClientInfo | null = result?.client ?? null;
    const occupied = result?.occupied === true;
    const sameClient = (client?.name ?? null) === (this.#client?.name ?? null);
    const reAccept = this.#reconnecting && this.#allowed && !occupied && sameClient;
    this.#reconnecting = false;
    this.#retry = 0;
    this.#client = client;
    if (reAccept) {
      this.#accept(false);
    } else {
      this.#allowed = false;
      this.#set({ kind: "awaiting-approval", client, occupied });
    }
  }

  #accept(takeover: boolean): void {
    const sock = this.#sock;
    const rpc = this.#rpc;
    if (!sock || !rpc) return;
    this.#accepting = true;
    rpc.request(METHODS.accept, { takeover }).then(
      () => {
        if (this.#sock !== sock) return;
        this.#accepting = false;
        this.#allowed = true;
        this.#set({ kind: "connected", client: this.#client });
      },
      () => {
        if (this.#sock !== sock) return;
        // The relay refused (e.g. someone else became active meanwhile); do not loop.
        this.#teardown();
        this.#set({ kind: "failed", reason: "closed" });
      },
    );
  }

  /** The socket closed or never opened. Decide between retry, failure and silence. */
  #lost(code: number | null): void {
    const prev = this.#state;
    this.#teardown();
    if (code === TAKEN_OVER_CLOSE && (prev.kind === "connected" || prev.kind === "awaiting-approval")) {
      this.#set({ kind: "taken-over" });
      return;
    }
    if (prev.kind === "connected" || prev.kind === "awaiting-approval") {
      this.#reconnecting = true;
      this.#retry = 0;
      this.#set({ kind: "connecting", port: this.#port });
      this.#scheduleRetry();
    } else if (prev.kind === "connecting") {
      if (this.#reconnecting) this.#scheduleRetry();
      else this.#set({ kind: "failed", reason: this.#opened ? "closed" : "unreachable" });
    }
    /* idle (denied), taken-over, mismatch and failed stay as they are. */
  }

  #scheduleRetry(): void {
    if (this.#retry >= BACKOFF_MS.length) {
      this.#reconnecting = false;
      this.#set({ kind: "failed", reason: "closed" });
      return;
    }
    const delay = BACKOFF_MS[this.#retry++]!;
    this.#timer = (this.#deps.setTimeout ?? setTimeout)(() => {
      this.#timer = null;
      this.#open();
    }, delay);
  }

  async #onRequest(method: string, params: unknown): Promise<unknown> {
    if (method !== METHODS.call) throw new Error(`Unknown method ${method}`);
    if (this.#state.kind !== "connected") return notConnected();
    const { tool, args } = (params ?? {}) as { tool?: unknown; args?: unknown };
    try {
      return await this.#deps.onCall(String(tool), args);
    } catch (err) {
      // A tool failure is a tool outcome; a JSON-RPC error would read as a relay fault to the agent.
      return internal(err);
    }
  }

  #onNotification(method: string, params: unknown): void {
    if (method === METHODS.takenOver) {
      if (this.#state.kind !== "connected" && this.#state.kind !== "awaiting-approval") return;
      this.#teardown();
      this.#set({ kind: "taken-over" });
    } else if (method === METHODS.client) {
      const client = ((params ?? {}) as { client?: ClientInfo | null }).client ?? null;
      this.#client = client;
      const s = this.#state;
      if (s.kind === "connected") this.#set({ kind: "connected", client });
      else if (s.kind === "awaiting-approval") this.#set({ ...s, client });
    }
  }
}
