export function replaceWhitespace(str: string): string {
  return str.replace(/\s+/g, "-");
}

export function toValidCName(input: string): string {
  if (!input) return "";

  return (
    input
      // Replace any leading digits with underscore
      .replace(/^[0-9]+/, "")
      // Replace any non-alphanumeric characters (except underscore) with underscore
      .replace(/[^a-zA-Z0-9_]/g, "_")
      // Ensure starts with letter or underscore
      .replace(/^(?![a-zA-Z_])/, "_")
  );
}
