import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterMark } from "./register-mark";
import { faviconSvg } from "./register-geometry";

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("RegisterMark", () => {
  it("draws the memory map above 16px: four empty cells, eleven lit, two of them the ends", () => {
    const html = renderToStaticMarkup(<RegisterMark size={56} />);
    expect(count(html, 'data-cell="ghost"')).toBe(4);
    expect(count(html, 'data-cell="lit"')).toBe(9);
    expect(count(html, 'data-cell="end"')).toBe(2);
  });

  it("switches to the gapless pixel version at 16px and below", () => {
    for (const size of [16, 12]) {
      const html = renderToStaticMarkup(<RegisterMark size={size} />);
      expect(count(html, 'data-cell="ghost"')).toBe(0);
      expect(count(html, 'data-cell="lit"') + count(html, 'data-cell="end"')).toBe(11);
      expect(html).toContain('shape-rendering="crispEdges"');
    }
  });

  it("builds the S in pen order when animated", () => {
    const html = renderToStaticMarkup(<RegisterMark size={56} animate />);
    expect(html).toContain("register-build");
    expect(html).toContain("--i:10");
  });

  it("is hidden from assistive tech unless labelled", () => {
    expect(renderToStaticMarkup(<RegisterMark size={20} />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<RegisterMark size={20} label="Studio" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="Studio"');
  });
});

describe("brand assets", () => {
  const src = path.join(import.meta.dir, "../..");

  it("ships the favicon generated from the mark's geometry", () => {
    expect(readFileSync(path.join(src, "favicon.svg"), "utf8")).toBe(faviconSvg());
  });

  it("links the favicon and draws the mark in the splash", () => {
    const html = readFileSync(path.join(src, "index.html"), "utf8");
    expect(html).toContain('href="./favicon.svg"');
    expect(count(html, 'class="rg-ghost"')).toBe(4);
    expect(count(html, 'class="rg-cell')).toBe(11);
  });

  it("no longer references the old raster logo", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|html|css)$/.test(name) && !name.endsWith(".test.tsx") && readFileSync(p, "utf8").includes("logo.webp")) hits.push(p);
      }
    };
    walk(src);
    expect(hits).toEqual([]);
  });
});
