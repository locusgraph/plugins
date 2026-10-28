import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { init, MCP_URL } from "./init.mjs";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "lg-init-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });
  const lines = [];
  const run = (args) => init(args, { cwd, home, out: (line) => lines.push(line) });
  const read = (path) => readFile(join(cwd, path), "utf8");
  return { cwd, home, lines, run, read };
}

test("detects nothing in an empty workspace and says how to name one", async () => {
  const { run, lines } = await workspace();
  assert.equal(await run([]), 1);
  assert.match(lines[0], /no supported agent found/);
});

test("rejects an unknown platform before writing anything", async () => {
  const { run, lines, read } = await workspace();
  assert.equal(await run(["cursor", "emacs"]), 1);
  assert.match(lines[0], /unknown platform: emacs/);
  await assert.rejects(read(".cursor/mcp.json"));
});

test("detects a platform by its folder and installs only that one", async () => {
  const { cwd, run, read } = await workspace();
  await mkdir(join(cwd, ".vscode"));
  assert.equal(await run([]), 0);
  assert.equal(JSON.parse(await read(".vscode/mcp.json")).servers.locusgraph.url, MCP_URL);
  await assert.rejects(read(".cursor/mcp.json"));
});

test("cursor keeps existing servers and hooks, and adds the guard once", async () => {
  const { cwd, run, read } = await workspace();
  await mkdir(join(cwd, ".cursor"));
  await writeFile(join(cwd, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { other: { url: "x" } } }));
  await writeFile(
    join(cwd, ".cursor/hooks.json"),
    JSON.stringify({ version: 1, hooks: { stop: [{ command: "echo bye" }] } }),
  );

  await run(["cursor"]);
  await run(["cursor"]);

  const mcp = JSON.parse(await read(".cursor/mcp.json"));
  assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ["locusgraph", "other"]);
  const hooks = JSON.parse(await read(".cursor/hooks.json")).hooks;
  assert.equal(hooks.stop.length, 1);
  assert.equal(hooks.beforeMCPExecution.length, 1);
  assert.match(await read(".cursor/hooks/lg.mjs"), /guardVerdict/);
  assert.match(await read(".cursor/rules/locusgraph.mdc"), /^---\n.*alwaysApply: true/s);
});

test("AGENTS.md keeps the user's text and holds one rules block after reruns", async () => {
  const { cwd, home, run, read } = await workspace();
  await mkdir(join(home, ".codex"));
  await writeFile(join(cwd, "AGENTS.md"), "# My project\n\nUse tabs.\n");

  await run(["codex"]);
  await run(["codex", "opencode"]);

  const agents = await read("AGENTS.md");
  assert.ok(agents.startsWith("# My project\n\nUse tabs.\n\n<!-- locusgraph:start -->"));
  assert.equal(agents.split("<!-- locusgraph:start -->").length, 2);
});

test("codex appends its table once and keeps the existing config", async () => {
  const { home, run } = await workspace();
  await mkdir(join(home, ".codex"));
  await writeFile(join(home, ".codex/config.toml"), 'model = "gpt-5"\n');

  await run(["codex"]);
  await run(["codex"]);

  const config = await readFile(join(home, ".codex/config.toml"), "utf8");
  assert.ok(config.startsWith('model = "gpt-5"\n\n[mcp_servers.locusgraph]'));
  assert.equal(config.split("[mcp_servers.locusgraph]").length, 2);
});

test("gemini hides the paid tools", async () => {
  const { run, read } = await workspace();
  await run(["gemini"]);
  const settings = JSON.parse(await read(".gemini/settings.json"));
  assert.deepEqual(settings.mcpServers.locusgraph.excludeTools, ["observe", "deep_recall"]);
});

test("a JSONC config is refused rather than overwritten", async () => {
  const { cwd, run, lines, read } = await workspace();
  await mkdir(join(cwd, ".vscode"));
  const commented = '{\n  // mine\n  "servers": {}\n}\n';
  await writeFile(join(cwd, ".vscode/mcp.json"), commented);

  assert.equal(await run(["vscode"]), 1);
  assert.match(lines[0], /not plain JSON/);
  assert.equal(await read(".vscode/mcp.json"), commented);
});
