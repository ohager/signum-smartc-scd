import { DEFAULT_HINTS, type ErrorCode } from "@smartc-studio/assistant-protocol";

/*
 * The one error type tool handlers throw on purpose. The registry maps it to a
 * structured `{ok: false, error}` for the agent; anything else is a Studio bug and
 * becomes `internal`. The hint defaults per code so call sites only say what is specific.
 */
export class AssistantFailure extends Error {
  readonly code: ErrorCode;
  readonly hint: string;

  constructor(code: ErrorCode, message: string, hint: string = DEFAULT_HINTS[code]) {
    super(message);
    this.name = "AssistantFailure";
    this.code = code;
    this.hint = hint;
  }
}
