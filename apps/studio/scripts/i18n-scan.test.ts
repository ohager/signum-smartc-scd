import { describe, expect, it } from "bun:test";
import { scanSource } from "./i18n-scan";

describe("scanSource", () => {
  it("finds JSX text, labelled attributes, toast messages and label properties", () => {
    const src = [
      `export function A() {`,
      `  toast.success("File saved");`,
      `  const items = [{ label: "New file" }];`,
      `  return <div title="Open settings">Hello world <b>{name}</b></div>;`,
      `}`,
    ].join("\n");
    expect(scanSource("a.tsx", src).map((f) => f.text)).toEqual([
      "File saved",
      "New file",
      "Open settings",
      "Hello world",
    ]);
  });

  it("ignores translated text, symbols, class names and marked lines", () => {
    const src = [
      `export function B() {`,
      `  const x = t("common.save");`,
      `  // i18n-ignore`,
      `  const brand = { label: "SmartC" };`,
      `  return <div className="flex gap-2">{x} · → 42</div>;`,
      `}`,
    ].join("\n");
    expect(scanSource("b.tsx", src)).toEqual([]);
  });

  it("finds literals inside conditionals and fallbacks", () => {
    const src = [
      `export function C() {`,
      `  const a = ok ? "Code hash copied" : "Copy code hash";`,
      `  const b = err?.message || "Failed to deploy contract";`,
      `  return <div aria-label={copied ? "Hash copied" : "Copy hash"}>{n > 1 ? \`Each run of \${n}\` : "Each run"}</div>;`,
      `}`,
    ].join("\n");
    expect(scanSource("c.tsx", src).map((f) => f.text)).toEqual([
      "Code hash copied",
      "Copy code hash",
      "Failed to deploy contract",
      "Hash copied",
      "Copy hash",
      "Each run of",
      "Each run",
    ]);
  });
});
