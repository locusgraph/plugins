import { describe, expect, it } from "vitest";
import { contextSafeName } from "../src/workspace.ts";

describe("contextSafeName", () => {
  it("matches how the engine stores a context id", () => {
    expect(contextSafeName("My.Repo")).toBe("my_repo");
    expect(contextSafeName("locusgraph-cloudflare")).toBe("locusgraph-cloudflare");
    expect(contextSafeName("api v2")).toBe("api_v2");
  });
});
