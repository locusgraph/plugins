import { DEFAULT_ENGINE_URL, ENGINES, resolveEngine } from "./config.ts";

export const ENGINE_FLAG = "--engine";

const ENGINE_CHOICES = `${Object.keys(ENGINES).join(", ")}, or an https:// URL`;

export interface EngineSelection {
  readonly engineUrl: string;
  readonly rest: readonly string[];
}

function engineFrom(value: string | undefined): string | Error {
  if (value === undefined || value === "") {
    return new Error(`${ENGINE_FLAG} needs a value: ${ENGINE_CHOICES}`);
  }
  return (
    resolveEngine(value) ?? new Error(`unknown engine: ${value}. Choose ${ENGINE_CHOICES}`)
  );
}

export function takeEngineFlag(args: readonly string[]): EngineSelection | Error {
  let engineUrl: string = DEFAULT_ENGINE_URL;
  const rest: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg !== ENGINE_FLAG && !arg.startsWith(`${ENGINE_FLAG}=`)) {
      rest.push(arg);
      continue;
    }
    index += arg === ENGINE_FLAG ? 1 : 0;
    const engine = engineFrom(
      arg === ENGINE_FLAG ? args[index] : arg.slice(ENGINE_FLAG.length + 1),
    );
    if (engine instanceof Error) return engine;
    engineUrl = engine;
  }

  return { engineUrl, rest };
}
