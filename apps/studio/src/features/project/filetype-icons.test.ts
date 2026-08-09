import { describe, it, expect } from "bun:test";
import { getFileTypeIcon, FileTypes } from "./filetype-icons";

describe("getFileTypeIcon", () => {
  it("returns a defined icon component for every known file type", () => {
    for (const type of Object.values(FileTypes)) {
      expect(getFileTypeIcon(type)).toBeDefined();
    }
  });

  it("returns a fallback icon (never undefined) for legacy/unknown types", () => {
    // "scd" is a deprecated legacy file type that may still exist in saved projects
    expect(getFileTypeIcon("scd")).toBeDefined();
    expect(getFileTypeIcon("totally-unknown")).toBeDefined();
  });
});
