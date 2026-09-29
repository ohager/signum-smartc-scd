import { afterEach, describe, expect, it } from "bun:test";
import { collectDocs, localizeDocs } from "./doc-walk";
import { resetMessages, setMessages } from "./runtime";

afterEach(() => resetMessages());

const table = {
  getNextTx: {
    signature: "long getNextTx()",
    detail: "Next transaction",
    documentation: "Returns the next id.",
    params: [{ name: "tx", documentation: "A transaction" }, { name: "empty", documentation: "" }],
  },
  program: {
    detail: "Contract metadata",
    documentation: "",
    snippet: "${1:x}",
    properties: { name: { detail: "Program name", documentation: "Set the name." } },
  },
  JMP: { title: "Jump", group: "Program flow", stepFee: 1, documentation: "Jumps." },
};

describe("collectDocs", () => {
  it("collects every non-empty text field under section.symbol.field", () => {
    expect(collectDocs("s", table)).toEqual({
      getNextTx: {
        detail: "Next transaction",
        documentation: "Returns the next id.",
        params: { tx: "A transaction" },
      },
      program: {
        detail: "Contract metadata",
        properties: { name: { detail: "Program name", documentation: "Set the name." } },
      },
      JMP: { title: "Jump", group: "Program flow", documentation: "Jumps." },
    });
  });
});

describe("localizeDocs", () => {
  it("returns the English table unchanged while English is active", () => {
    expect(localizeDocs("editor-docs.s", table)).toEqual(table);
  });

  it("replaces fields the active locale translates and keeps the rest", () => {
    setMessages("de", {
      "editor-docs": {
        s: {
          getNextTx: { detail: "Nächste Transaktion", params: { tx: "Eine Transaktion" } },
          program: { properties: { name: { detail: "Programmname" } } },
          JMP: { title: "Springen" },
        },
      },
    });
    const out = localizeDocs("editor-docs.s", table);
    expect(out.getNextTx.detail).toBe("Nächste Transaktion");
    expect(out.getNextTx.documentation).toBe("Returns the next id.");
    expect(out.getNextTx.params[0]).toEqual({ name: "tx", documentation: "Eine Transaktion" });
    expect(out.getNextTx.signature).toBe("long getNextTx()");
    expect(out.program.properties.name.detail).toBe("Programmname");
    expect(out.program.snippet).toBe("${1:x}");
    expect(out.JMP).toEqual({ title: "Springen", group: "Program flow", stepFee: 1, documentation: "Jumps." });
  });

  it("does not modify the table it was given", () => {
    setMessages("de", { "editor-docs": { s: { JMP: { title: "Springen" } } } });
    localizeDocs("editor-docs.s", table);
    expect(table.JMP.title).toBe("Jump");
  });
});
