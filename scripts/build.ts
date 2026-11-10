import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { DEFAULT_ENGINE_URL } from "../cli/src/config.ts";
import { installButtonsMarkdown, installLinks } from "../cli/src/deeplinks.ts";

interface Output {
  readonly content: string;
  readonly committed: boolean;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFile(join(root, path), "utf8");

const GENERATED_NOTICE = "<!-- Generated from rules/ by scripts/build.ts. Do not edit. -->\n\n";

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

async function bundleCli(rulesModule: string): Promise<string> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [join(root, "cli/src/bin.ts")],
    plugins: [
      {
        name: "generated-rules",
        setup(builder) {
          builder.onResolve({ filter: /generated\/rules\.ts$/ }, ({ path }) => ({
            path,
            namespace: "generated-rules",
          }));
          builder.onLoad({ filter: /.*/, namespace: "generated-rules" }, () => ({
            contents: rulesModule,
            loader: "ts",
          }));
        },
      },
    ],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    write: false,
    legalComments: "none",
    banner: { js: "#!/usr/bin/env node" },
  });
  const [file] = result.outputFiles;
  if (file === undefined) throw new Error("esbuild produced no output");
  return file.text;
}

async function skillOutputs(): Promise<Record<string, Output>> {
  const outputs: Record<string, Output> = {};
  for (const skill of await readdir(join(root, "skills"))) {
    outputs[`claude-code/skills/${skill}/SKILL.md`] = {
      content: await read(`skills/${skill}/SKILL.md`),
      committed: true,
    };
  }
  return outputs;
}

const BUTTONS_START = "<!-- install-buttons:start -->";
const BUTTONS_END = "<!-- install-buttons:end -->";

async function readmeWithButtons(): Promise<string> {
  const readme = await read("README.md");
  const start = readme.indexOf(BUTTONS_START);
  const end = readme.indexOf(BUTTONS_END);
  if (start === -1 || end < start) {
    throw new Error(`README.md needs ${BUTTONS_START} and ${BUTTONS_END} markers`);
  }
  const buttons = installButtonsMarkdown(installLinks(DEFAULT_ENGINE_URL));
  return `${readme.slice(0, start + BUTTONS_START.length)}\n${buttons}\n${readme.slice(end)}`;
}

// Every rules/*.md, in file-name order, joined by a blank line. The number prefix sets the order.
async function readRules(): Promise<string> {
  const files = (await readdir(join(root, "rules")))
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) throw new Error("rules/ holds no .md files");
  return (await Promise.all(files.map((name) => read(`rules/${name}`)))).join("\n");
}

async function collectOutputs(): Promise<Record<string, Output>> {
  const rules = await readRules();
  const license = await read("LICENSE");
  const committed = (content: string): Output => ({ content, committed: true });

  const rulesModule = `export const RULES = ${JSON.stringify(rules)};\n`;
  const cli = await bundleCli(rulesModule);

  return {
    "cli/src/generated/rules.ts": committed(rulesModule),
    "claude-code/skills/locusgraph-memory/SKILL.md": committed(
      frontmatter({
        name: "locusgraph-memory",
        description:
          "Recall and store long-term memory with LocusGraph. Use before non-trivial tasks, when the user asks why something was decided, or when a durable decision, constraint or preference comes up.",
      }) +
        GENERATED_NOTICE +
        rules,
    ),
    "cursor/.cursor/rules/locusgraph.mdc": committed(
      frontmatter({ description: "LocusGraph long-term memory", alwaysApply: "true" }) +
        GENERATED_NOTICE +
        rules,
    ),
    "codex/AGENTS.md": committed(GENERATED_NOTICE + rules),
    "opencode/AGENTS.md": committed(GENERATED_NOTICE + rules),
    "gemini/GEMINI.md": committed(GENERATED_NOTICE + rules),
    "vscode/.github/copilot-instructions.md": committed(GENERATED_NOTICE + rules),
    "claude-code/hooks/lg.mjs": committed(cli),
    "cursor/.cursor/hooks/lg.mjs": committed(cli),
    "claude-code/LICENSE": committed(license),
    "cli/LICENSE": committed(license),
    "cli/dist/lg.mjs": { content: cli, committed: false },
    "README.md": committed(await readmeWithButtons()),
    ...(await skillOutputs()),
  };
}

async function main(checkOnly: boolean): Promise<number> {
  const stale: string[] = [];

  for (const [path, { content, committed }] of Object.entries(await collectOutputs())) {
    const target = join(root, path);
    const current = await readFile(target, "utf8").catch(() => null);
    if (current === content) continue;
    if (checkOnly) {
      if (committed) stale.push(path);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { mode: path.endsWith(".mjs") ? 0o755 : 0o644 });
    console.log(`wrote ${path}`);
  }

  if (stale.length === 0) return 0;
  console.error(`out of date, run npm run build:\n  ${stale.join("\n  ")}`);
  return 1;
}

process.exitCode = await main(process.argv.includes("--check"));
