import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type JsonObject = { [key: string]: unknown };

const RULES_START = "<!-- locusgraph:start -->";
const RULES_END = "<!-- locusgraph:end -->";

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export async function readText(path: string): Promise<string | null> {
  return readFile(path, "utf8").catch(() => null);
}

export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export async function mergeJson(
  path: string,
  merge: (current: JsonObject) => JsonObject,
): Promise<void> {
  const current = await readText(path);
  let parsed: JsonObject = {};
  if (current !== null && current.trim() !== "") {
    try {
      parsed = asObject(JSON.parse(current));
    } catch {
      throw new Error(`${path} is not plain JSON; add the locusgraph entry by hand`);
    }
  }
  await writeText(path, `${JSON.stringify(merge(parsed), null, 2)}\n`);
}

export function withLocusGraphServer(key: string, entry: JsonObject) {
  return (config: JsonObject): JsonObject => ({
    ...config,
    [key]: { ...asObject(config[key]), locusgraph: entry },
  });
}

export function replaceRulesBlock(current: string, rules: string): string {
  const block = `${RULES_START}\n${rules.trim()}\n${RULES_END}\n`;
  const start = current.indexOf(RULES_START);
  const end = current.indexOf(RULES_END);
  if (start !== -1 && end > start) {
    return (
      current.slice(0, start) + block + current.slice(end + RULES_END.length).replace(/^\n/, "")
    );
  }
  return current === "" ? block : `${current.replace(/\n*$/, "\n\n")}${block}`;
}

export async function upsertRulesBlock(path: string, rules: string): Promise<void> {
  await writeText(path, replaceRulesBlock((await readText(path)) ?? "", rules));
}

export async function appendTomlTable(
  path: string,
  table: string,
  body: string,
): Promise<void> {
  const current = (await readText(path)) ?? "";
  if (current.includes(`[${table}]`)) return;
  const separated = current === "" ? "" : current.replace(/\n*$/, "\n\n");
  await writeText(path, `${separated}[${table}]\n${body}\n`);
}
