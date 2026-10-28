import { describe, expect, it } from "vitest";
import { ENGINES, mcpUrlFor, resolveEngine } from "../src/config.ts";

describe("resolveEngine", () => {
  it("knows the named engines", () => {
    expect(resolveEngine("dev")).toBe(ENGINES.dev);
    expect(resolveEngine("production")).toBe(ENGINES.production);
  });

  it("takes an https URL down to its origin", () => {
    expect(resolveEngine("https://lg.example.com/some/path?x=1")).toBe(
      "https://lg.example.com",
    );
  });

  it("allows plain http only for this machine", () => {
    expect(resolveEngine("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(resolveEngine("http://api.example.com")).toBeUndefined();
  });

  it("rejects a name it does not know", () => {
    expect(resolveEngine("staging")).toBeUndefined();
  });
});

describe("mcpUrlFor", () => {
  it("asks for the free tool set", () => {
    expect(mcpUrlFor(ENGINES.dev)).toBe("https://api.dev.locusgraph.com/mcp?tools=free");
  });
});
