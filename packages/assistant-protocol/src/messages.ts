import type { AssistantError } from "./errors";

export type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: AssistantError };

export interface ClientInfo {
  name: string;
  version: string;
}

export const METHODS = {
  hello: "session.hello",
  accept: "session.accept",
  deny: "session.deny",
  client: "session.client",
  takenOver: "session.takenOver",
  call: "tool.call",
} as const;

/** JSON-RPC error code for incompatible protocol versions or catalogs. */
export const MISMATCH_ERROR = -32001;

/** WebSocket close code sent to a session that was replaced by a newer one. */
export const TAKEN_OVER_CLOSE = 4001;

export interface RpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}
