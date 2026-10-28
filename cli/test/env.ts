import type { LocusGraphEnv } from "../src/env.ts";

export function testEnv(overrides: Partial<LocusGraphEnv> = {}): LocusGraphEnv {
  return {
    engineUrl: "http://127.0.0.1:9",
    token: undefined,
    graphId: undefined,
    paidToolsEnabled: false,
    ...overrides,
  };
}
