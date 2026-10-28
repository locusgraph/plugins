import { claudeCode } from "./claude-code.ts";
import { codex } from "./codex.ts";
import { cursor } from "./cursor.ts";
import { gemini } from "./gemini.ts";
import { opencode } from "./opencode.ts";
import type { Platform } from "./platform.ts";
import { vscode } from "./vscode.ts";

export const PLATFORMS: readonly Platform[] = [
  cursor,
  codex,
  opencode,
  gemini,
  vscode,
  claudeCode,
];

export function findPlatform(id: string): Platform | undefined {
  return PLATFORMS.find((platform) => platform.id === id);
}

export type { InitEnvironment, InstallContext, Platform } from "./platform.ts";
