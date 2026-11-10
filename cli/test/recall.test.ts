import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { recall } from "../src/commands/recall.ts";
import { fetchMemories } from "../src/engine.ts";
import { testEnv } from "./env.ts";

const workspace = { repo: "engine", query: "engine\ndev" };

describe("recall", () => {
  const withKey = testEnv({ token: "t", graphId: "g" });
  const noFetch = async () => {
    throw new Error("must not call the REST API without a key");
  };

  it("asks the agent to recall through MCP when there is no key", async () => {
    const result = await recall({}, testEnv(), {
      afterCompact: false,
      fetch: noFetch,
      workspace,
    });
    const [, json] = result.stdout?.match(/with these arguments: (\{.*?\})\. /) ?? [];

    expect(result.stdout).toMatch(/call the LocusGraph `retrieve_memories` tool once/);
    expect(result.stdout).toMatch(/If the LocusGraph tools are not available, skip this/);
    expect(JSON.parse(json ?? "")).toEqual({
      query: "engine\ndev",
      limit: 6,
      format: "toon",
      boost_context_ids: ["project:engine"],
      coverage_context_ids: ["handoff:engine"],
    });
  });

  it("prints the memories itself when a key is set", async () => {
    const result = await recall({}, withKey, {
      afterCompact: false,
      fetch: async () => "decision:engine.use_d1",
      workspace,
    });

    expect(result.stdout).toBe(
      "LocusGraph memories for this workspace:\ndecision:engine.use_d1\n",
    );
  });

  it("prints nothing when a key is set and memory has nothing", async () => {
    const result = await recall({}, withKey, {
      afterCompact: false,
      fetch: async () => "",
      workspace,
    });

    expect(result).toEqual({ exitCode: 0 });
  });

  it("answers Cursor's sessionStart with additional_context, or an empty object", async () => {
    const found = await recall({}, withKey, {
      afterCompact: false,
      cursor: true,
      fetch: async () => "remembered",
      workspace,
    });
    const empty = await recall({}, withKey, {
      afterCompact: false,
      cursor: true,
      fetch: async () => "",
      workspace,
    });

    expect(JSON.parse(found.stdout ?? "")).toEqual({
      additional_context: "LocusGraph memories for this workspace:\nremembered",
    });
    expect(empty.stdout).toBe("{}\n");
  });

  it("names the repository's graph when it comes from .locusgraph.json", async () => {
    const fromRepo = await recall({}, testEnv({ graphId: "g_work", graphSource: "repo" }), {
      afterCompact: false,
      fetch: noFetch,
      workspace,
    });
    const fromDefault = await recall(
      {},
      testEnv({ graphId: "g_work", graphSource: "default" }),
      {
        afterCompact: false,
        fetch: noFetch,
        workspace,
      },
    );

    expect(fromRepo.stdout).toMatch(/^LocusGraph: this repository's graph is `g_work`/);
    expect(fromDefault.stdout).not.toMatch(/this repository's graph/);
  });

  it("asks for a bounded store after compaction", async () => {
    const result = await recall({}, withKey, {
      afterCompact: true,
      fetch: async () => "",
      workspace,
    });

    expect(result.stdout).toMatch(/at most 3/);
  });

  it("asks for both the recall and the store after compaction without a key", async () => {
    const result = await recall({}, testEnv(), {
      afterCompact: true,
      fetch: noFetch,
      workspace,
    });

    expect(result.stdout).toMatch(
      /retrieve_memories[\s\S]*\n\nLocusGraph: the conversation was just compacted/,
    );
  });
});

describe("fetchMemories", () => {
  it("returns nothing without credentials and makes no request", async () => {
    expect(await fetchMemories(testEnv(), workspace)).toBe("");
  });

  it("posts a toon query that boosts the project and reserves room for its handoff", async () => {
    let received: { path?: string; auth?: string; body?: unknown } = {};
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        received = {
          path: request.url ?? "",
          auth: request.headers.authorization ?? "",
          body: JSON.parse(body),
        };
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ success: true, data: { memories: "  remembered  \n" } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    const memories = await fetchMemories(
      testEnv({ engineUrl: `http://127.0.0.1:${port}`, token: "t", graphId: "g" }),
      workspace,
    );
    server.close();

    expect(memories).toBe("remembered");
    expect(received).toEqual({
      path: "/v1/memories",
      auth: "Bearer t",
      body: {
        graph_id: "g",
        query: "engine\ndev",
        limit: 6,
        format: "toon",
        boost_context_ids: ["project:engine"],
        coverage_context_ids: ["handoff:engine"],
      },
    });
  });

  it("returns nothing when the engine is unreachable", async () => {
    expect(await fetchMemories(testEnv({ token: "t", graphId: "g" }), workspace)).toBe("");
  });
});
