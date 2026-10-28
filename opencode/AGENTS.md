<!-- Generated from rules/memory.md by scripts/build.mjs. Do not edit. -->

# LocusGraph memory

LocusGraph is long-term memory that persists across sessions, projects and tools. It is
reached through the `locusgraph` MCP server.

## Recall

- Before a non-trivial task, call `retrieve_memories` with the user's request in their own
  words. Use `format: "toon"` and `limit: 5` unless more is needed.
- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:
  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then
  `retrieve_memories` with those ids in `boost_context_ids`.
- Memories already injected at session start do not need to be fetched again.

## Store

- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a
  user preference or correction, a non-obvious fix.
- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or
  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.
  Link a new detail to an existing memory with `extends`.
- For knowledge about one repository, prefix the name with the repository's directory name,
  such as `decision:engine.use_d1_batch_only`, and add `project:<repo>` to `related_to`.
  Session-start recall boosts `project:<repo>`, so linked memories surface first.
- Put one concise sentence in `payload.data`. Search matches on that text.
- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.
- Store at most a few memories per session. Never store secrets, tokens, credentials or
  anything already recorded in the repository's instruction files or git history.

## Forget

- Call `delete_memory` only when the user explicitly asks to forget something. Find the
  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.

## Paid tools

- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them
  by name or has enabled paid tools.
