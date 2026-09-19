/**
 * The motion vocabulary: small enough to remember, declared once.
 *
 * The numbers live here and are published to CSS as custom properties, so the
 * stylesheet and any TypeScript that animates imperatively read the same
 * value. Taken from signum-sandbox, minus its 90-second ambient drift: Studio
 * has no permanent movement.
 */

export const DURATIONS = {
  instant: 120, // icon swap, tab content crossfade
  quick: 200, // hover, press, colour change, value flash
  base: 350, // panel opens, row unfolds
  calm: 550, // a row arrives and its tint decays
} as const;

export const EASINGS = {
  out: "cubic-bezier(.22, 1, .36, 1)",
  inOut: "cubic-bezier(.4, 0, .2, 1)",
} as const;

/** Overshooting curves, standing in for the sandbox's three springs. */
export const SPRINGS = {
  snap: "cubic-bezier(.34, 1.56, .64, 1)", // a control answering a press
  lift: "cubic-bezier(.22, 1.2, .36, 1)", // a card rising under the pointer
  panel: "cubic-bezier(.16, 1.1, .3, 1)", // a panel or overlay settling
} as const;

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function motionCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [name, ms] of Object.entries(DURATIONS)) {
    vars[`--motion-${name}`] = `${ms}ms`;
  }
  // camelCase keys, kebab-case custom properties: `inOut` → `--ease-in-out`.
  for (const [name, curve] of Object.entries(EASINGS)) {
    vars[`--ease-${kebab(name)}`] = curve;
  }
  for (const [name, curve] of Object.entries(SPRINGS)) {
    vars[`--spring-${name}`] = curve;
  }

  return vars;
}

/** Call once, at startup, with `document.documentElement`. */
export function publishMotionTokens(root: HTMLElement): void {
  for (const [name, value] of Object.entries(motionCssVariables())) {
    root.style.setProperty(name, value);
  }
}
