import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fetchMemories, guardVerdict } from "./lg.mjs";

const lg = join(dirname(fileURLToPath(import.meta.url)), "lg.mjs");

function run(args, input, env = {}) {
  return spawnSync(process.execPath, [lg, ...args], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
}

test("guard blocks paid tools by default", () => {
  assert.equal(guardVerdict({}, "mcp__plugin_locusgraph_locusgraph__observe").allowed, false);
  assert.equal(guardVerdict({}, "mcp__locusgraph__deep_recall").allowed, false);
  assert.equal(guardVerdict({}, "deep_recall").allowed, false);
});

test("guard allows free tools and lookalike names", () => {
  assert.equal(guardVerdict({}, "mcp__locusgraph__retrieve_memories").allowed, true);
  assert.equal(guardVerdict({}, "mcp__locusgraph__store_event").allowed, true);
  assert.equal(guardVerdict({}, "mcp__other__observer").allowed, true);
});

test("guard allows paid tools when LOCUSGRAPH_PAID=1", () => {
  assert.equal(guardVerdict({ LOCUSGRAPH_PAID: "1" }, "mcp__locusgraph__observe").allowed, true);
});

test("claude dialect exits 2 with the reason on stderr", () => {
  const result = run(["guard"], { tool_name: "mcp__locusgraph__observe" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /spends LocusGraph credits/);
});

test("cursor dialect answers deny as JSON and exits 0", () => {
  const result = run(["guard", "--cursor"], { tool_name: "deep_recall" });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).permission, "deny");
});

test("recall is silent without credentials", () => {
  const result = run(["recall"], { cwd: process.cwd() });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("recall after compaction still asks for a bounded store", () => {
  const result = run(["recall", "--after-compact"], { cwd: process.cwd() });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /at most 3/);
});

test("fetchMemories posts a toon query for the graph", async () => {
  let received;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received = { path: request.url, auth: request.headers.authorization, body: JSON.parse(body) };
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ success: true, data: { memories: "  decision:use_d1  \n" } }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const memories = await fetchMemories(
    { LOCUSGRAPH_URL: `http://127.0.0.1:${port}/`, LOCUSGRAPH_TOKEN: "t", LOCUSGRAPH_GRAPH_ID: "g" },
    "repo",
  );
  server.close();

  assert.equal(memories, "decision:use_d1");
  assert.equal(received.path, "/v1/memories");
  assert.equal(received.auth, "Bearer t");
  assert.deepEqual(received.body, { graph_id: "g", query: "repo", limit: 6, format: "toon" });
});

test("fetchMemories returns empty on a failed request", async () => {
  const memories = await fetchMemories(
    { LOCUSGRAPH_URL: "http://127.0.0.1:9", LOCUSGRAPH_TOKEN: "t", LOCUSGRAPH_GRAPH_ID: "g" },
    "repo",
  );
  assert.equal(memories, "");
});
