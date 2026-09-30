import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { T } from "./T";
import { resetMessages, setMessages } from "./runtime";

afterEach(() => resetMessages());

describe("<T>", () => {
  it("renders tags as the given elements", () => {
    setMessages("de", { x: { intro: "Drücke <code>F10</code>, {who}." } });
    const html = renderToStaticMarkup(
      // @ts-expect-error — fixture key, not in the generated key union
      <T k="x.intro" params={{ who: "Ada" }} components={{ code: <code /> }} />,
    );
    expect(html).toBe("Drücke <code>F10</code>, Ada.");
  });

  it("renders a parameter that looks like markup as text", () => {
    setMessages("de", { x: { file: "Datei <code>{name}</code> gespeichert" } });
    const html = renderToStaticMarkup(
      // @ts-expect-error — fixture key
      <T k="x.file" params={{ name: "<code>evil</code>" }} components={{ code: <code /> }} />,
    );
    expect(html).toBe("Datei <code>&lt;code&gt;evil&lt;/code&gt;</code> gespeichert");
  });

  it("falls back to the key when the message is missing", () => {
    // @ts-expect-error — fixture key
    expect(renderToStaticMarkup(<T k="x.missing" />)).toBe("x.missing");
  });
});
