/*
 * Minimal JSON-RPC 2.0 peer over an injected socket. It is deliberately tiny and
 * transport-agnostic so the connection logic can be tested with a fake socket pair
 * and the same code runs on a browser WebSocket.
 */
export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export interface RpcHandlers {
  onRequest(method: string, params: unknown): Promise<unknown>;
  onNotification(method: string, params: unknown): void;
}

export interface Rpc {
  request(method: string, params: unknown): Promise<unknown>;
  notify(method: string, params: unknown): void;
  dispose(reason: string): void;
}

/** Error of a JSON-RPC error response; keeps `code` and `data` for callers that branch on them. */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export function createRpc(socket: SocketLike, handlers: RpcHandlers): Rpc {
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let disposed = false;

  const send = (msg: unknown) => socket.send(JSON.stringify(msg));
  const safeSend = (msg: unknown) => {
    try {
      send(msg);
    } catch {
      /* the socket is gone; the close handler owns recovery */
    }
  };

  socket.onmessage = (e) => {
    // Frames come from another process; nothing in them may throw into the socket callback.
    let msg: any;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;

    if (typeof msg.method === "string") {
      const hasId = typeof msg.id === "number" || typeof msg.id === "string";
      if (!hasId) {
        try {
          handlers.onNotification(msg.method, msg.params);
        } catch {
          /* a notification handler must not break the stream */
        }
        return;
      }
      const id = msg.id;
      Promise.resolve()
        .then(() => handlers.onRequest(msg.method, msg.params))
        .then(
          (result) => safeSend({ jsonrpc: "2.0", id, result: result ?? null }),
          (err) => safeSend({ jsonrpc: "2.0", id, error: { code: -32603, message: err instanceof Error ? err.message : String(err) } }),
        );
      return;
    }

    const p = typeof msg.id === "number" ? pending.get(msg.id) : undefined;
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error && typeof msg.error === "object") {
      p.reject(new RpcError(String(msg.error.message ?? "RPC error"), Number(msg.error.code), msg.error.data));
    } else {
      p.resolve(msg.result);
    }
  };

  return {
    request(method, params) {
      if (disposed) return Promise.reject(new Error("disposed"));
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        try {
          send({ jsonrpc: "2.0", id, method, params });
        } catch (err) {
          pending.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    notify(method, params) {
      if (!disposed) safeSend({ jsonrpc: "2.0", method, params });
    },
    dispose(reason) {
      disposed = true;
      for (const p of pending.values()) p.reject(new Error(reason));
      pending.clear();
      socket.onmessage = null;
    },
  };
}
