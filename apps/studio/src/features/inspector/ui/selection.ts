/**
 * Row states for the inspector's lists, on the sidebar's tokens.
 *
 * `bg-accent` is the theme's full-strength accent — neon green, gold, bright
 * blue — and the rows kept their normal text colour on it, which left a
 * selected row close to unreadable in every theme. The sidebar's pair
 * (`--border-1` behind `--text`) reads everywhere; the accent survives as a
 * thin bar on the left, where it marks the row without carrying the text.
 */
export const ROW_HOVER = "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
// Secondary text (index, raw hex, the id under an alias) is muted by design,
// but muted on the selection tint drops to about 3:1; the selected row lifts it.
export const ROW_SELECTED =
  "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_var(--accent-2)] " +
  "[&_.text-muted-foreground]:text-sidebar-accent-foreground";
