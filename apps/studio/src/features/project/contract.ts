import type { FileMetadata } from "@/lib/file-system";

/** The `.smart.c` suffix, matched on the name rather than the stored type. */
export const CONTRACT_EXTENSION = ".smart.c";

/** The fields the rule needs — so tests need no whole FileMetadata. */
export interface ContractCandidate {
  id: string;
  name: string;
  path: string;
}

export interface ContractChoice<T extends ContractCandidate = ContractCandidate> {
  contract: T;
  /** Contracts a rule-breaking workspace has beyond the first. Normally empty. */
  ignored: T[];
}

/**
 * Lowercased first: this predicate is shared with the home page, whose rule
 * has always been case-insensitive.
 */
export function isContractFile(name: string): boolean {
  return name.toLowerCase().endsWith(CONTRACT_EXTENSION);
}

function depthOf(path: string): number {
  return path.split("/").length;
}

/**
 * The project's contract, and anything it had to ignore.
 *
 * A project holds exactly one contract by decision, but workspaces written
 * before that rule can hold several, and those must not break. The choice is
 * deterministic — shallowest first, then alphabetical — because a rail whose
 * subject flickers between renders would be worse than a wrong one.
 *
 * Not the same rule as the home page's `pickMainFile`, which takes the newest
 * contract and falls back to a file of any type: a project card has to open
 * something, while a rail must not invent a subject.
 */
export function pickContract<T extends ContractCandidate>(
  candidates: T[],
): ContractChoice<T> | null {
  const contracts = candidates.filter((file) => isContractFile(file.name));
  if (contracts.length === 0) return null;

  const [contract, ...ignored] = [...contracts].sort(
    (a, b) => depthOf(a.path) - depthOf(b.path) || a.name.localeCompare(b.name),
  );

  return { contract: contract!, ignored };
}

/** The contract of a project, read straight from the file system. */
export function contractOfProject(
  files: FileMetadata[],
): ContractChoice<FileMetadata> | null {
  return pickContract(files);
}
