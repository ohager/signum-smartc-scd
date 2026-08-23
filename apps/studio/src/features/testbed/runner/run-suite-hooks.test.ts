import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function collectAndRun(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events;
}

const testEnds = (events: TestEvent[]) => events.filter((e) => e.type === "test:end") as any[];

describe("runSuite hook failure semantics", () => {
  it("runs afterEach when the test body throws", async () => {
    let afterEachRan = false;
    const events = await collectAndRun((api) => {
      api.afterEach(() => {
        afterEachRan = true;
      });
      api.it("throws", () => {
        throw new Error("body failed");
      });
    });
    expect(afterEachRan).toBe(true);
    const end = testEnds(events)[0];
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("body failed");
  });

  it("reports the body's error, not the afterEach's, when both throw", async () => {
    const events = await collectAndRun((api) => {
      api.afterEach(() => {
        throw new Error("cleanup failed");
      });
      api.it("throws", () => {
        throw new Error("body failed");
      });
    });
    const end = testEnds(events)[0];
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("body failed");
  });

  it("reports failed when the body passes but afterEach throws", async () => {
    const events = await collectAndRun((api) => {
      api.afterEach(() => {
        throw new Error("cleanup failed");
      });
      api.it("passes", () => {});
    });
    const end = testEnds(events)[0];
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("cleanup failed");
  });

  it("runs afterEach when beforeEach throws", async () => {
    let afterEachRan = false;
    const events = await collectAndRun((api) => {
      api.beforeEach(() => {
        throw new Error("setup failed");
      });
      api.afterEach(() => {
        afterEachRan = true;
      });
      api.it("t", () => {});
    });
    expect(afterEachRan).toBe(true);
    const end = testEnds(events)[0];
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("setup failed");
  });

  it("handles a falsy thrown value from the body without masking failure", async () => {
    let afterEachRan = false;
    const events = await collectAndRun((api) => {
      api.afterEach(() => {
        afterEachRan = true;
      });
      api.it("throws falsy", () => {
        throw "";
      });
    });
    expect(afterEachRan).toBe(true);
    const end = testEnds(events)[0];
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("");
  });

  it("reports every test in a suite as failed when beforeAll throws", async () => {
    const events = await collectAndRun((api) => {
      api.describe("s", () => {
        api.beforeAll(() => {
          throw new Error("setup blew up");
        });
        api.it("t1", () => {});
        api.it("t2", () => {});
      });
    });
    const ends = testEnds(events);
    expect(ends).toHaveLength(2);
    for (const end of ends) {
      expect(end.status).toBe("failed");
      expect(end.failure.message).toBe("setup blew up");
    }
  });

  it("does not run afterAll when beforeAll throws", async () => {
    let afterAllRan = false;
    await collectAndRun((api) => {
      api.describe("s", () => {
        api.beforeAll(() => {
          throw new Error("setup blew up");
        });
        api.afterAll(() => {
          afterAllRan = true;
        });
        api.it("t1", () => {});
      });
    });
    expect(afterAllRan).toBe(false);
  });

  it("does not prevent a sibling suite from running when beforeAll throws", async () => {
    const events = await collectAndRun((api) => {
      api.describe("broken", () => {
        api.beforeAll(() => {
          throw new Error("setup blew up");
        });
        api.it("t1", () => {});
      });
      api.describe("fine", () => {
        api.it("t2", () => {});
      });
    });
    const ends = testEnds(events);
    expect(ends).toHaveLength(2);
    expect(ends[0].status).toBe("failed");
    expect(ends[1].status).toBe("passed");
  });

  it("emits hook:error and continues with siblings when afterAll throws", async () => {
    const events = await collectAndRun((api) => {
      api.describe("broken", () => {
        api.afterAll(() => {
          throw new Error("teardown blew up");
        });
        api.it("t1", () => {});
      });
      api.describe("fine", () => {
        api.it("t2", () => {});
      });
    });
    const hookError = events.find((e) => e.type === "hook:error") as any;
    expect(hookError).toBeDefined();
    expect(hookError.phase).toBe("afterAll");
    expect(hookError.suite).toEqual(["broken"]);
    expect(hookError.message).toBe("teardown blew up");

    const ends = testEnds(events);
    expect(ends).toHaveLength(2);
    expect(ends[0].status).toBe("passed");
    expect(ends[1].status).toBe("passed");
  });

  it("resolves rather than rejecting in all of the above scenarios", async () => {
    await expect(
      collectAndRun((api) => {
        api.afterEach(() => {
          throw new Error("cleanup failed");
        });
        api.it("throws", () => {
          throw new Error("body failed");
        });
      }),
    ).resolves.toBeDefined();

    await expect(
      collectAndRun((api) => {
        api.describe("s", () => {
          api.beforeAll(() => {
            throw new Error("setup blew up");
          });
          api.it("t1", () => {});
        });
      }),
    ).resolves.toBeDefined();

    await expect(
      collectAndRun((api) => {
        api.describe("s", () => {
          api.afterAll(() => {
            throw new Error("teardown blew up");
          });
          api.it("t1", () => {});
        });
      }),
    ).resolves.toBeDefined();
  });
});
