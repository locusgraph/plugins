import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CheckKey, login, logout } from "../src/commands/login.ts";
import { ENGINES } from "../src/config.ts";
import { readCredentials } from "../src/credentials.ts";
import type { LocusGraphEnv } from "../src/env.ts";

async function setup(check: CheckKey) {
  const credentialsPath = join(await mkdtemp(join(tmpdir(), "lg-login-")), "credentials.json");
  const run = (args: string[], key = "lg_key") =>
    login(args, { key, credentialsPath, paidToolsEnabled: false, check });
  return { credentialsPath, run };
}

describe("lg login", () => {
  it("checks the key against the graph and engine, then saves it", async () => {
    let checked: LocusGraphEnv | undefined;
    const { credentialsPath, run } = await setup(async (env) => {
      checked = env;
      return { ok: true, data: {} };
    });

    const result = await run(["--graph", "g_1", "--engine", "dev"]);

    expect(result.exitCode).toBe(0);
    expect(checked).toMatchObject({ token: "lg_key", graphId: "g_1", engineUrl: ENGINES.dev });
    expect(await readCredentials(credentialsPath)).toEqual({
      key: "lg_key",
      graphId: "g_1",
      engineUrl: ENGINES.dev,
    });
  });

  it("saves nothing when the engine refuses the key", async () => {
    const { credentialsPath, run } = await setup(async () => ({ ok: false, status: 401 }));

    const result = await run(["--graph=g_1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/key not saved: the engine answered 401/);
    expect(await readCredentials(credentialsPath)).toBeUndefined();
  });

  it("asks for the graph and a key on stdin before calling the engine", async () => {
    const { run } = await setup(async () => {
      throw new Error("must not check");
    });

    expect((await run([])).stderr).toMatch(/usage: .* \| lg login --graph <graph_id>/);
    expect((await run(["--graph", "g_1"], "")).exitCode).toBe(1);
    expect((await run(["--graph"])).stderr).toMatch(/--graph needs a value/);
    expect((await run(["--graph", "g_1", "lg_key_on_argv"])).stderr).toMatch(
      /unexpected argument/,
    );
  });

  it("logs out by removing the saved key", async () => {
    const { credentialsPath, run } = await setup(async () => ({ ok: true, data: {} }));
    await run(["--graph", "g_1"]);

    expect((await logout(credentialsPath)).stdout).toMatch(/^removed /);
    expect((await logout(credentialsPath)).stdout).toBe("no saved key\n");
  });
});
