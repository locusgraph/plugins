---
name: locusgraph-review
description: Audit stored memories for a repository - find contradictions, duplicates and stale entries, and clean them up with the user's approval. Use when the user asks to review, clean up, audit or tidy memory, or when recall keeps returning conflicting answers.
---

# Memory review

Nothing is deleted or replaced without the user's explicit approval for that item.

1. Find `<repo>`: the basename of `git rev-parse --show-toplevel`, lowercased, with every character other than `a-z`, `0-9`, `_` and `-` replaced by `_` (`My.Repo` becomes `my_repo`). The engine stores ids that way, and a lookup must use the stored form.
2. Call `list_contexts` once per type: `decision`, `constraint`, `preference`, `fix`, `fact`. Keep the ids whose name starts with `<repo>__`, plus `handoff:<repo>`.
3. Call `retrieve_memories` with `coverage_context_ids: ["project:<repo>"]`, `limit: 30`, `format: "json"`.
4. Sort the results into:
   - **Contradicted**: items with `contradicted_by`. The older one is usually stale.
   - **Duplicates**: two items that state the same thing under different ids.
   - **Stale**: items that name files, functions or flags that no longer exist. Check with a search of the repository before calling one stale.
   - **Healthy**: everything else. Report only the count.
5. Show one table: id, text, problem, proposed action (`delete`, `replace`, `keep`).
6. For each approved item:
   - `delete`: call `delete_memory` with its `locus_id`.
   - `replace`: call `store_event` on the same `context_id` with `replace: true` and the corrected text.
7. Report what changed.

Never delete in bulk without the user going through the table.
