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

export function describeWorkspace(cwd: string): Workspace {
  const repo = basename(git(cwd, "rev-parse", "--show-toplevel") || cwd);
  const branch = git(cwd, "branch", "--show-current");
  const recentSubjects = git(cwd, "log", "-5", "--format=%s");
  return { repo, query: [repo, branch, recentSubjects].filter(Boolean).join("\n") };
}
