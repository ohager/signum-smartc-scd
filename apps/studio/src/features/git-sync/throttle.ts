/** `shouldCheck` is true at most once per interval for each project. */
export function createRemoteThrottle(intervalMs: number, now: () => number) {
  const last = new Map<string, number>();
  return {
    shouldCheck(projectId: string): boolean {
      const t = now();
      const prev = last.get(projectId);
      if (prev !== undefined && t - prev < intervalMs) return false;
      last.set(projectId, t);
      return true;
    },
  };
}
