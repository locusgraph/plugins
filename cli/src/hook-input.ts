export interface HookInput {
  readonly cwd?: string;
  readonly tool_name?: string;
  readonly toolName?: string;
}

export function parseHookInput(text: string): HookInput {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as HookInput) : {};
  } catch {
    return {};
  }
}

export async function readHookInput(
  stdin: NodeJS.ReadStream = process.stdin,
): Promise<HookInput> {
  if (stdin.isTTY) return {};
  let text = "";
  for await (const chunk of stdin) text += chunk;
  return parseHookInput(text);
}
