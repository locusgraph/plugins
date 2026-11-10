import { DEFAULT_ENGINE_URL } from "./config.ts";
import type { Credentials } from "./credentials.ts";

export interface LocusGraphEnv {
  readonly engineUrl: string;
  readonly token: string | undefined;
  readonly graphId: string | undefined;
  readonly paidToolsEnabled: boolean;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

// LOCUSGRAPH_TOKEN and LOCUSGRAPH_GRAPH_ID, when either is set, replace saved credentials as a
// pair, so a saved key is never sent with another graph id. Saved credentials apply only to the
// engine they were made for, so a production key is never sent to dev.
export function readEnv(env: NodeJS.ProcessEnv, saved?: Credentials): LocusGraphEnv {
  const engineUrl = trimSlash(env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL);
  const fromEnv = Boolean(env.LOCUSGRAPH_TOKEN || env.LOCUSGRAPH_GRAPH_ID);
  const usable = !fromEnv && saved !== undefined && trimSlash(saved.engineUrl) === engineUrl;
  return {
    engineUrl,
    token: usable ? saved.key : env.LOCUSGRAPH_TOKEN || undefined,
    graphId: usable ? saved.graphId : env.LOCUSGRAPH_GRAPH_ID || undefined,
    paidToolsEnabled: env.LOCUSGRAPH_PAID === "1",
  };
}
