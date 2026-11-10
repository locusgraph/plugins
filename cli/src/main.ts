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
import { readHookInput, readStdin } from "./hook-input.ts";

type Command = (args: readonly string[]) => Promise<CommandResult>;

const savedPath = () => credentialsPath(process.env, homedir());

async function hookEnv(): Promise<LocusGraphEnv> {
  return readEnv(process.env, await readCredentials(savedPath()));
}

const COMMANDS: Record<string, Command> = {
  recall: async (args) =>
    recall(await readHookInput(), await hookEnv(), {
      afterCompact: args.includes("--after-compact"),
    }),
  guard: async (args) =>
    guard(
      await readHookInput(),
      readEnv(process.env),
      args.includes("--cursor") ? "cursor" : "claude",
    ),
  "skill-match": async () => skillMatch(await readHookInput(), await hookEnv()),
  init: (args) =>
    init(args, {
      cwd: process.cwd(),
      home: homedir(),
      rules: RULES,
      hookScript: fileURLToPath(import.meta.url),
    }),
  links: async (args) => links(args),
  login: async (args) =>
    login(args, {
      key: (await readStdin()).trim(),
      credentialsPath: savedPath(),
      paidToolsEnabled: readEnv(process.env).paidToolsEnabled,
    }),
  logout: async () => logout(savedPath()),
};

export async function main(argv: readonly string[]): Promise<CommandResult> {
  const [name = "", ...args] = argv;
  const command = COMMANDS[name];
  if (command === undefined) {
    return { exitCode: 1, stderr: `usage: lg <${Object.keys(COMMANDS).join("|")}> [args]\n` };
  }
  return command(args);
}
