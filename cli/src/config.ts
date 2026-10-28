export const ENGINES = {
  production: "https://api.locusgraph.com",
  dev: "https://api.dev.locusgraph.com",
} as const;

export const DEFAULT_ENGINE_URL = ENGINES.production;
export const PAID_TOOLS = ["observe", "deep_recall"] as const;

export function mcpUrlFor(engineUrl: string): string {
  return `${engineUrl}/mcp?tools=free`;
}

export function resolveEngine(value: string): string | undefined {
  if (value in ENGINES) return ENGINES[value as keyof typeof ENGINES];
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
