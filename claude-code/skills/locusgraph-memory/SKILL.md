---
name: locusgraph-memory
description: Recall and store long-term memory with LocusGraph. Use before non-trivial tasks, when the user asks why something was decided, or when a durable decision, constraint or preference comes up.
---

<!-- Generated from rules/ by scripts/build.ts. Do not edit. -->

# LocusGraph memory

LocusGraph is long-term memory that persists across sessions, projects and tools. It is
reached through the `locusgraph` MCP server.

If session start names this repository's graph, pass that graph as `graph_id` on every
LocusGraph tool call. Without such a note, leave `graph_id` out.

## Recall

- Before a non-trivial task, call `retrieve_memories` with the user's request in their own
  words. Use `format: "toon"` and `limit: 5` unless more is needed.
- For a question that spans linked memories ("why did we choose X?"), walk the graph yourself:
  `list_contexts` to find the relevant `decision:` or `constraint:` ids, then
  `retrieve_memories` with those ids in `boost_context_ids`.
- Memories already injected at session start do not need to be fetched again.
- Recall returns its best candidates even when none is relevant; it never answers "nothing
  found". Read every result before answering, not only the first: the one that answers can
  rank last. Use a memory only if it is about the question asked. If none is, say memory
  holds nothing on it rather than stretching the closest result.
- `match_score` mixes in the memory's confidence and recency, so a fresh memory scores well
  on a weak match. When deciding whether memory answers a question at all, pass
  `ranking: "similarity"`, which scores the match alone.

## Store

- Call `store_event` only for durable knowledge: a decision and its reason, a constraint, a
  user preference or correction, a non-obvious fix.
- Use a stable `context_id` in `type:name` form, such as `decision:use_postgres` or
  `preference:no_code_comments`. One id holds one memory. Update it with `replace: true`.
  Link a new detail to an existing memory with `extends`.
- For knowledge about one repository, prefix the name with the repository's directory name,
  joined by a double underscore, such as `decision:engine__use_d1_batch_only`, and add
  `project:<repo>` to `related_to`. Session-start recall boosts `project:<repo>`, so linked
  memories surface first.
- Each repository has one anchor memory that owns `project:<repo>`, holding one sentence on
  what the repository is. Without an owner, the `related_to` links to `project:<repo>` are
  stored but never bind, so graph expansion cannot walk between that repository's memories.
  Before the first repository memory in a session, call `store_event` on `project:<repo>`
  (`event_kind: "fact"`, `source: "assistant"`) without `replace`; an answer that the id
  already holds a memory means the anchor exists.
- Build ids only from `a-z`, `0-9`, `_`, `-` and the one `:`. The engine lowercases an id and
  turns any other character into `_` when it stores it, but looks ids up exactly as sent, so an
  id with a dot or a capital is stored under one name and searched for under another. The
  same goes for `<repo>`: `My.Repo` is `my_repo`.
- Put one concise sentence in `payload.data`. Search matches on that text.
- A decision or constraint states its reason in that sentence: "use `batch()` only, because
  D1 has no interactive transactions". Without the reason, a later "why?" has nothing to
  answer from. If the user gave none, ask for it once; store without it only if they decline.
- Set `source: "user"` when the user said it, `"assistant"` when you inferred it.
- Store at most a few memories per session. Never store secrets, tokens, credentials or
  anything already recorded in the repository's instruction files or git history. The one
  exception is seeding: when the user asks, `locusgraph-seed` copies rules, decisions and
  fixes from those sources once, each approved by the user and naming its source.

## Forget

- Call `delete_memory` only when the user explicitly asks to forget something. Find the
  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.

## Paid tools

- `observe` and `deep_recall` spend credits. Do not call them unless the user asks for them
  by name or has enabled paid tools.

## Skills

- A skill is a stored working practice: `skill:<name>` with its steps (`step:<name>__<nnn>_<slug>`),
  rules (`rule:<name>__<slug>`) and lessons (`lesson:<name>__<slug>`).
- Before a task the user may have a practice for (deploy, release, review, migrate, a runbook),
  call `retrieve_memories` with the request in their own words and `context_types: { "skill": [] }`.
  If a skill fits, load its steps, rules and lessons and follow them, applying each lesson to
  the step it links to. If none fits, carry on without one.
- When a step fails and another action fixes it, or the user corrects a step, offer to store
  a lesson (`event_kind: "feedback"`) that `extends` the step, or `contradicts` it if the step
  is wrong now. Store it only on the user's yes.
