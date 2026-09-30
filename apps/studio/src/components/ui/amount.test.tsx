import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Amount } from "./amount";
import { resetMessages, setMessages } from "@/i18n/runtime";

afterEach(() => resetMessages());

describe("Amount", () => {
  it("formats in the active locale, not the browser's", () => {
    setMessages("de", {});
    expect(renderToStaticMarkup(<Amount amount="1234.5" />)).toContain(">1.234,5<");
  });
});
