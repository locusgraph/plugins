import { DEFAULT_ENGINE_URL } from "./config.ts";

export interface LocusGraphEnv {
  readonly engineUrl: string;
  readonly token: string | undefined;
  readonly graphId: string | undefined;
  readonly paidToolsEnabled: boolean;
}

export function readEnv(env: NodeJS.ProcessEnv): LocusGraphEnv {
  return {
    engineUrl: (env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL).replace(/\/+$/, ""),
    token: env.LOCUSGRAPH_TOKEN || undefined,
    graphId: env.LOCUSGRAPH_GRAPH_ID || undefined,
    paidToolsEnabled: env.LOCUSGRAPH_PAID === "1",
  };
}
