import {
  readCredentials,
  removeCredentials,
  type SavedKey,
  withKey,
  withoutKey,
  writeCredentials,
} from "../credentials.ts";
import { retrieve } from "../engine.ts";
import { takeEngineFlag } from "../engine-flag.ts";
import type { CommandResult } from "./result.ts";

const GRAPH_FLAG = "--graph";
const ANY_FLAG = "--any";
const DEFAULT_FLAG = "--default";
const CHECK_TIMEOUT_MS = 8000;

// The engine's answer to one check: ok, or the HTTP status (0 when unreachable).
export type CheckKey = (
  entry: SavedKey,
) => Promise<{ ok: true } | { ok: false; status: number }>;

// A graph key proves itself with one free retrieve on that graph. An account-wide key lists the
// graphs it can read, which costs nothing and names no graph.
const checkKey: CheckKey = async (entry) => {
  if (entry.graphId !== undefined) {
    const result = await retrieve(
      {
        engineUrl: entry.engineUrl,
        token: entry.key,
        graphId: entry.graphId,
        paidToolsEnabled: false,
      },
      { query: "locusgraph login check", limit: 1, format: "json" },
      CHECK_TIMEOUT_MS,
    );
    return result.ok ? { ok: true } : { ok: false, status: result.status };
  }
  try {
    const response = await fetch(`${entry.engineUrl}/v1/graphs`, {
      headers: { authorization: `Bearer ${entry.key}` },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
};

const usage =
  "usage: <print your key> | lg login (--graph <graph_id> | --any) [--default] [--engine <production|dev|url>]\n" +
  "  --graph <id>  a key for one graph; the first one saved becomes the default\n" +
  "  --any         an account-wide key, used for any graph without its own key\n" +
  "  --default     make --graph <id> the graph used where a repository names none\n" +
  "The key is read from stdin, so it stays out of your shell history. Use a key limited to " +
  "memory.read.\n";

const logoutUsage =
  "usage: lg logout [--graph <graph_id> | --any] [--engine <production|dev|url>]\n";

interface Flags {
  readonly engineUrl: string;
  readonly graphId?: string;
  readonly any: boolean;
  readonly makeDefault: boolean;
}

function parseFlags(args: readonly string[]): Flags | Error {
  const engine = takeEngineFlag(args);
  if (engine instanceof Error) return engine;
  let graphId: string | undefined;
  let any = false;
  let makeDefault = false;
  const rest = engine.rest;
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index] ?? "";
    if (arg === GRAPH_FLAG || arg.startsWith(`${GRAPH_FLAG}=`)) {
      const value = arg === GRAPH_FLAG ? rest[++index] : arg.slice(GRAPH_FLAG.length + 1);
      if (value === undefined || value === "") return new Error(`${GRAPH_FLAG} needs a value`);
      graphId = value;
    } else if (arg === ANY_FLAG) {
      any = true;
    } else if (arg === DEFAULT_FLAG) {
      makeDefault = true;
    } else {
      return new Error(`unexpected argument: ${arg}`);
    }
  }
  if (graphId !== undefined && any)
    return new Error(`use ${GRAPH_FLAG} or ${ANY_FLAG}, not both`);
  if (makeDefault && graphId === undefined)
    return new Error(`${DEFAULT_FLAG} needs ${GRAPH_FLAG}`);
  return {
    engineUrl: engine.engineUrl,
    ...(graphId === undefined ? {} : { graphId }),
    any,
    makeDefault,
  };
}

export interface LoginContext {
  readonly key: string;
  readonly credentialsPath: string;
  readonly check?: CheckKey;
}

export async function login(
  args: readonly string[],
  { key, credentialsPath, check = checkKey }: LoginContext,
): Promise<CommandResult> {
  const flags = parseFlags(args);
  if (flags instanceof Error) return { exitCode: 1, stderr: `${flags.message}\n${usage}` };
  if ((flags.graphId === undefined && !flags.any) || key === "") {
    return { exitCode: 1, stderr: usage };
  }

  const entry: SavedKey = {
    key,
    engineUrl: flags.engineUrl,
    ...(flags.graphId === undefined ? {} : { graphId: flags.graphId }),
  };
  const result = await check(entry);
  if (!result.ok) {
    const reason =
      result.status === 0
        ? `could not reach ${entry.engineUrl}`
        : `the engine answered ${result.status}`;
    return {
      exitCode: 1,
      stderr: `key not saved: ${reason}. Check the key, the graph id and the engine.\n`,
    };
  }

  const saved = withKey(await readCredentials(credentialsPath), entry, flags.makeDefault);
  await writeCredentials(credentialsPath, saved);
  const what = entry.graphId === undefined ? "account-wide key" : `key for ${entry.graphId}`;
  const fallback =
    saved.defaultGraphId === undefined
      ? "no default graph yet: repositories without .locusgraph.json are skipped"
      : `default graph: ${saved.defaultGraphId}`;
  return {
    exitCode: 0,
    stdout: `saved ${what} to ${credentialsPath} (readable only by you)\n${fallback}\n`,
  };
}

export async function logout(
  args: readonly string[],
  credentialsPath: string,
): Promise<CommandResult> {
  const flags = parseFlags(args);
  if (flags instanceof Error || flags.makeDefault) {
    return {
      exitCode: 1,
      stderr: `${flags instanceof Error ? `${flags.message}\n` : ""}${logoutUsage}`,
    };
  }
  if (flags.graphId === undefined && !flags.any) {
    const removed = await removeCredentials(credentialsPath);
    return { exitCode: 0, stdout: removed ? `removed ${credentialsPath}\n` : "no saved key\n" };
  }

  const saved = await readCredentials(credentialsPath);
  const remaining = withoutKey(saved, flags.engineUrl, flags.graphId);
  const what = flags.graphId === undefined ? "account-wide key" : `key for ${flags.graphId}`;
  if (remaining.keys.length === saved.keys.length)
    return { exitCode: 0, stdout: `no saved ${what}\n` };
  await writeCredentials(credentialsPath, remaining);
  return { exitCode: 0, stdout: `removed ${what}\n` };
}
