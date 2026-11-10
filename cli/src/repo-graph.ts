import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO_GRAPH_FILE = ".locusgraph.json";

// Graph ids land in URLs and storage keys, so the file may only name a plain one.
const GRAPH_ID = /^[A-Za-z0-9_-]{1,128}$/;

function gitRoot(cwd: string): string | undefined {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root === "" ? undefined : root;
  } catch {
    return undefined;
  }
}

// The graph a repository names in .locusgraph.json at its git root, committed so everyone on
// the team uses the same one. Undefined when there is no repository, no file, or no valid id.
export function readRepoGraph(cwd: string): string | undefined {
  const root = gitRoot(cwd);
  if (root === undefined) return undefined;
  try {
    const value = JSON.parse(readFileSync(join(root, REPO_GRAPH_FILE), "utf8")) as unknown;
    const graphId =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>).graph_id
        : undefined;
    return typeof graphId === "string" && GRAPH_ID.test(graphId) ? graphId : undefined;
  } catch {
    return undefined;
  }
}
