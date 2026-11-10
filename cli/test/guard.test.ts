import { describe, expect, it } from "vitest";
import { guard } from "../src/commands/guard.ts";
import { judgeToolCall } from "../src/paid-tools.ts";
import { testEnv } from "./env.ts";

describe("judgeToolCall", () => {
  it("blocks the paid tools under any server prefix", () => {
    expect(judgeToolCall("mcp__plugin_locusgraph_locusgraph__observe", false).allowed).toBe(
      false,
    );
    expect(judgeToolCall("mcp__locusgraph__deep_recall", false).allowed).toBe(false);
    expect(judgeToolCall("deep_recall", false).allowed).toBe(false);
  });

  it("allows the free tools and names that only look alike", () => {
    expect(judgeToolCall("mcp__locusgraph__retrieve_memories", false).allowed).toBe(true);
    expect(judgeToolCall("mcp__locusgraph__store_event", false).allowed).toBe(true);
    expect(judgeToolCall("mcp__other__observer", false).allowed).toBe(true);
  });

  it("allows the paid tools once they are enabled", () => {
    expect(judgeToolCall("mcp__locusgraph__observe", true).allowed).toBe(true);
  });
});

describe("guard", () => {
  it("answers Claude Code with exit 2 and the reason on stderr", () => {
    const result = guard({ tool_name: "mcp__locusgraph__observe" }, testEnv(), "claude");

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/spends LocusGraph credits/);
  });

  it("answers Cursor with a deny permission and exit 0", () => {
    const result = guard({ tool_name: "deep_recall" }, testEnv(), "cursor");

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "")).toEqual({
      permission: "deny",
      user_message: expect.stringMatching(/spends LocusGraph credits/),
      agent_message: expect.stringMatching(/spends LocusGraph credits/),
    });
  });

  it("lets a free tool through silently", () => {
    expect(guard({ tool_name: "retrieve_memories" }, testEnv(), "claude")).toEqual({
      exitCode: 0,
    });
  });
});
