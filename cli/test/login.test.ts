import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CheckKey, login, logout } from "../src/commands/login.ts";
import { ENGINES } from "../src/config.ts";
import { readCredentials, type SavedKey } from "../src/credentials.ts";

const accept: CheckKey = async () => ({ ok: true });

async function setup(check: CheckKey = accept) {
  const credentialsPath = join(await mkdtemp(join(tmpdir(), "lg-login-")), "credentials.json");
  const run = (args: string[], key = "lg_key") => login(args, { key, credentialsPath, check });
  return { credentialsPath, run };
}

describe("lg login", () => {
  it("checks a graph key against its graph and engine, then saves it as the default", async () => {
    let checked: SavedKey | undefined;
    const { credentialsPath, run } = await setup(async (entry) => {
      checked = entry;
      return { ok: true };
    });

    const result = await run(["--graph", "g_1", "--engine", "dev"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/default graph: g_1/);
    expect(checked).toEqual({ key: "lg_key", graphId: "g_1", engineUrl: ENGINES.dev });
    expect(await readCredentials(credentialsPath)).toEqual({
      keys: [{ key: "lg_key", graphId: "g_1", engineUrl: ENGINES.dev }],
      defaultGraphId: "g_1",
    });
  });

  it("keeps several graphs, and --default moves the default", async () => {
    const { credentialsPath, run } = await setup();

    await run(["--graph", "g_work"], "k_work");
    await run(["--graph", "g_personal"], "k_personal");
    expect((await readCredentials(credentialsPath)).defaultGraphId).toBe("g_work");

    await run(["--graph", "g_personal", "--default"], "k_personal");
    const saved = await readCredentials(credentialsPath);
    expect(saved.defaultGraphId).toBe("g_personal");
    expect(saved.keys.map((entry) => entry.graphId)).toEqual(["g_work", "g_personal"]);
  });

  it("saves an account-wide key with --any, and says no default is set yet", async () => {
    let checked: SavedKey | undefined;
    const { credentialsPath, run } = await setup(async (entry) => {
      checked = entry;
      return { ok: true };
    });

    const result = await run(["--any"]);

    expect(checked).toEqual({ key: "lg_key", engineUrl: ENGINES.production });
    expect(result.stdout).toMatch(/account-wide key/);
    expect(result.stdout).toMatch(/no default graph yet/);
    expect((await readCredentials(credentialsPath)).keys).toEqual([
      { key: "lg_key", engineUrl: ENGINES.production },
    ]);
  });

  it("saves nothing when the engine refuses the key", async () => {
    const { credentialsPath, run } = await setup(async () => ({ ok: false, status: 401 }));

    const result = await run(["--graph=g_1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/key not saved: the engine answered 401/);
    expect(await readCredentials(credentialsPath)).toEqual({ keys: [] });
  });

  it("rejects bad flags and a missing key before calling the engine", async () => {
    const { run } = await setup(async () => {
      throw new Error("must not check");
    });

    expect((await run([])).stderr).toMatch(
      /usage: .* \| lg login \(--graph <graph_id> \| --any\)/,
    );
    expect((await run(["--graph", "g_1"], "")).exitCode).toBe(1);
    expect((await run(["--graph"])).stderr).toMatch(/--graph needs a value/);
    expect((await run(["--graph", "g_1", "--any"])).stderr).toMatch(/not both/);
    expect((await run(["--any", "--default"])).stderr).toMatch(/--default needs --graph/);
    expect((await run(["--graph", "g_1", "lg_key_on_argv"])).stderr).toMatch(
      /unexpected argument/,
    );
  });
});

describe("lg logout", () => {
  it("removes one graph's key, or every key", async () => {
    const { credentialsPath, run } = await setup();
    await run(["--graph", "g_work"], "k_work");
    await run(["--graph", "g_personal"], "k_personal");

    expect((await logout(["--graph", "g_work"], credentialsPath)).stdout).toBe(
      "removed key for g_work\n",
    );
    expect(await readCredentials(credentialsPath)).toEqual({
      keys: [{ key: "k_personal", graphId: "g_personal", engineUrl: ENGINES.production }],
    });
    expect((await logout(["--graph", "g_work"], credentialsPath)).stdout).toBe(
      "no saved key for g_work\n",
    );
    expect((await logout([], credentialsPath)).stdout).toMatch(/^removed /);
    expect((await logout([], credentialsPath)).stdout).toBe("no saved key\n");
  });
});
