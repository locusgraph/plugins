import { describe, expect, it } from "vitest";
import { replaceRulesBlock, replaceTomlTable } from "../src/files.ts";

describe("replaceRulesBlock", () => {
  it("starts an empty file with the block", () => {
    expect(replaceRulesBlock("", "rules")).toBe(
      "<!-- locusgraph:start -->\nrules\n<!-- locusgraph:end -->\n",
    );
  });

  it("appends after the user's text with one blank line", () => {
    expect(replaceRulesBlock("# Mine\n\n\n", "rules")).toBe(
      "# Mine\n\n<!-- locusgraph:start -->\nrules\n<!-- locusgraph:end -->\n",
    );
  });

  it("replaces an existing block and keeps what surrounds it", () => {
    const current = "top\n\n<!-- locusgraph:start -->\nold\n<!-- locusgraph:end -->\nbottom\n";

    expect(replaceRulesBlock(current, "new")).toBe(
      "top\n\n<!-- locusgraph:start -->\nnew\n<!-- locusgraph:end -->\nbottom\n",
    );
  });
});

describe("replaceTomlTable", () => {
  it("appends a missing table after one blank line", () => {
    expect(replaceTomlTable('model = "x"\n', "t", "a = 1")).toBe('model = "x"\n\n[t]\na = 1\n');
  });

  it("replaces the table body and leaves the tables after it alone", () => {
    const current = "[t]\na = 1\nb = 2\n\n[u]\nc = 3\n";

    expect(replaceTomlTable(current, "t", "a = 9")).toBe("[t]\na = 9\n\n[u]\nc = 3\n");
  });

  it("replaces a table at the end of the file", () => {
    expect(replaceTomlTable("top = 1\n\n[t]\na = 1\n", "t", "a = 2")).toBe(
      "top = 1\n\n[t]\na = 2\n",
    );
  });
});
