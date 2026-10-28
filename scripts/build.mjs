import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rules = await readFile(join(root, "rules/memory.md"), "utf8");
const cli = await readFile(join(root, "cli/lg.mjs"), "utf8");

const GENERATED = "<!-- Generated from rules/memory.md by scripts/build.mjs. Do not edit. -->\n\n";

const outputs = {
  "claude-code/skills/locusgraph-memory/SKILL.md":
    "---\n" +
    "name: locusgraph-memory\n" +
    "description: Recall and store long-term memory with LocusGraph. Use before non-trivial tasks, when the user asks why something was decided, or when a durable decision, constraint or preference comes up.\n" +
    "---\n\n" +
    GENERATED +
    rules,
  "cursor/.cursor/rules/locusgraph.mdc":
    "---\n" +
    "description: LocusGraph long-term memory\n" +
    "alwaysApply: true\n" +
    "---\n\n" +
    GENERATED +
    rules,
  "codex/AGENTS.md": GENERATED + rules,
  "opencode/AGENTS.md": GENERATED + rules,
  "gemini/GEMINI.md": GENERATED + rules,
  "vscode/.github/copilot-instructions.md": GENERATED + rules,
  "cli/rules.md": rules,
  "claude-code/hooks/lg.mjs": cli,
  "cursor/.cursor/hooks/lg.mjs": cli,
};

const checkOnly = process.argv.includes("--check");
const stale = [];

for (const [path, content] of Object.entries(outputs)) {
  const target = join(root, path);
  const current = await readFile(target, "utf8").catch(() => null);
  if (current === content) continue;
  if (checkOnly) {
    stale.push(path);
    continue;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log(`wrote ${path}`);
}

if (stale.length > 0) {
  console.error(`out of date, run node scripts/build.mjs:\n  ${stale.join("\n  ")}`);
  process.exitCode = 1;
}
