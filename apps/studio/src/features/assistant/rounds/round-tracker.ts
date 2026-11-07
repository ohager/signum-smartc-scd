import { AssistantFailure } from "../tools/errors";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RoundHooks {
  start(projectId: string): Promise<{ roundId: string; checkpointId: string }>;
  end(projectId: string, roundId: string, reason: "idle" | "takeover" | "disconnect"): Promise<void>;
}

interface ProjectState {
  round: { roundId: string; startedAt: number } | null;
  inFlight: number;
  timer: unknown;
  /** Shared by every write that arrives while `hooks.start` is pending. */
  starting: Promise<void> | null;
  tookOver: boolean;
}

/*
 * MCP has no notion of a turn, so a "round" is inferred per project: it starts with
 * the agent's first write and ends after `idleMs` without any agent call, or when the
 * user takes over. The tracker is pure state plus an injected clock so the timing is
 * deterministic in tests; checkpointing and locking live behind `RoundHooks`.
 */
export class RoundTracker {
  private readonly projects = new Map<string, ProjectState>();

  constructor(
    private readonly opts: {
      idleMs: number;
      clock: Clock;
      hooks: RoundHooks;
    },
  ) {}

  private state(projectId: string): ProjectState {
    let s = this.projects.get(projectId);
    if (!s) {
      s = { round: null, inFlight: 0, timer: null, starting: null, tookOver: false };
      this.projects.set(projectId, s);
    }
    return s;
  }

  active(projectId: string): { roundId: string; startedAt: number } | null {
    return this.projects.get(projectId)?.round ?? null;
  }

  async begin(projectId: string, kind: "read" | "write"): Promise<void> {
    const s = this.state(projectId);

    if (kind === "write") {
      if (s.tookOver) {
        s.tookOver = false;
        throw new AssistantFailure("user_took_over", "The user took over. Re-read the files and ask before writing again.");
      }
      if (!s.round) {
        /*
         * Two concurrent first writes must not checkpoint twice, so they share one
         * start. Whoever created it clears it, success or failure, so a failed
         * start can be retried.
         */
        s.starting ??= this.opts.hooks
          .start(projectId)
          .then(({ roundId }) => {
            s.round = { roundId, startedAt: this.opts.clock.now() };
          })
          .finally(() => {
            s.starting = null;
          });
        await s.starting;
      }
    }

    // A read with no round does nothing, but still counts so a later finish balances.
    this.cancelTimer(s);
    s.inFlight++;
  }

  finish(projectId: string): void {
    const s = this.projects.get(projectId);
    // After takeover/end the in-flight count was reset; a late finish must not go negative.
    if (!s || s.inFlight === 0) return;
    s.inFlight--;
    if (s.inFlight === 0 && s.round) this.armTimer(projectId, s);
  }

  async takeOver(projectId: string): Promise<void> {
    const s = this.state(projectId);
    // Set even with no round: the user may take over between rounds.
    s.tookOver = true;
    await this.endRound(projectId, s, "takeover");
  }

  async endAll(reason: "disconnect"): Promise<void> {
    await Promise.all([...this.projects.entries()].map(([id, s]) => this.endRound(id, s, reason)));
  }

  private armTimer(projectId: string, s: ProjectState): void {
    this.cancelTimer(s);
    s.timer = this.opts.clock.setTimeout(() => {
      s.timer = null;
      // Hook failures are the hook owner's to surface; an idle timer has no caller to throw to.
      void this.endRound(projectId, s, "idle").catch(() => {});
    }, this.opts.idleMs);
  }

  private cancelTimer(s: ProjectState): void {
    if (s.timer !== null) {
      this.opts.clock.clearTimeout(s.timer);
      s.timer = null;
    }
  }

  private async endRound(projectId: string, s: ProjectState, reason: "idle" | "takeover" | "disconnect"): Promise<void> {
    this.cancelTimer(s);
    const round = s.round;
    if (!round) return;
    s.round = null;
    s.inFlight = 0;
    await this.opts.hooks.end(projectId, round.roundId, reason);
  }
}
