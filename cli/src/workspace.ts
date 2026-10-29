import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export interface Workspace {
  readonly repo: string;
  readonly query: string;
}

function git(cwd: string, ...args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function contextSafeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

const LONG_LIVED_BRANCHES = new Set(["main", "master", "dev", "develop", "trunk"]);

export function sessionQuery(repo: string, branch: string): string {
  const task = LONG_LIVED_BRANCHES.has(branch) ? "" : branch.replace(/[/_-]+/g, " ");
  return [repo, "constraints decisions conventions known fixes", task]
    .filter(Boolean)
    .join(" ");
}

export function describeWorkspace(cwd: string): Workspace {
  const repo = contextSafeName(basename(git(cwd, "rev-parse", "--show-toplevel") || cwd));
  return { repo, query: sessionQuery(repo, git(cwd, "branch", "--show-current")) };
}
