/** POSIX path helpers over VFS paths, which are absolute (`/proj/tests/a.test.ts`). */

export function dirnameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/** Collapse `.` and `..` segments. A leading slash is preserved. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
}

/** Resolve a relative specifier against the importing module's path. */
export function resolveFrom(importerPath: string, specifier: string): string {
  return normalizePath(dirnameOf(importerPath) + "/" + specifier);
}
