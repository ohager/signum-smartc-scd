import { resolveFrom } from "./resolve-path";
import type { CompiledModule } from "./types";

export interface RegistryOptions {
  /** VFS path → transpiled CommonJS. */
  modules: Record<string, CompiledModule>;
  /** VFS path → raw text, served to `?raw` imports. */
  rawFiles: Record<string, string>;
  /** Bare specifier → module exports. */
  virtuals: Record<string, unknown>;
}

export function createRegistry(opts: RegistryOptions) {
  const cache = new Map<string, { exports: any }>();

  function resolveModulePath(importer: string, specifier: string): string {
    const base = resolveFrom(importer, specifier);
    for (const candidate of [base, base + ".ts", base + "/index.ts"]) {
      if (opts.modules[candidate]) return candidate;
    }
    throw new Error(`Cannot find module "${specifier}" imported from "${importer}"`);
  }

  function requireFrom(importer: string, specifier: string): unknown {
    if (!specifier.startsWith(".")) {
      if (specifier in opts.virtuals) return opts.virtuals[specifier];
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

    const fn = new Function("require", "exports", "module", compiled.js + "\n//# sourceURL=" + path);
    fn((spec: string) => requireFrom(path, spec), module.exports, module);
    return module.exports;
  }

  return { require: requirePath };
}
