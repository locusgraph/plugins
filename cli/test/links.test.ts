import { describe, expect, it } from "vitest";
import { links } from "../src/commands/links.ts";

describe("lg links", () => {
  it("prints production links with no engine line", () => {
    const result = links([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Cursor: +https:\/\/cursor\.com\/install-mcp/);
    expect(result.stdout).not.toContain("engine:");
  });

  it("prints dev links under an engine line", () => {
    const result = links(["--engine", "dev"]);

    expect(result.stdout?.split("\n")[0]).toBe("engine: https://api.dev.locusgraph.com");
    expect(result.stdout).toContain("api.dev.locusgraph.com%2Fmcp");
  });

  it("refuses a bad engine and stray arguments", () => {
    expect(links(["--engine", "staging"]).exitCode).toBe(1);
    expect(links(["cursor"])).toEqual({ exitCode: 1, stderr: "unexpected argument: cursor\n" });
  });
});
