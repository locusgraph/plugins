import { describe, expect, it } from "vitest";
import { ENGINES } from "../src/config.ts";
import { installButtonsMarkdown, installLinks } from "../src/deeplinks.ts";

const queryOf = (link: string) => new URL(link).searchParams;

describe("installLinks", () => {
  const links = installLinks(ENGINES.production);

  it("gives Cursor the server URL as base64 JSON", () => {
    const query = queryOf(links.cursor);

    expect(links.cursor.startsWith("https://cursor.com/install-mcp?")).toBe(true);
    expect(query.get("name")).toBe("locusgraph");
    expect(JSON.parse(Buffer.from(query.get("config") ?? "", "base64").toString())).toEqual({
      url: "https://api.locusgraph.com/mcp?tools=free",
    });
  });

  it("gives VS Code an http server as URL-encoded JSON", () => {
    const query = queryOf(links.vscode);

    expect(links.vscode.startsWith("https://vscode.dev/redirect/mcp/install?")).toBe(true);
    expect(query.get("name")).toBe("locusgraph");
    expect(JSON.parse(query.get("config") ?? "")).toEqual({
      type: "http",
      url: "https://api.locusgraph.com/mcp?tools=free",
    });
  });

  it("sends VS Code Insiders through its own host with the same config", () => {
    expect(new URL(links.vscodeInsiders).host).toBe("insiders.vscode.dev");
    expect(queryOf(links.vscodeInsiders).get("config")).toBe(
      queryOf(links.vscode).get("config"),
    );
  });

  it("points at whichever engine it is given", () => {
    const dev = installLinks(ENGINES.dev);

    expect(JSON.parse(queryOf(dev.vscode).get("config") ?? "").url).toBe(
      "https://api.dev.locusgraph.com/mcp?tools=free",
    );
  });
});

describe("installButtonsMarkdown", () => {
  it("renders one image link per editor", () => {
    const markdown = installButtonsMarkdown(installLinks(ENGINES.production));

    expect(markdown.split("\n")).toHaveLength(3);
    expect(markdown).toMatch(/^\[!\[Install in Cursor\]\(https:\/\/cursor\.com\/deeplink\//);
  });
});
