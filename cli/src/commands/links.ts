import { DEFAULT_ENGINE_URL } from "../config.ts";
import { installLinks } from "../deeplinks.ts";
import { takeEngineFlag } from "../engine-flag.ts";
import type { CommandResult } from "./result.ts";

export function links(args: readonly string[]): CommandResult {
  const selection = takeEngineFlag(args);
  if (selection instanceof Error) return { exitCode: 1, stderr: `${selection.message}\n` };
  if (selection.rest.length > 0) {
    return { exitCode: 1, stderr: `unexpected argument: ${selection.rest.join(" ")}\n` };
  }

  const { cursor, vscode, vscodeInsiders } = installLinks(selection.engineUrl);
  const engineLine =
    selection.engineUrl === DEFAULT_ENGINE_URL ? [] : [`engine: ${selection.engineUrl}`];
  const lines = [
    ...engineLine,
    `Cursor:           ${cursor}`,
    `VS Code:          ${vscode}`,
    `VS Code Insiders: ${vscodeInsiders}`,
    "These install the MCP server only. Run lg init cursor or lg init vscode for the rules.",
  ];
  return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
}
