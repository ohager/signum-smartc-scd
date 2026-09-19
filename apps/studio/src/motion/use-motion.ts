import { useEffect, useState } from "react";
import { publishMotionTokens } from "./tokens";
import { resolveMotion, type MotionChoice } from "./resolve";

const STORAGE_KEY = "studio:motion";

function storedChoice(): MotionChoice {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "on" || raw === "off" ? raw : null;
}

/**
 * Publishes the motion tokens and sets `data-motion` on <html>. Mount once,
 * from the app root.
 */
export function useMotion() {
  const [choice, setChoice] = useState<MotionChoice>(() =>
    typeof localStorage === "undefined" ? null : storedChoice(),
  );

  useEffect(() => {
    publishMotionTokens(document.documentElement);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      document.documentElement.dataset.motion = resolveMotion(choice, query.matches);
    };

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [choice]);

  return {
    choice,
    choose(next: MotionChoice) {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
      setChoice(next);
    },
  };
}
