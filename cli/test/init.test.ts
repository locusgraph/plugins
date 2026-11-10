import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { init } from "../src/commands/init.ts";
import { ENGINES, mcpUrlFor } from "../src/config.ts";

const PRODUCTION_MCP = mcpUrlFor(ENGINES.production);
const DEV_MCP = mcpUrlFor(ENGINES.dev);

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "lg-init-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  const hookScript = join(root, "lg.mjs");
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(hookScript, "// bundled hook\n");

  const run = async (args: string[]) => {
    const result = await init(args, { cwd, home, rules: "# Rules\n", hookScript });
    return { exitCode: result.exitCode, lines: (result.stdout ?? "").trimEnd().split("\n") };
  };
  const read = (path: string) => readFile(join(cwd, path), "utf8");
  const readJson = async (path: string) => JSON.parse(await read(path));
  return { cwd, home, run, read, readJson };
}

describe("lg init", () => {
  it("says how to name a platform when it detects none", async () => {
    const { run } = await workspace();
    const { exitCode, lines } = await run([]);

    expect(exitCode).toBe(1);
    expect(lines[0]).toMatch(/no supported agent found/);
  });

  it("rejects an unknown platform before writing anything", async () => {
    const { run, read } = await workspace();
    const { exitCode, lines } = await run(["cursor", "emacs"]);

    expect(exitCode).toBe(1);
    expect(lines[0]).toMatch(/unknown platform: emacs/);
    await expect(read(".cursor/mcp.json")).rejects.toThrow();
  });

  it("only shows the plan when detection is not confirmed", async () => {
    const { cwd, home, run, read } = await workspace();
    await mkdir(join(cwd, ".vscode"));
    await mkdir(join(home, ".codex"));

    const { exitCode, lines } = await run([]);

    expect(exitCode).toBe(0);
    expect(lines).toContainEqual(expect.stringMatching(/vscode\s+VS Code Copilot$/));
    expect(lines).toContainEqual(
      expect.stringMatching(/codex.*~\/\.codex\/config\.toml, which is global/),
    );
    expect(lines.at(-1)).toMatch(/nothing written. Run lg init --yes/);
    await expect(read(".vscode/mcp.json")).rejects.toThrow();
    await expect(readFile(join(home, ".codex/config.toml"), "utf8")).rejects.toThrow();
  });

  it("installs a named platform without --yes", async () => {
    const { run, readJson } = await workspace();

    expect((await run(["vscode"])).exitCode).toBe(0);
    expect((await readJson(".vscode/mcp.json")).servers.locusgraph.url).toBe(PRODUCTION_MCP);
  });

  it("installs every detected platform with --yes, and only those", async () => {
    const { cwd, run, read, readJson } = await workspace();
    await mkdir(join(cwd, ".vscode"));

    expect((await run(["--yes"])).exitCode).toBe(0);
    expect((await readJson(".vscode/mcp.json")).servers.locusgraph.url).toBe(PRODUCTION_MCP);
    await expect(read(".cursor/mcp.json")).rejects.toThrow();
  });

  it("keeps Cursor's other servers and hooks, and adds the guard once", async () => {
    const { cwd, run, read, readJson } = await workspace();
    await mkdir(join(cwd, ".cursor"));
    await writeFile(
      join(cwd, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: { other: { url: "x" } } }),
    );
    await writeFile(
      join(cwd, ".cursor/hooks.json"),
      JSON.stringify({ version: 1, hooks: { stop: [{ command: "echo bye" }] } }),
    );

    await run(["cursor"]);
    await run(["cursor"]);

    expect(Object.keys((await readJson(".cursor/mcp.json")).mcpServers).sort()).toEqual([
      "locusgraph",
      "other",
    ]);
    const { hooks } = await readJson(".cursor/hooks.json");
    expect(hooks.stop).toHaveLength(1);
    expect(hooks.beforeMCPExecution).toHaveLength(1);
    expect(await read(".cursor/hooks/lg.mjs")).toBe("// bundled hook\n");
    expect(await read(".cursor/rules/locusgraph.mdc")).toMatch(/^---\n.*alwaysApply: true/s);
  });

  it("keeps the user's AGENTS.md and holds one rules block after reruns", async () => {
    const { cwd, home, run, read } = await workspace();
    await mkdir(join(home, ".codex"));
    await writeFile(join(cwd, "AGENTS.md"), "# My project\n\nUse tabs.\n");

    await run(["codex"]);
    await run(["codex", "opencode"]);

    const agents = await read("AGENTS.md");
    expect(agents.startsWith("# My project\n\nUse tabs.\n\n<!-- locusgraph:start -->")).toBe(
      true,
    );
    expect(agents.split("<!-- locusgraph:start -->")).toHaveLength(2);
  });

  it("appends the Codex table once and keeps the existing config", async () => {
    const { home, run } = await workspace();
    await mkdir(join(home, ".codex"));
    await writeFile(join(home, ".codex/config.toml"), 'model = "gpt-5"\n');

    await run(["codex"]);
    await run(["codex"]);

    const config = await readFile(join(home, ".codex/config.toml"), "utf8");
    expect(config.startsWith('model = "gpt-5"\n\n[mcp_servers.locusgraph]')).toBe(true);
    expect(config.split("[mcp_servers.locusgraph]")).toHaveLength(2);
  });

  it("hides the paid tools from Gemini CLI", async () => {
    const { run, readJson } = await workspace();
    await run(["gemini"]);

    expect(
      (await readJson(".gemini/settings.json")).mcpServers.locusgraph.excludeTools,
    ).toEqual(["observe", "deep_recall"]);
  });

  it("refuses a config with comments rather than rewriting it", async () => {
    const { cwd, run, read } = await workspace();
    await mkdir(join(cwd, ".vscode"));
    const commented = '{\n  // mine\n  "servers": {}\n}\n';
    await writeFile(join(cwd, ".vscode/mcp.json"), commented);

    const { exitCode, lines } = await run(["vscode"]);

    expect(exitCode).toBe(1);
    expect(lines[0]).toMatch(/not plain JSON/);
    expect(await read(".vscode/mcp.json")).toBe(commented);
  });

  it("points every platform at the dev engine with --engine dev", async () => {
    const { home, run, readJson, read } = await workspace();
    await mkdir(join(home, ".codex"));

    const { exitCode, lines } = await run([
      "cursor",
      "codex",
      "gemini",
      "vscode",
      "opencode",
      "--engine",
      "dev",
    ]);

    expect(exitCode).toBe(0);
    expect(lines[0]).toBe(`engine: ${ENGINES.dev}`);
    expect((await readJson(".cursor/mcp.json")).mcpServers.locusgraph.url).toBe(DEV_MCP);
    expect((await readJson(".vscode/mcp.json")).servers.locusgraph.url).toBe(DEV_MCP);
    expect((await readJson(".gemini/settings.json")).mcpServers.locusgraph.httpUrl).toBe(
      DEV_MCP,
    );
    expect((await readJson("opencode.json")).mcp.locusgraph.url).toBe(DEV_MCP);
    expect(await readFile(join(home, ".codex/config.toml"), "utf8")).toContain(DEV_MCP);
    await expect(read(".cursor/mcp.json")).resolves.not.toContain(ENGINES.production);
  });

  it("switches Codex back to production on a rerun, keeping one table", async () => {
    const { home, run } = await workspace();
    await mkdir(join(home, ".codex"));
    await writeFile(
      join(home, ".codex/config.toml"),
      'model = "gpt-5"\n\n[tui]\ntheme = "dark"\n',
    );

    await run(["codex", "--engine=dev"]);
    await run(["codex"]);

    const config = await readFile(join(home, ".codex/config.toml"), "utf8");
    expect(config).toContain(PRODUCTION_MCP);
    expect(config).not.toContain(ENGINES.dev);
    expect(config).toContain('[tui]\ntheme = "dark"');
    expect(config.split("[mcp_servers.locusgraph]")).toHaveLength(2);
  });

  it("tells Claude Code users which LOCUSGRAPH_URL to export for a non-production engine", async () => {
    const { run } = await workspace();

    const dev = await run(["claude-code", "--engine", "dev"]);
    const production = await run(["claude-code"]);

    expect(dev.lines).toContainEqual(
      expect.stringContaining(`export LOCUSGRAPH_URL=${ENGINES.dev}`),
    );
    expect(production.lines.join("\n")).not.toContain("LOCUSGRAPH_URL");
  });

  it("allows Claude Code's read-only LocusGraph tools once, keeping the user's settings", async () => {
    const { home, run } = await workspace();
    const settings = join(home, ".claude/settings.json");
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(
      settings,
      JSON.stringify({
        model: "opus",
        permissions: { allow: ["Bash(git status)"], deny: ["Read(.env)"] },
      }),
    );

    await run(["claude-code"]);
    const { lines } = await run(["claude-code"]);
    const config = JSON.parse(await readFile(settings, "utf8"));

    expect(lines[0]).toBe("✔ Claude Code: ~/.claude/settings.json");
    expect(config).toEqual({
      model: "opus",
      permissions: {
        allow: [
          "Bash(git status)",
          "mcp__plugin_locusgraph_locusgraph__retrieve_memories",
          "mcp__plugin_locusgraph_locusgraph__list_contexts",
        ],
        deny: ["Read(.env)"],
      },
    });
  });

  it("accepts a local engine URL and shows it in the plan", async () => {
    const { cwd, run } = await workspace();
    await mkdir(join(cwd, ".vscode"));

    const { lines } = await run(["--engine", "http://localhost:8787/"]);

    expect(lines[0]).toBe("engine: http://localhost:8787");
  });

  it("rejects an unknown engine and a missing value before writing anything", async () => {
    const { run, read } = await workspace();

    const unknown = await run(["vscode", "--engine", "staging"]);
    const missing = await run(["vscode", "--engine"]);
    const insecure = await run(["vscode", "--engine", "http://api.example.com"]);

    expect(unknown).toEqual({
      exitCode: 1,
      lines: [expect.stringMatching(/unknown engine: staging/)],
    });
    expect(missing.lines[0]).toMatch(/--engine needs a value/);
    expect(insecure.lines[0]).toMatch(/unknown engine: http:\/\/api.example.com/);
    await expect(read(".vscode/mcp.json")).rejects.toThrow();
  });
});
