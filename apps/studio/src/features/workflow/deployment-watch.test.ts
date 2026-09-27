import { describe, it, expect } from "bun:test";
import {
  announceDeployment,
  eventsUrl,
  onDeploymentsChanged,
  pendingDeployment,
  settleDeployment,
  watchChain,
  type EventSocket,
} from "./deployment-watch";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeSocket implements EventSocket {
  onmessage: EventSocket["onmessage"] = null;
  onerror: EventSocket["onerror"] = null;
  onclose: EventSocket["onclose"] = null;
  closed = false;
  close() {
    this.closed = true;
  }
  send(e: string) {
    this.onmessage?.({ data: JSON.stringify({ e }) });
  }
}

describe("pending deployments", () => {
  const deploy = { nodeHost: "http://node", codeHash: "h1", transactionId: "t1" };

  it("holds a deployment until its transaction settles", () => {
    announceDeployment(deploy);
    expect(pendingDeployment("http://node", "h1")).toEqual(deploy);

    settleDeployment(deploy);
    expect(pendingDeployment("http://node", "h1")).toBeNull();
  });

  it("is per node: the same code elsewhere is not pending", () => {
    announceDeployment(deploy);
    expect(pendingDeployment("http://other", "h1")).toBeNull();
    settleDeployment(deploy);
  });

  it("keeps waiting for a newer deploy of the same code", () => {
    announceDeployment(deploy);
    const newer = { ...deploy, transactionId: "t2" };
    announceDeployment(newer);

    settleDeployment(deploy);
    expect(pendingDeployment("http://node", "h1")).toEqual(newer);
    settleDeployment(newer);
  });

  it("tells its listeners", () => {
    let heard = 0;
    const stop = onDeploymentsChanged(() => heard++);
    announceDeployment(deploy);
    settleDeployment(deploy);
    stop();
    announceDeployment(deploy);
    settleDeployment(deploy);
    expect(heard).toBe(2);
  });
});

describe("eventsUrl", () => {
  it("uses the HTTP port plus one, as SIP-50 defaults to", () => {
    expect(eventsUrl("http://localhost:6876")).toBe("ws://localhost:6877/events");
  });

  it("stays on the origin of a node behind a proxy", () => {
    expect(eventsUrl("https://europe.signum.network")).toBe(
      "wss://europe.signum.network/events",
    );
  });

  it("has no answer for a host it cannot parse", () => {
    expect(eventsUrl("not a url")).toBeNull();
  });
});

describe("watchChain", () => {
  const fast = { pollMs: 5, connectTimeoutMs: 20 };

  it("checks on each block the node pushes, and does not poll", async () => {
    const socket = new FakeSocket();
    let checks = 0;
    const stop = watchChain("http://node:6876", () => checks++, {
      ...fast,
      openSocket: () => socket,
    });

    socket.send("CONNECTED");
    socket.send("HEARTBEAT");
    socket.send("BLOCK_PUSHED");
    await wait(40);
    stop();

    expect(checks).toBe(1);
  });

  it("polls when the node has its events switched off", async () => {
    const socket = new FakeSocket();
    let checks = 0;
    const stop = watchChain("http://node:6876", () => checks++, {
      ...fast,
      openSocket: () => socket,
    });

    socket.onerror?.();
    await wait(30);
    stop();

    expect(socket.closed).toBe(true);
    expect(checks).toBeGreaterThan(1);
  });

  it("polls when the node never says it is connected", async () => {
    let checks = 0;
    const stop = watchChain("http://node:6876", () => checks++, {
      ...fast,
      openSocket: () => new FakeSocket(),
    });

    await wait(50);
    stop();

    expect(checks).toBeGreaterThan(1);
  });

  it("polls when the socket cannot even be opened", async () => {
    let checks = 0;
    const stop = watchChain("http://node:6876", () => checks++, {
      ...fast,
      openSocket: () => {
        throw new Error("mixed content");
      },
    });

    await wait(30);
    stop();

    expect(checks).toBeGreaterThan(1);
  });

  it("stops checking once stopped", async () => {
    let checks = 0;
    const stop = watchChain("not a url", () => checks++, fast);
    stop();
    await wait(20);
    expect(checks).toBe(0);
  });
});
