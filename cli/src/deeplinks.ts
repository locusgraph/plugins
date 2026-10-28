import { mcpUrlFor } from "./config.ts";

const SERVER_NAME = "locusgraph";

export interface InstallLinks {
  readonly cursor: string;
  readonly vscode: string;
  readonly vscodeInsiders: string;
}

function base64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

export function cursorInstallLink(mcpUrl: string): string {
  const config = base64(JSON.stringify({ url: mcpUrl }));
  return `https://cursor.com/install-mcp?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}

export function vscodeInstallLink(mcpUrl: string, host = "vscode.dev"): string {
  const config = encodeURIComponent(JSON.stringify({ type: "http", url: mcpUrl }));
  return `https://${host}/redirect/mcp/install?name=${SERVER_NAME}&config=${config}`;
}

export function installLinks(engineUrl: string): InstallLinks {
  const mcpUrl = mcpUrlFor(engineUrl);
  return {
    cursor: cursorInstallLink(mcpUrl),
    vscode: vscodeInstallLink(mcpUrl),
    vscodeInsiders: vscodeInstallLink(mcpUrl, "insiders.vscode.dev"),
  };
}

export function installButtonsMarkdown(links: InstallLinks): string {
  return [
    `[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](${links.cursor})`,
    `[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_LocusGraph-0098FF?logo=visualstudiocode&logoColor=white)](${links.vscode})`,
    `[![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_LocusGraph-24bfa5?logo=visualstudiocode&logoColor=white)](${links.vscodeInsiders})`,
  ].join("\n");
}
