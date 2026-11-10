import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { skillMatch } from "../src/commands/skill-match.ts";
import { matchSkill, SKILL_MATCH_MIN_SCORE } from "../src/engine.ts";
import { testEnv } from "./env.ts";

const withKey = testEnv({ token: "t", graphId: "g" });
const deploy = {
  contextId: "skill:deploy",
  text: "Skill deploy (v2): deploy the API.",
  score: 0.8,
};

describe("skill-match", () => {
  const never = async () => {
    throw new Error("must not search");
  };

  it("adds one line naming the skill when one matches", async () => {
    const result = await skillMatch(
      { prompt: "deploy the api to production" },
      withKey,
      async () => deploy,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/stored skill `skill:deploy` matches this request/);
    expect(result.stdout).toMatch(/locusgraph-skills/);
    expect(result.stdout?.split("\n")).toHaveLength(2);
  });

  it("stays silent when nothing matches", async () => {
    expect(
      await skillMatch(
        { prompt: "rename this variable please" },
        withKey,
        async () => undefined,
      ),
    ).toEqual({
      exitCode: 0,
    });
  });

  it("does not search for slash commands, short prompts or without a key", async () => {
    expect(
      await skillMatch({ prompt: "/locusgraph:why deploy fails" }, withKey, never),
    ).toEqual({
      exitCode: 0,
    });
    expect(await skillMatch({ prompt: "yes do" }, withKey, never)).toEqual({ exitCode: 0 });
    expect(await skillMatch({ prompt: "deploy the api now" }, testEnv(), never)).toEqual({
      exitCode: 0,
    });
  });
});

describe("matchSkill", () => {
  async function engine(items: unknown[]) {
    let body: unknown;
    const server = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk) => {
        text += chunk;
      });
      request.on("end", () => {
        body = JSON.parse(text);
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ success: true, data: { items } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    return {
      env: testEnv({ engineUrl: `http://127.0.0.1:${port}`, token: "t", graphId: "g" }),
      body: () => body,
      close: () => server.close(),
    };
  }

  it("searches skills only, by similarity, and picks the best match above the floor", async () => {
    const server = await engine([
      { context_ids: ["step:deploy__010_build"], text: "a step", match_score: 0.95 },
      { context_ids: ["skill:release"], text: "Skill release (v1)", match_score: 0.7 },
      { context_ids: ["skill:deploy"], text: "Skill deploy (v2)", match_score: 0.9 },
    ]);

    const found = await matchSkill(server.env, "deploy the api");
    server.close();

    expect(found).toEqual({ contextId: "skill:deploy", text: "Skill deploy (v2)", score: 0.9 });
    expect(server.body()).toEqual({
      graph_id: "g",
      query: "deploy the api",
      context_types: { skill: [] },
      ranking: "similarity",
      format: "json",
      limit: 3,
    });
  });

  it("returns nothing below the floor", async () => {
    const server = await engine([
      {
        context_ids: ["skill:deploy"],
        text: "Skill deploy",
        match_score: SKILL_MATCH_MIN_SCORE - 0.01,
      },
    ]);

    expect(await matchSkill(server.env, "write a poem about cats")).toBeUndefined();
    server.close();
  });

  it("returns nothing when the engine is unreachable", async () => {
    expect(await matchSkill(withKey, "deploy the api")).toBeUndefined();
  });
});
