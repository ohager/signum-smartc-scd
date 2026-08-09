import { useState } from "react";
import type { DebugState } from "../engine/engine.types";
import { isInternalVar } from "./vars";

type Tab = "variables" | "registers" | "watch" | "breakpoints";

interface Props {
  state: DebugState | null;
  onRemoveBreakpoint: (line: number) => void;
}

export function InspectorPanel({ state, onRemoveBreakpoint }: Props) {
  const [tab, setTab] = useState<Tab>("variables");
  const [showInternals, setShowInternals] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);
  const [watchInput, setWatchInput] = useState("");

  const memory = state?.memory ?? {};
  const tabs: Tab[] = ["variables", "registers", "watch", "breakpoints"];

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex border-b shrink-0">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={"flex-1 px-2 py-1 capitalize " + (tab === t ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        {tab === "variables" && (
          <>
            {Object.entries(memory)
              .filter(([name]) => !isInternalVar(name))
              .map(([name, value]) => (
                <Row key={name} name={name} value={value} />
              ))}
            <label className="mt-2 flex items-center gap-1 opacity-70 font-sans">
              <input type="checkbox" checked={showInternals} onChange={(e) => setShowInternals(e.target.checked)} />
              show internals
            </label>
            {showInternals &&
              Object.entries(memory)
                .filter(([name]) => isInternalVar(name))
                .map(([name, value]) => <Row key={name} name={name} value={value} muted />)}
          </>
        )}

        {tab === "registers" &&
          Object.entries(state?.registers ?? {}).map(([name, value]) => <Row key={name} name={name} value={value} />)}

        {tab === "watch" && (
          <>
            <form
              className="flex gap-1 mb-2 font-sans"
              onSubmit={(e) => {
                e.preventDefault();
                const v = watchInput.trim();
                if (v && !watched.includes(v)) setWatched([...watched, v]);
                setWatchInput("");
              }}
            >
              <input
                className="flex-1 border rounded px-1 bg-transparent"
                placeholder="variable name"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
              />
              <button className="border rounded px-2" type="submit">
                +
              </button>
            </form>
            {watched.length === 0 && <div className="opacity-50 font-sans">— add a variable to watch —</div>}
            {watched.map((name) => (
              <div key={name} className="flex justify-between gap-2 group">
                <span>{name}</span>
                <span className="flex gap-2">
                  <span className="opacity-80">{memory[name] ?? "—"}</span>
                  <button
                    className="opacity-0 group-hover:opacity-60"
                    onClick={() => setWatched(watched.filter((w) => w !== name))}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </>
        )}

        {tab === "breakpoints" && (
          <>
            {(state?.breakpoints ?? []).length === 0 && <div className="opacity-50 font-sans">— none —</div>}
            {(state?.breakpoints ?? []).map((line) => (
              <div key={line} className="flex justify-between gap-2 group">
                <span>line {line}</span>
                <button className="opacity-0 group-hover:opacity-60" onClick={() => onRemoveBreakpoint(line)}>
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ name, value, muted }: { name: string; value: string; muted?: boolean }) {
  return (
    <div className={"flex justify-between gap-4 " + (muted ? "opacity-50" : "")}>
      <span>{name}</span>
      <span className="opacity-80">{value}</span>
    </div>
  );
}
