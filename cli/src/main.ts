import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { guard } from "./commands/guard.ts";
import { init } from "./commands/init.ts";
import { links } from "./commands/links.ts";
import { recall } from "./commands/recall.ts";
import type { CommandResult } from "./commands/result.ts";
import { readEnv } from "./env.ts";
import { RULES } from "./generated/rules.ts";
import { readHookInput } from "./hook-input.ts";

type Command = (args: readonly string[]) => Promise<CommandResult>;

const COMMANDS: Record<string, Command> = {
  recall: async (args) =>
    recall(await readHookInput(), readEnv(process.env), {
      afterCompact: args.includes("--after-compact"),
    }),
  guard: async (args) =>
    guard(
      await readHookInput(),
      readEnv(process.env),
      args.includes("--cursor") ? "cursor" : "claude",
    ),
  init: (args) =>
    init(args, {
      cwd: process.cwd(),
      home: homedir(),
      rules: RULES,
      hookScript: fileURLToPath(import.meta.url),
    }),
  links: async (args) => links(args),
};

export async function main(argv: readonly string[]): Promise<CommandResult> {
  const [name = "", ...args] = argv;
  const command = COMMANDS[name];
  if (command === undefined) {
    return { exitCode: 1, stderr: `usage: lg <${Object.keys(COMMANDS).join("|")}> [args]\n` };
  }
  return command(args);
}
