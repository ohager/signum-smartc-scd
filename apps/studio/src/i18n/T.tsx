import { cloneElement, Fragment, type ReactElement } from "react";
import type { MessageKey } from "./keys.generated";
import { interpolate, rawMessage, type Params } from "./runtime";
import { splitRich } from "./rich";

interface Props {
  k: MessageKey;
  params?: Params;
  /** Tag name in the message → the element its text is rendered into. */
  components?: Record<string, ReactElement>;
}

/**
 * A translated sentence with elements inside it. The template is split before
 * parameters are filled in, so a parameter can never introduce an element.
 */
export function T({ k, params, components = {} }: Props) {
  const template = rawMessage(k, params);
  if (template === undefined) return <>{k}</>;
  const parts = splitRich(template, Object.keys(components));
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <Fragment key={i}>{interpolate(part, params)}</Fragment>
        ) : (
          cloneElement(components[part.tag], { key: i }, interpolate(part.text, params))
        ),
      )}
    </>
  );
}
