/**
 * Deployments sent from this session that the chain does not list yet.
 *
 * The chain lists a contract by code hash only once its creating transaction
 * is in a block — a few minutes after the deploy flow reports success. Without
 * this the Deploy cell would say "not deployed" through exactly the minutes the
 * user is waiting to see it change.
 *
 * The deploy flow announces; the rail watches. The watch belongs to the rail's
 * hook, not to the flow, so it survives the flow unmounting and resumes when
 * the user comes back to the project. Held for the session only: after a
 * reload the contract has usually landed, and the chain says so on its own.
 */

export interface PendingDeployment {
  /** The node the deploy went through; the same code has other answers elsewhere. */
  nodeHost: string;
  codeHash: string;
  transactionId: string;
}

const pending = new Map<string, PendingDeployment>();
const listeners = new Set<() => void>();

export const deploymentKey = (nodeHost: string, codeHash: string) =>
  `${nodeHost}|${codeHash}`;

function notify() {
  for (const listener of listeners) listener();
}

export function announceDeployment(deployment: PendingDeployment): void {
  pending.set(deploymentKey(deployment.nodeHost, deployment.codeHash), deployment);
  notify();
}

export function pendingDeployment(
  nodeHost: string,
  codeHash: string,
): PendingDeployment | null {
  return pending.get(deploymentKey(nodeHost, codeHash)) ?? null;
}

/**
 * Ends the wait for this transaction. A newer deploy of the same code keeps
 * waiting — its watch settles it, not the one for the older transaction.
 */
export function settleDeployment(deployment: PendingDeployment): void {
  const key = deploymentKey(deployment.nodeHost, deployment.codeHash);
  if (pending.get(key)?.transactionId !== deployment.transactionId) return;
  pending.delete(key);
  notify();
}

export function onDeploymentsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Where the node would serve its SIP-50 events: the HTTP port plus one when a
 * port is given, and the same origin otherwise (a node behind a proxy).
 */
export function eventsUrl(nodeHost: string): string | null {
  let url: URL;
  try {
    url = new URL(nodeHost);
  } catch {
    return null;
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  if (url.port) url.port = String(Number(url.port) + 1);
  url.pathname = "/events";
  url.search = "";
  url.hash = "";
  return url.toString();
}

/** The bit of `WebSocket` the watch uses — keeps it testable. */
export interface EventSocket {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close(): void;
}

export interface WatchOptions {
  openSocket?: (url: string) => EventSocket;
  pollMs?: number;
  connectTimeoutMs?: number;
}

export const POLL_INTERVAL_MS = 10_000;
const CONNECT_TIMEOUT_MS = 5_000;

/**
 * Calls `check` on every new block the node announces, or every ten seconds
 * when it announces nothing.
 *
 * SIP-50 events are optional on a node (`API.WebsocketEnable`), so the socket
 * is only an offer: no `CONNECTED` in time, an error or a dropped connection
 * all fall back to polling for the rest of the watch. The two never run
 * together.
 */
export function watchChain(
  nodeHost: string,
  check: () => void,
  {
    openSocket = (url) => new WebSocket(url) as unknown as EventSocket,
    pollMs = POLL_INTERVAL_MS,
    connectTimeoutMs = CONNECT_TIMEOUT_MS,
  }: WatchOptions = {},
): () => void {
  let stopped = false;
  let socket: EventSocket | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let giveUp: ReturnType<typeof setTimeout> | undefined;

  const poll = () => {
    if (stopped || interval) return;
    clearTimeout(giveUp);
    const dropped = socket;
    socket = null;
    dropped?.close();
    interval = setInterval(check, pollMs);
  };

  const url = eventsUrl(nodeHost);
  if (url) {
    try {
      socket = openSocket(url);
    } catch {
      // A malformed or blocked URL (mixed content) throws right here.
    }
  }

  if (!socket) {
    poll();
  } else {
    giveUp = setTimeout(poll, connectTimeoutMs);
    socket.onerror = poll;
    socket.onclose = poll;
    socket.onmessage = ({ data }) => {
      let event: string | undefined;
      try {
        event = JSON.parse(String(data)).e;
      } catch {
        return;
      }
      if (event === "CONNECTED") clearTimeout(giveUp);
      if (event === "BLOCK_PUSHED") check();
    };
  }

  return () => {
    stopped = true;
    clearTimeout(giveUp);
    clearInterval(interval);
    const open = socket;
    socket = null;
    open?.close();
  };
}
