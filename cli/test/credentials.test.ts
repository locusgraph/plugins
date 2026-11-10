import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINES } from "../src/config.ts";
import {
  credentialsPath,
  readCredentials,
  removeCredentials,
  writeCredentials,
} from "../src/credentials.ts";
import { readEnv } from "../src/env.ts";

const saved = { key: "lg_key", graphId: "g_saved", engineUrl: ENGINES.production };

describe("credentials", () => {
  it("lives under XDG_CONFIG_HOME when set, else ~/.config", () => {
    expect(credentialsPath({}, "/home/u")).toBe("/home/u/.config/locusgraph/credentials.json");
    expect(credentialsPath({ XDG_CONFIG_HOME: "/x" }, "/home/u")).toBe(
      "/x/locusgraph/credentials.json",
    );
  });

  it("round-trips, is readable only by its owner, and can be removed", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "lg-cred-")), "locusgraph/credentials.json");

    await writeCredentials(path, saved);

    expect(await readCredentials(path)).toEqual(saved);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await removeCredentials(path)).toBe(true);
    expect(await readCredentials(path)).toBeUndefined();
    expect(await removeCredentials(path)).toBe(false);
  });

  it("ignores a file that is not complete credentials", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "lg-cred-")), "credentials.json");
    await writeFile(path, JSON.stringify({ key: "k" }));

    expect(await readCredentials(path)).toBeUndefined();
  });
});

describe("readEnv", () => {
  it("uses saved credentials for the engine they were made for", () => {
    expect(readEnv({}, saved)).toMatchObject({ token: "lg_key", graphId: "g_saved" });
  });

  it("never sends a saved key to another engine", () => {
    expect(readEnv({ LOCUSGRAPH_URL: ENGINES.dev }, saved)).toMatchObject({
      engineUrl: ENGINES.dev,
      token: undefined,
      graphId: undefined,
    });
  });

  it("lets the environment replace saved credentials as a pair", () => {
    expect(readEnv({ LOCUSGRAPH_GRAPH_ID: "g_env" }, saved)).toMatchObject({
      token: undefined,
      graphId: "g_env",
    });
    expect(
      readEnv({ LOCUSGRAPH_TOKEN: "t_env", LOCUSGRAPH_GRAPH_ID: "g_env" }, saved),
    ).toMatchObject({ token: "t_env", graphId: "g_env" });
  });
});
