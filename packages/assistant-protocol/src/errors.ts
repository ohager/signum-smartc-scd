export const ERROR_CODES = [
  "studio_not_connected",
  "studio_disconnected",
  "another_session_connected",
  "rejected_by_user",
  "user_took_over",
  "path_not_allowed",
  "file_not_found",
  "edit_no_match",
  "edit_ambiguous",
  "timeout",
  "protocol_mismatch",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AssistantError {
  code: ErrorCode;
  message: string;
  /** What the agent should do next; shown to the model, so it is actionable and short. */
  hint: string;
}

export const DEFAULT_HINTS: Record<ErrorCode, string> = {
  studio_not_connected: "Ask the user to open SmartC Studio and click Connect assistant.",
  studio_disconnected: "The Studio tab closed or lost the connection. Ask the user to reconnect, then retry.",
  another_session_connected: "Another agent session holds the relay port. Close that session, or start this one with --port <n> and use the same port in the Studio.",
  rejected_by_user: "The user rejected the connection or the change. Do not retry; ask what they want instead.",
  user_took_over: "The user took over. Re-read the files and ask before writing again.",
  path_not_allowed: "Use an absolute path inside a Studio project, like /my-contract/contract.smart.c. Call list_projects to see valid projects.",
  file_not_found: "Call list_files to see which files exist, then retry with a valid path.",
  edit_no_match: "The text to replace was not found. Re-read the file and copy the exact text, including whitespace.",
  edit_ambiguous: "The text to replace occurs more than once. Include more surrounding lines so it matches exactly once.",
  timeout: "The Studio did not answer in time. Retry once; if it keeps failing, ask the user to check the Studio tab.",
  protocol_mismatch: "The relay and the Studio speak different protocol versions. Run npx @smartc-studio/mcp@latest or reload the Studio tab.",
  internal: "An unexpected error occurred in the Studio. Retry once; if it persists, report it to the user.",
};
