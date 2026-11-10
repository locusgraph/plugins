import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { guard } from "./commands/guard.ts";
import { init } from "./commands/init.ts";
import { links } from "./commands/links.ts";
import { login, logout } from "./commands/login.ts";
import { recall } from "./commands/recall.ts";
import type { CommandResult } from "./commands/result.ts";
import { skillMatch } from "./commands/skill-match.ts";
import { credentialsPath, readCredentials } from "./credentials.ts";
import { type LocusGraphEnv, readEnv } from "./env.ts";
import { RULES } from "./generated/rules.ts";
import { type HookInput, hookCwd, readHookInput, readStdin } from "./hook-input.ts";
import { readRepoGraph } from "./repo-graph.ts";

type Command = (args: readonly string[]) => Promise<CommandResult>;

const savedPath = () => credentialsPath(process.env, homedir());

// Hooks resolve the graph for the repository the session runs in.
async function hookEnv(input: HookInput): Promise<LocusGraphEnv> {
  return readEnv(
    process.env,
    await readCredentials(savedPath()),
    readRepoGraph(hookCwd(input)),
  );
}

const COMMANDS: Record<string, Command> = {
  recall: async (args) => {
    const input = await readHookInput();
    return recall(input, await hookEnv(input), {
      afterCompact: args.includes("--after-compact"),
      cursor: args.includes("--cursor"),
    });
  },
  guard: async (args) =>
    guard(
      await readHookInput(),
      readEnv(process.env),
      args.includes("--cursor") ? "cursor" : "claude",
    ),
  "skill-match": async () => {
    const input = await readHookInput();
    return skillMatch(input, await hookEnv(input));
  },
  init: (args) =>
    init(args, {
      cwd: process.cwd(),
      home: homedir(),
      rules: RULES,
      hookScript: fileURLToPath(import.meta.url),
      ...(process.env.CLAUDE_CONFIG_DIR
        ? { claudeConfigDir: process.env.CLAUDE_CONFIG_DIR }
        : {}),
    }),
  links: async (args) => links(args),
  login: async (args) =>
    login(args, { key: (await readStdin()).trim(), credentialsPath: savedPath() }),
  logout: async (args) => logout(args, savedPath()),
};

export async function main(argv: readonly string[]): Promise<CommandResult> {
  const [name = "", ...args] = argv;
  const command = COMMANDS[name];
  if (command === undefined) {
    return { exitCode: 1, stderr: `usage: lg <${Object.keys(COMMANDS).join("|")}> [args]\n` };
  }
  return command(args);
}
