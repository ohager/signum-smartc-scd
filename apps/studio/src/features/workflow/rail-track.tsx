import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CellTone } from "./rail-cells";
import { railMark } from "./rail-marks";

export interface Stop {
  id: string;
  label: string;
  fact: string;
  tone: CellTone;
  here: boolean;
  /** Absent `go`: the destination cannot be entered. */
  barred: boolean;
  hint: string;
  pulsing?: boolean;
  go?: () => void;
}

/*
 * The drawing is 1:1 with its CSS box, so the viewBox units below are pixels
 * and the type is set in real sizes rather than scaled ones.
 *
 * The vertical rhythm: 8 from dot to name, 16 from name to fact, 11 from fact
 * to the return line. An earlier version packed four levels into 48px at a
 * line height of 1.04, which is what made the rail look squeezed into the
 * header rather than placed in it.
 */
const X = [58, 172, 286, 410];
const WIDTH = 468;
const HEIGHT = 64;
const TRACK_Y = 11;
/** One stop's share of the width — the buttons are cut from this, not guessed. */
const STOP_WIDTH = 114;
const NAME_Y = 31;
const FACT_Y = 47;
const LOOP_Y = 58;

const FACT_COLOR: Record<CellTone, string> = {
  good: "var(--green)",
  bad: "var(--mag)",
  neutral: "var(--dim)",
};

/** State is never carried by colour alone. A neutral fact claims nothing. */
const FACT_GLYPH: Record<CellTone, string> = {
  good: "✓ ",
  bad: "● ",
  neutral: "",
};

/**
 * Write · Test · Simulate → Deploy, drawn as one picture.
 *
 * One SVG rather than four bordered boxes, because the statement is the shape:
 * the first three sit on a track that returns to its own start — they repeat
 * until the contract is right — and Deploy is outside that loop, past a break,
 * because it happens once and costs money.
 *
 * It is drawn in the house vocabulary and nothing else. 1px hairlines in
 * `--border-2`, because the 2px weight belongs to the corner brackets and to
 * nothing else in this application. Round stops, because round is allowed only
 * for what is round by nature — a status light is, and the climate picker
 * already reads as dots with the active one ringed. No glow behind the current
 * stage: the ring says it, and a glow would say it in a language Dawn cannot
 * speak.
 *
 * The drawing is decoration. Transparent buttons lie over it, so tooltips,
 * focus rings, `aria-current` and `disabled` behave as they do everywhere
 * else, and hovering one draws a hairline around it — the only thing hover is
 * allowed to change here.
 */
export function RailTrack({ stops }: { stops: Stop[] }) {
  return (
    <div className="relative h-[64px] w-[468px] shrink-0">
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="absolute inset-0 h-full w-full"
      >
        <line
          x1={X[0]}
          y1={TRACK_Y}
          x2={X[2]}
          y2={TRACK_Y}
          stroke="var(--border-2)"
          strokeWidth={1}
        />
        {/* The break: Deploy is reachable from the loop, not part of it. */}
        <line
          x1={306}
          y1={TRACK_Y}
          x2={374}
          y2={TRACK_Y}
          stroke="var(--border-1)"
          strokeWidth={1}
          strokeDasharray="2 5"
        />
        <path d={`M384 ${TRACK_Y} l-7 -4 v8 z`} fill="var(--border-2)" />

        {/* The loop: these three repeat, and the arrow says where back is. */}
        <path
          d={`M340 48 V${LOOP_Y - 4} Q340 ${LOOP_Y} 336 ${LOOP_Y} H16 Q12 ${LOOP_Y} 12 ${LOOP_Y - 4} V48`}
          fill="none"
          stroke="var(--border-2)"
          strokeWidth={1}
        />
        <path d="M12 41 l-4 7 h8 z" fill="var(--border-2)" />

        {stops.map((stop, index) => {
          const cx = X[index]!;
          const mark = railMark(stop.tone);
          return (
            <g key={stop.id} opacity={stop.barred ? 0.4 : 1}>
              {stop.here && (
                <circle
                  cx={cx}
                  cy={TRACK_Y}
                  r={8}
                  fill="none"
                  stroke="var(--accent-2)"
                  strokeWidth={1}
                />
              )}
              {/* Filled means the stage reported something, hollow that it has
                  not answered. Nothing here may read as "done". */}
              <circle
                cx={cx}
                cy={TRACK_Y}
                r={4}
                fill={mark.fill}
                stroke={mark.stroke}
                strokeWidth={1}
              />
              <text
                x={cx}
                y={NAME_Y}
                textAnchor="middle"
                fontSize={11}
                letterSpacing={0.5}
                fill={stop.here ? "var(--text)" : "var(--dim)"}
              >
                {stop.label}
              </text>
              {/* Hidden below the threshold: navigation must never break, only
                  reporting. */}
              <text
                x={cx}
                y={FACT_Y}
                textAnchor="middle"
                fontSize={12}
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                fill={FACT_COLOR[stop.tone]}
                className={
                  "hidden lg:block " + (stop.pulsing ? "motion-pulse" : "")
                }
              >
                {FACT_GLYPH[stop.tone]}
                {stop.fact}
              </text>
            </g>
          );
        })}
      </svg>

      {stops.map((stop, index) => (
        <Tooltip key={stop.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={stop.go}
              disabled={!stop.go}
              aria-current={stop.here ? "page" : undefined}
              style={{
                left: `${((X[index]! - STOP_WIDTH / 2) / WIDTH) * 100}%`,
                width: `${(STOP_WIDTH / WIDTH) * 100}%`,
              }}
              className="motion-control absolute top-0 h-full cursor-pointer border border-transparent hover:border-[var(--border-2)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-default disabled:border-transparent"
            >
              <span className="sr-only">
                {stop.label} — {stop.fact}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {stop.label}
            {stop.hint ? ` — ${stop.hint}` : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
