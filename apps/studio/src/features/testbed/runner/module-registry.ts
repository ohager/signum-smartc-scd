import { dirnameOf, resolveFrom } from "./resolve-path";
import type { CompiledModule } from "./types";
import type { TraceSink } from "./trace";

const RAW_SUFFIX = "?raw";

export interface RegistryOptions {
  /** VFS path → transpiled CommonJS. */
  modules: Record<string, CompiledModule>;
  /** VFS path → raw text, served to `?raw` imports. */
  rawFiles: Record<string, string>;
  /** Bare specifier → module exports. */
  virtuals: Record<string, unknown>;
  /** Receives values from instrumented modules. Omit to evaluate without tracing. */
  trace?: TraceSink;
}

/** UTF-8 safe base64. `btoa` alone throws on any code point above 0xFF. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The text handed to `new Function`, with the trailing comments that make an
 * evaluated module navigable in DevTools.
 *
 * `sourceURL` gives the module its real path in the Sources tree; the inline
 * `sourceMappingURL` makes DevTools display the original TypeScript rather than
 * the instrumented JavaScript, so breakpoints land on lines the user wrote.
 *
 * This does not disturb stack resolution: V8 leaves `Error.stack` addressing
 * generated positions and only DevTools applies the map, and only for display.
 *
 * Exported for testing: building the string is the part with rules in it.
 */
export function buildModuleSource(
  js: string,
  path: string,
  sourceMap: string | undefined,
): string {
  const source = js + "\n//# sourceURL=" + path;
  if (!sourceMap) return source;
  return (
    source + "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," + toBase64(sourceMap)
  );
}

export function createRegistry(opts: RegistryOptions) {
  const cache = new Map<string, { exports: any }>();

  function siblingsOf(path: string): string[] {
    const dir = dirnameOf(path);
    return Object.keys(opts.rawFiles).filter((p) => dirnameOf(p) === dir);
  }

  function loadRaw(importer: string, specifier: string) {
    const bare = specifier.slice(0, -RAW_SUFFIX.length);
    const path = bare.startsWith(".") ? resolveFrom(importer, bare) : bare;
    const text = opts.rawFiles[path];
    if (text === undefined) {
      const siblings = siblingsOf(path);
      throw new Error(
        `Cannot find file "${path}" imported from "${importer}".` +
          (siblings.length ? ` Files in that folder: ${siblings.join(", ")}` : ""),
      );
    }
    // TS's `__importDefault` checks `__esModule` before taking `.default`.
    return { __esModule: true, default: text };
  }

  function resolveModulePath(importer: string, specifier: string): string {
    const base = resolveFrom(importer, specifier);
    for (const candidate of [base, base + ".ts", base + "/index.ts"]) {
      if (opts.modules[candidate]) return candidate;
    }
    throw new Error(`Cannot find module "${specifier}" imported from "${importer}"`);
  }

  function requireFrom(importer: string, specifier: string): unknown {
    if (specifier.endsWith(RAW_SUFFIX)) return loadRaw(importer, specifier);
    if (!specifier.startsWith(".")) {
      if (Object.hasOwn(opts.virtuals, specifier)) return opts.virtuals[specifier];
      throw new Error(
        `Cannot find module "${specifier}" imported from "${importer}". ` +
          `Available: ${Object.keys(opts.virtuals).join(", ")}`,
      );
    }
    return requirePath(resolveModulePath(importer, specifier));
  }

  function requirePath(path: string): unknown {
    const cached = cache.get(path);
    if (cached) return cached.exports;

    const compiled = opts.modules[path];
    if (!compiled) throw new Error(`Cannot find module "${path}"`);

    const module = { exports: {} as any };
    // Cache before evaluating, so a cycle sees partial exports instead of recursing forever.
    cache.set(path, module);

    const fn = new Function(
      "require",
      "exports",
      "module",
      "__v",
      "__ok",
      buildModuleSource(compiled.js, path, compiled.sourceMap),
    );

    const sink = opts.trace;
    const recordValue = sink
      ? (line: number, name: string, value: unknown) => sink.value(path, line, name, value)
      : (_line: number, _name: string, value: unknown) => value;
    const recordOk = sink ? (line: number) => sink.ok(path, line) : () => {};

    fn((spec: string) => requireFrom(path, spec), module.exports, module, recordValue, recordOk);
    return module.exports;
  }

  return { require: requirePath };
}
