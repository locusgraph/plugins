import { describe, expect, it } from "vitest";
import { contextSafeName, sessionQuery } from "../src/workspace.ts";

describe("contextSafeName", () => {
  it("matches how the engine stores a context id", () => {
    expect(contextSafeName("My.Repo")).toBe("my_repo");
    expect(contextSafeName("locusgraph-cloudflare")).toBe("locusgraph-cloudflare");
    expect(contextSafeName("api v2")).toBe("api_v2");
  });
});

describe("sessionQuery", () => {
  it("asks for the repository's rules, not what git log already shows", () => {
    expect(sessionQuery("engine", "main")).toBe(
      "engine constraints decisions conventions known fixes",
    );
  });

  it("adds a task branch's words", () => {
    expect(sessionQuery("engine", "fix/normalize-read-context_ids")).toBe(
      "engine constraints decisions conventions known fixes fix normalize read context ids",
    );
  });
});
