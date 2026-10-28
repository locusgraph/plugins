#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const PAID_TOOL = /(^|__)(observe|deep_recall)$/;
const RECALL_LIMIT = 6;
const RECALL_TIMEOUT_MS = 4000;

const STORE_AFTER_COMPACT =
  "LocusGraph: the conversation was just compacted. Before continuing, store at most 3 durable " +
  "decisions, constraints or user corrections from the summary above with `store_event` " +
  "(source: user or assistant, a stable `type:name` context_id). Skip anything already in " +
  "CLAUDE.md, AGENTS.md or git history. If nothing qualifies, store nothing.";

function git(cwd, ...args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function workspaceQuery(cwd) {
  const root = git(cwd, "rev-parse", "--show-toplevel") || cwd;
  const branch = git(cwd, "branch", "--show-current");
  const recentSubjects = git(cwd, "log", "-5", "--format=%s");
  return [basename(root), branch, recentSubjects].filter(Boolean).join("\n");
}

async function readHookInput() {
  if (process.stdin.isTTY) return {};
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function fetchMemories(env, query) {
  if (!env.LOCUSGRAPH_TOKEN || !env.LOCUSGRAPH_GRAPH_ID) return "";
  const baseUrl = (env.LOCUSGRAPH_URL || "https://api.locusgraph.com").replace(/\/+$/, "");
  try {
    const response = await fetch(`${baseUrl}/v1/memories`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.LOCUSGRAPH_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        graph_id: env.LOCUSGRAPH_GRAPH_ID,
        query,
        limit: RECALL_LIMIT,
        format: "toon",
      }),
      signal: AbortSignal.timeout(RECALL_TIMEOUT_MS),
    });
    if (!response.ok) return "";
    const { data } = await response.json();
    return typeof data?.memories === "string" ? data.memories.trim() : "";
  } catch {
    return "";
  }
}

export function guardVerdict(env, toolName) {
  if (env.LOCUSGRAPH_PAID === "1" || !PAID_TOOL.test(toolName)) return { allowed: true };
  return {
    allowed: false,
    reason:
      `${toolName} spends LocusGraph credits and is disabled. ` +
      "Use retrieve_memories (free) instead, or set LOCUSGRAPH_PAID=1 to enable paid tools.",
  };
}

async function recall(input, { afterCompact }) {
  const memories = await fetchMemories(process.env, workspaceQuery(input.cwd || process.cwd()));
  const sections = [];
  if (memories !== "") sections.push(`LocusGraph memories for this workspace:\n${memories}`);
  if (afterCompact) sections.push(STORE_AFTER_COMPACT);
  if (sections.length > 0) process.stdout.write(`${sections.join("\n\n")}\n`);
  return 0;
}

function guard(input, { dialect }) {
  const toolName = String(input.tool_name ?? input.toolName ?? "");
  const verdict = guardVerdict(process.env, toolName);
  if (dialect === "cursor") {
    process.stdout.write(
      JSON.stringify(
        verdict.allowed
          ? { permission: "allow" }
          : { permission: "deny", userMessage: verdict.reason, agentMessage: verdict.reason },
      ),
    );
    return 0;
  }
  if (verdict.allowed) return 0;
  process.stderr.write(`${verdict.reason}\n`);
  return 2;
}

const COMMANDS = {
  recall: (input, flags) => recall(input, { afterCompact: flags.has("--after-compact") }),
  guard: (input, flags) => guard(input, { dialect: flags.has("--cursor") ? "cursor" : "claude" }),
};

async function main(argv) {
  const [name, ...rest] = argv;
  const command = COMMANDS[name];
  if (command === undefined) {
    process.stderr.write(`usage: lg <${Object.keys(COMMANDS).join("|")}> [flags]\n`);
    return 1;
  }
  return command(await readHookInput(), new Set(rest));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
