import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRepoGraph } from "../src/repo-graph.ts";

async function repo(file?: unknown) {
  const root = await mkdtemp(join(tmpdir(), "lg-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  if (file !== undefined) {
    await writeFile(
      join(root, ".locusgraph.json"),
      typeof file === "string" ? file : JSON.stringify(file),
    );
  }
  return root;
}

describe("readRepoGraph", () => {
  it("reads graph_id from .locusgraph.json at the git root, from any subfolder", async () => {
    const root = await repo({ graph_id: "g_work" });
    const nested = join(root, "src/deep");
    await mkdir(nested, { recursive: true });

    expect(readRepoGraph(root)).toBe("g_work");
    expect(readRepoGraph(nested)).toBe("g_work");
  });

  it("returns nothing without a file, a repository, or a plain graph id", async () => {
    expect(readRepoGraph(await repo())).toBeUndefined();
    expect(readRepoGraph(await mkdtemp(join(tmpdir(), "lg-norepo-")))).toBeUndefined();
    expect(readRepoGraph(await repo({ graph_id: "../etc" }))).toBeUndefined();
    expect(readRepoGraph(await repo("not json"))).toBeUndefined();
  });
});
