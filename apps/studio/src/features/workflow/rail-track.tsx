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

const X = [50, 150, 250, 370];
const WIDTH = 420;
const TRACK_Y = 9;

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
    <div className="relative h-[52px] w-[420px] shrink-0">
      <svg
        aria-hidden
        viewBox={`0 0 ${WIDTH} 52`}
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
          x1={268}
          y1={TRACK_Y}
          x2={326}
          y2={TRACK_Y}
          stroke="var(--accent-2)"
          strokeOpacity={0.28}
          strokeWidth={2}
          strokeDasharray="2 6"
        />
        <path
          d={`M338 ${TRACK_Y} l-10 -6 v12 z`}
          fill="var(--accent-2)"
          fillOpacity={0.55}
        />

        {/* The loop: these three repeat. A drawing, not a control. */}
        <path
          d="M10 43 V48 H134"
          fill="none"
          stroke="var(--accent-2)"
          strokeOpacity={0.85}
          strokeWidth={2}
        />
        <path
          d="M166 48 H290 V43"
          fill="none"
          stroke="var(--accent-2)"
          strokeOpacity={0.85}
          strokeWidth={2}
        />
        <text
          x={150}
          y={48}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
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
                y={27}
                textAnchor="middle"
                fontSize={11.5}
                fill={stop.here ? "var(--text)" : "var(--dim)"}
              >
                {stop.label}
              </text>
              {/* Hidden below the threshold: navigation must never break, only
                  reporting. */}
              <text
                x={cx}
                y={39}
                textAnchor="middle"
                fontSize={11}
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
                left: `${((X[index]! - 50) / WIDTH) * 100}%`,
                width: `${(100 / WIDTH) * 100}%`,
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
