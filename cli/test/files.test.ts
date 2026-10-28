import { describe, expect, it } from "vitest";
import { replaceRulesBlock } from "../src/files.ts";

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
