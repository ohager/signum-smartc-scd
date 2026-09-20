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
 * The vertical rhythm is the whole point of these numbers: diamond to name is
 * 8, name to fact is 16, fact to bracket is 8. The first version packed four
 * levels into 48px at a line height of 1.04, which is what made the rail look
 * squeezed into the header rather than placed in it.
 */
const X = [58, 172, 286, 410];
const WIDTH = 468;
const HEIGHT = 64;
const TRACK_Y = 11;
/** One stop's share of the width — the buttons are cut from this, not guessed. */
const STOP_WIDTH = 114;
const NAME_Y = 33;
const FACT_Y = 49;

const FACT_COLOR: Record<CellTone, string> = {
  good: "var(--green)",
  bad: "var(--mag)",
  neutral: "var(--dim)",
};

/**
 * Write · Test · Simulate → Deploy, drawn as one picture.
 *
 * One SVG rather than four bordered boxes, because the statement is the shape:
 * the first three sit on a track under a bracket — they repeat until the
 * contract is right — and Deploy is outside it, after a break, because it
 * happens once and costs money. Stacked CSS borders could not hold that
 * geometry still; here it aligns by construction.
 *
 * The drawing is decoration. Transparent buttons lie over it, so tooltips,
 * focus rings, `aria-current` and `disabled` behave as they do anywhere else
 * in the application.
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
          stroke="var(--accent-2)"
          strokeOpacity={0.5}
          strokeWidth={2}
        />
        {/* The break before Deploy: outside the loop, and only reachable. */}
        <line
          x1={306}
          y1={TRACK_Y}
          x2={368}
          y2={TRACK_Y}
          stroke="var(--accent-2)"
          strokeOpacity={0.28}
          strokeWidth={2}
          strokeDasharray="2 6"
        />
        <path
          d={`M382 ${TRACK_Y} l-10 -6 v12 z`}
          fill="var(--accent-2)"
          fillOpacity={0.55}
        />

        {/* The loop: these three repeat. A drawing, not a control. */}
        <path
          d="M12 56 V60 H155"
          fill="none"
          stroke="var(--accent-2)"
          strokeOpacity={0.85}
          strokeWidth={2}
        />
        <path
          d="M187 60 H330 V56"
          fill="none"
          stroke="var(--accent-2)"
          strokeOpacity={0.85}
          strokeWidth={2}
        />
        <text
          x={171}
          y={60}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--accent-2)"
          fillOpacity={0.85}
        >
          ↺
        </text>

        {stops.map((stop, index) => {
          const cx = X[index]!;
          const mark = railMark(stop.tone);
          return (
            <g key={stop.id} opacity={stop.barred ? 0.4 : 1}>
              {stop.here && (
                <circle
                  cx={cx}
                  cy={TRACK_Y}
                  r={11}
                  fill="var(--accent-2)"
                  fillOpacity={0.22}
                />
              )}
              <rect
                x={cx - 6}
                y={TRACK_Y - 6}
                width={12}
                height={12}
                transform={`rotate(45 ${cx} ${TRACK_Y})`}
                fill={mark.fill}
                stroke={mark.stroke}
                strokeWidth={2}
              />
              <text
                x={cx}
                y={NAME_Y}
                textAnchor="middle"
                fontSize={10.5}
                letterSpacing={0.3}
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
                fontSize={12.5}
                fontFamily="JetBrains Mono, ui-monospace, monospace"
                fill={
                  stop.here && stop.tone === "neutral"
                    ? "var(--accent-2)"
                    : FACT_COLOR[stop.tone]
                }
                className={
                  "hidden lg:block " + (stop.pulsing ? "motion-pulse" : "")
                }
              >
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
              className="motion-control absolute top-0 h-full cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-default"
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
