export interface HookInput {
  readonly cwd?: string;
  readonly tool_name?: string;
  readonly toolName?: string;
  readonly prompt?: string;
}

export function parseHookInput(text: string): HookInput {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as HookInput) : {};
  } catch {
    return {};
  }
}

export async function readStdin(stdin: NodeJS.ReadStream = process.stdin): Promise<string> {
  if (stdin.isTTY) return "";
  let text = "";
  for await (const chunk of stdin) text += chunk;
  return text;
}

export async function readHookInput(
  stdin: NodeJS.ReadStream = process.stdin,
): Promise<HookInput> {
  return parseHookInput(await readStdin(stdin));
}
