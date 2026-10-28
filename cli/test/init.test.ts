import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { init } from "../src/commands/init.ts";
import { MCP_URL } from "../src/config.ts";

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
    expect((await readJson(".vscode/mcp.json")).servers.locusgraph.url).toBe(MCP_URL);
  });

  it("installs every detected platform with --yes, and only those", async () => {
    const { cwd, run, read, readJson } = await workspace();
    await mkdir(join(cwd, ".vscode"));

    expect((await run(["--yes"])).exitCode).toBe(0);
    expect((await readJson(".vscode/mcp.json")).servers.locusgraph.url).toBe(MCP_URL);
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
});
