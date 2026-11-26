import { describe, expect, it } from "bun:test";
import { handlesEnterItself } from "./submit-on-enter";

const el = (tagName: string, role?: string) => ({ tagName, getAttribute: (n: string) => (n === "role" ? (role ?? null) : null) }) as unknown as Element;

describe("handlesEnterItself", () => {
  it("leaves Enter to a focused button", () => expect(handlesEnterItself(el("BUTTON"))).toBe(true));
  it("leaves Enter to a focused link", () => expect(handlesEnterItself(el("A"))).toBe(true));
  it("leaves Enter to a focused tab", () => expect(handlesEnterItself(el("DIV", "tab"))).toBe(true));
  it("submits from a text input", () => expect(handlesEnterItself(el("INPUT"))).toBe(false));
  it("submits when nothing is focused", () => expect(handlesEnterItself(null)).toBe(false));
});
