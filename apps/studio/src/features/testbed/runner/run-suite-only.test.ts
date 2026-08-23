import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function statuses(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events.filter((e) => e.type === "test:end").map((e: any) => e.status);
}

describe("only semantics", () => {
  it("runs everything when no only is present", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.it("a1", () => {});
          api.it("a2", () => {});
        });
      }),
    ).toEqual(["passed", "passed"]);
  });

  it("it.only runs just that test", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.it("a1", () => {});
          api.it.only("a2", () => {});
        });
      }),
    ).toEqual(["skipped", "passed"]);
  });

  it("describe.only runs every test inside it and skips the rest", async () => {
    expect(
      await statuses((api) => {
        api.describe.only("A", () => {
          api.it("a1", () => {});
          api.it("a2", () => {});
        });
        api.describe("B", () => {
          api.it("b1", () => {});
        });
      }),
    ).toEqual(["passed", "passed", "skipped"]);
  });

  it("an only nested in a plain suite still wins", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.describe("B", () => {
            api.it.only("b1", () => {});
          });
          api.it("a1", () => {});
        });
      }),
    ).toEqual(["passed", "skipped"]);
  });
});
