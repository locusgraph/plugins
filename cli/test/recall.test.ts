import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { recall } from "../src/commands/recall.ts";
import { fetchMemories } from "../src/engine.ts";
import { testEnv } from "./env.ts";

const workspace = { repo: "engine", query: "engine\ndev" };

describe("recall", () => {
  it("prints nothing when memory has nothing", async () => {
    const result = await recall({}, testEnv(), { afterCompact: false, fetch: async () => "" });

    expect(result).toEqual({ exitCode: 0 });
  });

  it("prints the memories it found", async () => {
    const result = await recall({}, testEnv(), {
      afterCompact: false,
      fetch: async () => "decision:engine.use_d1",
    });

    expect(result.stdout).toBe(
      "LocusGraph memories for this workspace:\ndecision:engine.use_d1\n",
    );
  });

  it("asks for a bounded store after compaction even with no memories", async () => {
    const result = await recall({}, testEnv(), { afterCompact: true, fetch: async () => "" });

    expect(result.stdout).toMatch(/at most 3/);
  });
});

describe("fetchMemories", () => {
  it("returns nothing without credentials and makes no request", async () => {
    expect(await fetchMemories(testEnv(), workspace)).toBe("");
  });

  it("posts a toon query that boosts the project and its handoff", async () => {
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
        boost_context_ids: ["project:engine", "handoff:engine"],
      },
    });
  });

  it("returns nothing when the engine is unreachable", async () => {
    expect(await fetchMemories(testEnv({ token: "t", graphId: "g" }), workspace)).toBe("");
  });
});
