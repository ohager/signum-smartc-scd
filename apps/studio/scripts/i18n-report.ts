#!/usr/bin/env bun
/** Per locale: translated keys out of English's, per namespace. `--missing <id>` lists the gaps. */
import en from "../src/i18n/locales/en/complete";
import { compareLocale, loadLocaleDirs } from "../src/i18n/consistency";
import { flattenMessages } from "../src/i18n/flatten";

const total = flattenMessages(en);
const namespaces = Object.keys(en);
const listMissing = process.argv.includes("--missing");
const missingFor = process.argv[process.argv.indexOf("--missing") + 1];

for (const [id, messages] of await loadLocaleDirs()) {
  if (id === "en") continue;
  const { missing } = compareLocale(en, messages);
  if (listMissing) {
    if (id === missingFor) missing.forEach((k) => console.log(k));
    continue;
  }
  const done = total.size - missing.length;
  const pct = total.size ? Math.floor((done / total.size) * 100) : 100;
  const perNs = namespaces
    .map((ns) => {
      const all = [...total.keys()].filter((k) => k.startsWith(`${ns}.`)).length;
      const gap = missing.filter((k) => k.startsWith(`${ns}.`)).length;
      return gap ? `${ns} ${all - gap}/${all}` : null;
    })
    .filter(Boolean)
    .join(", ");
  console.log(`${id.padEnd(6)} ${String(pct).padStart(3)}%  ${done}/${total.size}${perNs ? `   ${perNs}` : ""}`);
}
