import { DEFAULT_ENGINE_URL, ENGINES, resolveEngine } from "../config.ts";

export const CONFIRM_FLAG = "--yes";
export const ENGINE_FLAG = "--engine";

const ENGINE_CHOICES = `${Object.keys(ENGINES).join(", ")}, or an https:// URL`;

export interface InitArgs {
  readonly confirmed: boolean;
  readonly platformIds: readonly string[];
  readonly engineUrl: string;
}

function engineFrom(value: string | undefined): string | Error {
  if (value === undefined || value === "") {
    return new Error(`${ENGINE_FLAG} needs a value: ${ENGINE_CHOICES}`);
  }
  return (
    resolveEngine(value) ?? new Error(`unknown engine: ${value}. Choose ${ENGINE_CHOICES}`)
  );
}

export function parseInitArgs(args: readonly string[]): InitArgs | Error {
  let confirmed = false;
  let engineUrl: string = DEFAULT_ENGINE_URL;
  const platformIds: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg === CONFIRM_FLAG) {
      confirmed = true;
    } else if (arg === ENGINE_FLAG || arg.startsWith(`${ENGINE_FLAG}=`)) {
      index += arg === ENGINE_FLAG ? 1 : 0;
      const engine = engineFrom(
        arg === ENGINE_FLAG ? args[index] : arg.slice(ENGINE_FLAG.length + 1),
      );
      if (engine instanceof Error) return engine;
      engineUrl = engine;
    } else {
      platformIds.push(arg);
    }
  }

  return { confirmed, platformIds, engineUrl };
}
