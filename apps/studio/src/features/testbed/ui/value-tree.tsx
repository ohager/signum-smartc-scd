import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { summarize, type ValueNode } from "../value-node";

/** How deep to open automatically: enough to see shape, not enough to flood. */
const AUTO_OPEN_DEPTH = 1;

interface Props {
  node: ValueNode;
  /** The key or index this node sits under, absent at the root. */
  label?: string;
  depth?: number;
}

/**
 * Renders a captured value as a collapsible tree.
 *
 * Contract values are frequently whole testbeds and account objects, which read
 * far better folded than as one long line — the reason this replaced a
 * pretty-printed string.
 */
export function ValueTree({ node, label, depth = 0 }: Props) {
  const [open, setOpen] = useState(depth < AUTO_OPEN_DEPTH);

  const key = label !== undefined && <span className="text-muted-foreground">{label}: </span>;

  if (node.kind === "leaf") {
    return (
      <div className="whitespace-pre-wrap break-all">
        {key}
        <span>{node.text}</span>
      </div>
    );
  }

  const children =
    node.kind === "array"
      ? node.items.map((item, index) => ({ label: String(index), value: item }))
      : node.entries.map((entry) => ({ label: entry.key, value: entry.value }));

  // Nothing to fold open, so do not offer a control that does nothing.
  if (children.length === 0) {
    return (
      <div className="break-all">
        {key}
        <span>{summarize(node)}</span>
      </div>
    );
  }

  const Chevron = open ? ChevronDown : ChevronRight;
  const [openBracket, closeBracket] =
    node.kind === "array" ? ["[", "]"] : [`${node.ctor ? `${node.ctor} ` : ""}{`, "}"];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-1 text-left hover:bg-muted/40"
        aria-expanded={open}
      >
        <Chevron className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="break-all">
          {key}
          <span>{open ? openBracket : summarize(node)}</span>
        </span>
      </button>

      {open && (
        <>
          <div className="ml-3 border-l border-border/60 pl-3">
            {children.map((child) => (
              <ValueTree
                key={child.label}
                node={child.value}
                label={child.label}
                depth={depth + 1}
              />
            ))}
          </div>
          <div className="ml-4">{closeBracket}</div>
        </>
      )}
    </div>
  );
}
