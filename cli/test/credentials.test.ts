import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ENGINES } from "../src/config.ts";
import {
  credentialsPath,
  readCredentials,
  removeCredentials,
  type SavedKeys,
  withKey,
  withoutKey,
  writeCredentials,
} from "../src/credentials.ts";
import { readEnv } from "../src/env.ts";

const PROD = ENGINES.production;
const work = { key: "k_work", engineUrl: PROD, graphId: "g_work" };
const personal = { key: "k_personal", engineUrl: PROD, graphId: "g_personal" };
const anyGraph = { key: "k_any", engineUrl: PROD };

const tempFile = async (name = "credentials.json") =>
  join(await mkdtemp(join(tmpdir(), "lg-cred-")), name);

describe("credentials", () => {
  it("lives under XDG_CONFIG_HOME when set, else ~/.config", () => {
    expect(credentialsPath({}, "/home/u")).toBe("/home/u/.config/locusgraph/credentials.json");
    expect(credentialsPath({ XDG_CONFIG_HOME: "/x" }, "/home/u")).toBe(
      "/x/locusgraph/credentials.json",
    );
  });

  it("round-trips several keys, is readable only by its owner, and can be removed", async () => {
    const path = await tempFile("locusgraph/credentials.json");
    const saved: SavedKeys = { keys: [work, anyGraph], defaultGraphId: "g_work" };

    await writeCredentials(path, saved);

    expect(await readCredentials(path)).toEqual(saved);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await removeCredentials(path)).toBe(true);
    expect(await readCredentials(path)).toEqual({ keys: [] });
    expect(await removeCredentials(path)).toBe(false);
  });

  it("reads a version 1 file as one key that is also the default", async () => {
    const path = await tempFile();
    await writeFile(
      path,
      JSON.stringify({ key: "k", graph_id: "g_old", engine_url: `${PROD}/` }),
    );

    expect(await readCredentials(path)).toEqual({
      keys: [{ key: "k", graphId: "g_old", engineUrl: PROD }],
      defaultGraphId: "g_old",
    });
  });

  it("ignores entries that are not complete keys", async () => {
    const path = await tempFile();
    await writeFile(path, JSON.stringify({ keys: [{ key: "k" }, { engine_url: PROD }] }));

    expect(await readCredentials(path)).toEqual({ keys: [] });
  });

  it("adds keys, replaces the one for the same graph, and keeps the first default", () => {
    let saved = withKey({ keys: [] }, work, false);
    saved = withKey(saved, personal, false);
    saved = withKey(saved, { ...work, key: "k_work_2" }, false);

    expect(saved.defaultGraphId).toBe("g_work");
    expect(saved.keys).toEqual([personal, { ...work, key: "k_work_2" }]);
    expect(withKey(saved, personal, true).defaultGraphId).toBe("g_personal");
  });

  it("removes one key and drops the default with it", () => {
    const saved: SavedKeys = { keys: [work, personal, anyGraph], defaultGraphId: "g_work" };

    expect(withoutKey(saved, PROD, "g_work")).toEqual({ keys: [personal, anyGraph] });
    expect(withoutKey(saved, PROD, undefined).keys).toEqual([work, personal]);
  });
});

describe("readEnv", () => {
  const saved: SavedKeys = { keys: [work, personal], defaultGraphId: "g_work" };

  it("uses the saved default graph and its key when the repository names none", () => {
    expect(readEnv({}, saved)).toMatchObject({
      token: "k_work",
      graphId: "g_work",
      graphSource: "default",
    });
  });

  it("follows the repository's graph and picks that graph's key", () => {
    expect(readEnv({}, saved, "g_personal")).toMatchObject({
      token: "k_personal",
      graphId: "g_personal",
      graphSource: "repo",
    });
  });

  it("falls back to an account-wide key for a graph without its own", () => {
    expect(readEnv({}, { keys: [work, anyGraph] }, "g_team")).toMatchObject({
      token: "k_any",
      graphId: "g_team",
    });
    expect(readEnv({}, { keys: [work] }, "g_team")).toMatchObject({
      token: undefined,
      graphId: "g_team",
    });
  });

  it("lets LOCUSGRAPH_GRAPH_ID win over the repository, and LOCUSGRAPH_TOKEN over saved keys", () => {
    expect(readEnv({ LOCUSGRAPH_GRAPH_ID: "g_personal" }, saved, "g_work")).toMatchObject({
      token: "k_personal",
      graphSource: "env",
    });
    expect(readEnv({ LOCUSGRAPH_TOKEN: "t_env" }, saved, "g_work")).toMatchObject({
      token: "t_env",
      graphId: "g_work",
    });
  });

  it("never sends a saved key to another engine", () => {
    expect(readEnv({ LOCUSGRAPH_URL: ENGINES.dev }, saved, "g_work")).toMatchObject({
      engineUrl: ENGINES.dev,
      token: undefined,
      graphId: "g_work",
    });
  });
});
