import { describe, it, expect } from "bun:test";
import { acceptedFileType, FileTypes } from "./filetype-icons";

describe("acceptedFileType", () => {
  it("maps the three accepted extensions", () => {
    expect(acceptedFileType("main.smart.c")).toBe(FileTypes.SmartC);
    expect(acceptedFileType("run.scenario.json")).toBe(FileTypes.Scenario);
    expect(acceptedFileType("code.asm")).toBe(FileTypes.ASM);
  });

  it("is case-insensitive on the extension", () => {
    expect(acceptedFileType("MAIN.SMART.C")).toBe(FileTypes.SmartC);
  });

  it("rejects everything else", () => {
    expect(acceptedFileType("README.md")).toBeNull();
    expect(acceptedFileType("logo.png")).toBeNull();
    expect(acceptedFileType("data.json")).toBeNull();
    expect(acceptedFileType("Makefile")).toBeNull();
    expect(acceptedFileType("")).toBeNull();
  });
});
