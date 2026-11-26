import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Test helper: the text of a fixture contract next to this file. */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dir, `${name}.smart.c`), "utf8");
}
