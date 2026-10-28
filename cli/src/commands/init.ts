import { relative } from "node:path";
import {
  findPlatform,
  type InstallContext,
  PLATFORMS,
  type Platform,
} from "../platforms/index.ts";
import type { CommandResult } from "./result.ts";

const CONFIRM_FLAG = "--yes";
const PLATFORM_IDS = PLATFORMS.map((platform) => platform.id);

function displayPath(path: string, { cwd, home }: InstallContext): string {
  if (!path.startsWith("/")) return path;
  if (path.startsWith(cwd)) return relative(cwd, path);
  return path.startsWith(home) ? `~/${relative(home, path)}` : path;
}

function describePlan(platforms: readonly Platform[]): string[] {
  const rows = platforms.map(
    (platform) =>
      `  ${platform.id.padEnd(12)}${platform.label}` +
      (platform.writesGlobal === undefined
        ? ""
        : ` (also writes ${platform.writesGlobal}, which is global)`),
  );
  const first = platforms[0]?.id ?? "";
  return [
    "found:",
    ...rows,
    `nothing written. Run lg init ${CONFIRM_FLAG} to install all of them, or name the ones you want: lg init ${first}`,
  ];
}

async function installAll(
  platforms: readonly Platform[],
  context: InstallContext,
): Promise<{ lines: string[]; failed: boolean }> {
  const lines: string[] = [];
  let failed = false;
  for (const platform of platforms) {
    try {
      const written = (await platform.install(context)).map((path) =>
        displayPath(path, context),
      );
      lines.push(`✔ ${platform.label}${written.length > 0 ? `: ${written.join(", ")}` : ""}`);
      if (platform.nextStep !== undefined) lines.push(`  next: ${platform.nextStep}`);
    } catch (error) {
      failed = true;
      lines.push(
        `✘ ${platform.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  lines.push("→ the first LocusGraph tool call opens the browser to sign in");
  return { lines, failed };
}

const output = (exitCode: number, lines: readonly string[]): CommandResult => ({
  exitCode,
  stdout: `${lines.join("\n")}\n`,
});

export async function init(
  args: readonly string[],
  context: InstallContext,
): Promise<CommandResult> {
  const confirmed = args.includes(CONFIRM_FLAG);
  const named = args.filter((arg) => arg !== CONFIRM_FLAG);

  const unknown = named.filter((id) => findPlatform(id) === undefined);
  if (unknown.length > 0) {
    return output(1, [
      `unknown platform: ${unknown.join(", ")}. Choose from: ${PLATFORM_IDS.join(", ")}`,
    ]);
  }

  const chosen =
    named.length > 0
      ? named.flatMap((id) => findPlatform(id) ?? [])
      : PLATFORMS.filter((platform) => platform.detect(context));
  if (chosen.length === 0) {
    return output(1, [
      `no supported agent found here. Name one: lg init <${PLATFORM_IDS.join("|")}>`,
    ]);
  }

  if (named.length === 0 && !confirmed) return output(0, describePlan(chosen));

  const { lines, failed } = await installAll(chosen, context);
  return output(failed ? 1 : 0, lines);
}
