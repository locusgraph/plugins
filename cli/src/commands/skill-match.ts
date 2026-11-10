import { type MatchSkill, matchSkill } from "../engine.ts";
import type { LocusGraphEnv } from "../env.ts";
import type { HookInput } from "../hook-input.ts";
import type { CommandResult } from "./result.ts";

const MIN_PROMPT_WORDS = 3;

// A UserPromptSubmit hook: when a stored skill fits the prompt, add one line to the context so
// the agent loads it even when it would not have looked. Silent otherwise, and on any failure.
export async function skillMatch(
  input: HookInput,
  env: LocusGraphEnv,
  match: MatchSkill = matchSkill,
): Promise<CommandResult> {
  const prompt = (input.prompt ?? "").trim();
  if (prompt.startsWith("/")) return { exitCode: 0 };
  if (prompt.split(/\s+/).filter(Boolean).length < MIN_PROMPT_WORDS) return { exitCode: 0 };
  if (env.token === undefined || env.graphId === undefined) return { exitCode: 0 };

  const skill = await match(env, prompt);
  if (skill === undefined) return { exitCode: 0 };
  return {
    exitCode: 0,
    stdout:
      `LocusGraph: the stored skill \`${skill.contextId}\` matches this request ` +
      `(${skill.text.trim()}). Before starting, load its steps, rules and lessons with the ` +
      "locusgraph-skills skill and follow them, unless the user says otherwise.\n",
  };
}
