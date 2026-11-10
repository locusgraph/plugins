import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// Read-only API keys the hooks use to fetch memories themselves, so recall does not depend on
// the agent choosing to call a tool. Saved by `lg login`, removed by `lg logout`.
//
// A key either belongs to one graph or, with no graphId, reaches every graph its account can
// read. Each key belongs to one engine, so a production key is never sent to dev.
export interface SavedKey {
  readonly key: string;
  readonly engineUrl: string;
  readonly graphId?: string;
}

export interface SavedKeys {
  readonly keys: readonly SavedKey[];
  // The graph a repository without a .locusgraph.json uses.
  readonly defaultGraphId?: string;
}

export const NO_KEYS: SavedKeys = { keys: [] };

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const text = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

export function credentialsPath(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "locusgraph", "credentials.json");
}

function keyFrom(value: unknown): SavedKey | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const entry = value as Record<string, unknown>;
  const key = text(entry.key);
  const engineUrl = text(entry.engine_url);
  if (key === undefined || engineUrl === undefined) return undefined;
  const graphId = text(entry.graph_id);
  return {
    key,
    engineUrl: trimSlash(engineUrl),
    ...(graphId === undefined ? {} : { graphId }),
  };
}

export async function readCredentials(path: string): Promise<SavedKeys> {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return NO_KEYS;
  }
  // Version 1 held a single key for one graph, which also served as the default.
  if (!Array.isArray(value.keys)) {
    const single = keyFrom(value);
    if (single?.graphId === undefined) return NO_KEYS;
    return { keys: [single], defaultGraphId: single.graphId };
  }
  const keys = value.keys.flatMap((entry) => keyFrom(entry) ?? []);
  const defaultGraphId = text(value.default_graph_id);
  return defaultGraphId === undefined ? { keys } : { keys, defaultGraphId };
}

export async function writeCredentials(path: string, saved: SavedKeys): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const body = {
    version: 2,
    ...(saved.defaultGraphId === undefined ? {} : { default_graph_id: saved.defaultGraphId }),
    keys: saved.keys.map((entry) => ({
      key: entry.key,
      engine_url: entry.engineUrl,
      ...(entry.graphId === undefined ? {} : { graph_id: entry.graphId }),
    })),
  };
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  // writeFile keeps the mode of a file that already exists; set it either way.
  await chmod(path, 0o600);
}

const sameSlot = (a: SavedKey, b: SavedKey) =>
  a.engineUrl === b.engineUrl && a.graphId === b.graphId;

// Adds a key, replacing the one for the same engine and graph. The first graph saved becomes
// the default unless one is named.
export function withKey(saved: SavedKeys, entry: SavedKey, makeDefault: boolean): SavedKeys {
  const keys = [...saved.keys.filter((existing) => !sameSlot(existing, entry)), entry];
  const defaultGraphId =
    makeDefault && entry.graphId !== undefined
      ? entry.graphId
      : (saved.defaultGraphId ?? entry.graphId);
  return defaultGraphId === undefined ? { keys } : { keys, defaultGraphId };
}

// Removes the key for one engine and graph (graphId undefined: the account-wide key).
export function withoutKey(
  saved: SavedKeys,
  engineUrl: string,
  graphId: string | undefined,
): SavedKeys {
  const target = { key: "", engineUrl: trimSlash(engineUrl), ...(graphId ? { graphId } : {}) };
  const keys = saved.keys.filter((existing) => !sameSlot(existing, target));
  const defaultGraphId = saved.defaultGraphId === graphId ? undefined : saved.defaultGraphId;
  return defaultGraphId === undefined ? { keys } : { keys, defaultGraphId };
}

export async function removeCredentials(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}
