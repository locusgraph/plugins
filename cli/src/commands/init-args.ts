import { takeEngineFlag } from "../engine-flag.ts";

export const CONFIRM_FLAG = "--yes";

export interface InitArgs {
  readonly confirmed: boolean;
  readonly platformIds: readonly string[];
  readonly engineUrl: string;
}

export function parseInitArgs(args: readonly string[]): InitArgs | Error {
  const selection = takeEngineFlag(args);
  if (selection instanceof Error) return selection;
  return {
    confirmed: selection.rest.includes(CONFIRM_FLAG),
    platformIds: selection.rest.filter((arg) => arg !== CONFIRM_FLAG),
    engineUrl: selection.engineUrl,
  };
}
