import { spawnSync } from "node:child_process";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUNDLES = ["claude-code/hooks/lg.mjs", "cursor/.cursor/hooks/lg.mjs"];

function run(script: string, args: string[], input: unknown) {
  return spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
}

describe.each(BUNDLES)("the committed bundle %s", (bundle) => {
  const script = join(repoRoot, bundle);

  it("blocks a paid tool as a Claude Code hook", () => {
    const result = run(script, ["guard"], { tool_name: "mcp__locusgraph__observe" });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/spends LocusGraph credits/);
  });

  it("runs when started through a symlink, as npm bin does", async () => {
    const link = join(await mkdtemp(join(tmpdir(), "lg-bin-")), "lg");
    await symlink(script, link);

    expect(run(link, ["guard", "--cursor"], { tool_name: "deep_recall" }).stdout).toMatch(
      /"deny"/,
    );
  });

  it("prints usage for an unknown command", () => {
    const result = run(script, ["teleport"], {});

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /usage: lg <recall\|guard\|skill-match\|init\|links\|login\|logout>/,
    );
  });
});
