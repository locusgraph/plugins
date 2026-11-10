import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// A read-only API key the hooks use to fetch memories themselves, so recall does not depend on
// the agent choosing to call a tool. Saved by `lg login`, removed by `lg logout`.
export interface Credentials {
  readonly key: string;
  readonly graphId: string;
  readonly engineUrl: string;
}

export function credentialsPath(env: NodeJS.ProcessEnv, home: string): string {
  const base = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "locusgraph", "credentials.json");
}

export async function readCredentials(path: string): Promise<Credentials | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const { key, graph_id: graphId, engine_url: engineUrl } = value;
    if (typeof key !== "string" || key === "") return undefined;
    if (typeof graphId !== "string" || graphId === "") return undefined;
    if (typeof engineUrl !== "string" || engineUrl === "") return undefined;
    return { key, graphId, engineUrl };
  } catch {
    return undefined;
  }
}

export async function writeCredentials(path: string, credentials: Credentials): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const body = {
    key: credentials.key,
    graph_id: credentials.graphId,
    engine_url: credentials.engineUrl,
  };
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  // writeFile keeps the mode of a file that already exists; set it either way.
  await chmod(path, 0o600);
}

export async function removeCredentials(path: string): Promise<boolean> {
  try {
    await rm(path);
    return true;
  } catch {
    return false;
  }
}
