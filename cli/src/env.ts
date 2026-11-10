import { DEFAULT_ENGINE_URL } from "./config.ts";
import { NO_KEYS, type SavedKeys } from "./credentials.ts";

export type GraphSource = "env" | "repo" | "default";

export interface LocusGraphEnv {
  readonly engineUrl: string;
  readonly token: string | undefined;
  readonly graphId: string | undefined;
  // Where graphId came from, so recall can name the repository's graph.
  readonly graphSource?: GraphSource;
  readonly paidToolsEnabled: boolean;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

function chooseGraph(
  env: NodeJS.ProcessEnv,
  repoGraphId: string | undefined,
  saved: SavedKeys,
): { graphId: string; graphSource: GraphSource } | undefined {
  if (env.LOCUSGRAPH_GRAPH_ID) return { graphId: env.LOCUSGRAPH_GRAPH_ID, graphSource: "env" };
  if (repoGraphId !== undefined) return { graphId: repoGraphId, graphSource: "repo" };
  if (saved.defaultGraphId !== undefined) {
    return { graphId: saved.defaultGraphId, graphSource: "default" };
  }
  return undefined;
}

// The graph is LOCUSGRAPH_GRAPH_ID, else the repository's .locusgraph.json, else the saved
// default. The key is LOCUSGRAPH_TOKEN, else the saved key for that graph on this engine, else
// a saved account-wide key for this engine. A saved key never travels to another engine.
export function readEnv(
  env: NodeJS.ProcessEnv,
  saved: SavedKeys = NO_KEYS,
  repoGraphId?: string,
): LocusGraphEnv {
  const engineUrl = trimSlash(env.LOCUSGRAPH_URL || DEFAULT_ENGINE_URL);
  const paidToolsEnabled = env.LOCUSGRAPH_PAID === "1";
  const graph = chooseGraph(env, repoGraphId, saved);
  const onEngine = saved.keys.filter((entry) => entry.engineUrl === engineUrl);
  const savedKey =
    graph === undefined
      ? undefined
      : (onEngine.find((entry) => entry.graphId === graph.graphId) ??
        onEngine.find((entry) => entry.graphId === undefined));

  return {
    engineUrl,
    token: env.LOCUSGRAPH_TOKEN || savedKey?.key,
    graphId: graph?.graphId,
    ...(graph === undefined ? {} : { graphSource: graph.graphSource }),
    paidToolsEnabled,
  };
}
