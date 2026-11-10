import { type Credentials, removeCredentials, writeCredentials } from "../credentials.ts";
import { type RetrieveResult, retrieve } from "../engine.ts";
import { takeEngineFlag } from "../engine-flag.ts";
import type { LocusGraphEnv } from "../env.ts";
import type { CommandResult } from "./result.ts";

const GRAPH_FLAG = "--graph";
const CHECK_TIMEOUT_MS = 8000;

export type CheckKey = (env: LocusGraphEnv) => Promise<RetrieveResult>;

// One free retrieve proves the key reads that graph before it is saved.
const checkKey: CheckKey = (env) =>
  retrieve(
    env,
    { query: "locusgraph login check", limit: 1, format: "json" },
    CHECK_TIMEOUT_MS,
  );

const usage =
  "usage: <print your key> | lg login --graph <graph_id> [--engine <production|dev|url>]\n" +
  "The key is read from stdin, so it stays out of your shell history. Use a key limited to " +
  "memory.read on that graph.\n";

function takeGraphFlag(args: readonly string[]): { graphId?: string; rest: string[] } | Error {
  const rest: string[] = [];
  let graphId: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === GRAPH_FLAG || arg.startsWith(`${GRAPH_FLAG}=`)) {
      const value = arg === GRAPH_FLAG ? args[++index] : arg.slice(GRAPH_FLAG.length + 1);
      if (value === undefined || value === "") return new Error(`${GRAPH_FLAG} needs a value`);
      graphId = value;
    } else {
      rest.push(arg);
    }
  }
  return graphId === undefined ? { rest } : { graphId, rest };
}

export interface LoginContext {
  readonly key: string;
  readonly credentialsPath: string;
  readonly paidToolsEnabled: boolean;
  readonly check?: CheckKey;
}

export async function login(
  args: readonly string[],
  { key, credentialsPath, paidToolsEnabled, check = checkKey }: LoginContext,
): Promise<CommandResult> {
  const engine = takeEngineFlag(args);
  if (engine instanceof Error) return { exitCode: 1, stderr: `${engine.message}\n` };
  const graph = takeGraphFlag(engine.rest);
  if (graph instanceof Error) return { exitCode: 1, stderr: `${graph.message}\n${usage}` };
  if (graph.rest.length > 0) {
    return { exitCode: 1, stderr: `unexpected argument: ${graph.rest[0]}\n${usage}` };
  }
  if (graph.graphId === undefined || key === "") return { exitCode: 1, stderr: usage };

  const credentials: Credentials = {
    key,
    graphId: graph.graphId,
    engineUrl: engine.engineUrl,
  };
  const result = await check({
    engineUrl: credentials.engineUrl,
    token: credentials.key,
    graphId: credentials.graphId,
    paidToolsEnabled,
  });
  if (!result.ok) {
    const reason =
      result.status === 0
        ? `could not reach ${credentials.engineUrl}`
        : `the engine answered ${result.status}`;
    return {
      exitCode: 1,
      stderr: `key not saved: ${reason}. Check the key, the graph id and the engine.\n`,
    };
  }

  await writeCredentials(credentialsPath, credentials);
  return {
    exitCode: 0,
    stdout:
      `saved to ${credentialsPath} (readable only by you)\n` +
      "session-start recall and skill matching now fetch memories themselves\n",
  };
}

export async function logout(credentialsPath: string): Promise<CommandResult> {
  const removed = await removeCredentials(credentialsPath);
  return {
    exitCode: 0,
    stdout: removed ? `removed ${credentialsPath}\n` : "no saved key\n",
  };
}
