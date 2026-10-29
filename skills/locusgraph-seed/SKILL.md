---
name: locusgraph-seed
description: Seed LocusGraph with a repository's existing decisions, constraints and known fixes, read from its instruction files, docs and git history, storing only what the user approves. Use when the user asks to seed, bootstrap or import project memory, or when a brief or recall for this repo comes back nearly empty.
---

# Seed project memory

Uses free tools only. Each memory stored costs one write, and nothing is stored without the user's approval.

1. Find `<repo>`: the basename of `git rev-parse --show-toplevel`, lowercased, with every character other than `a-z`, `0-9`, `_` and `-` replaced by `_` (`My.Repo` becomes `my_repo`). The engine stores ids that way, and a lookup must use the stored form. Then make sure the project anchor exists, once per session: call `store_event` with `context_id: "project:<repo>"`, `event_kind: "fact"`, `source: "assistant"` and `payload: { "data": "Repository <repo>: <what it is, in one sentence from its README>" }`, without `replace`. If the engine answers that the id already holds a memory, the anchor exists; carry on.
2. See what is already stored: call `retrieve_memories` with `query: "<repo> decisions constraints known fixes"`, `coverage_context_ids: ["project:<repo>"]`, `format: "json"`, `limit: 50`. Leave out any candidate those memories already cover.
3. Read only these sources:
   - `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md`: rules and their reasons
   - `README.md`: trap tables, design notes, sections that explain why
   - `docs/adr/` and `docs/decisions/`, if they exist
   - `git log --since=6.months --grep='^fix' --format='%h %s%n%b' -n 40`: non-obvious fixes
4. Pick candidates. Each must carry its reason or cause from the source.
   - `constraint:<repo>__<slug>`: a rule the code must follow
   - `decision:<repo>__<slug>`: a choice made between options
   - `fix:<repo>__<symptom>`: a non-obvious bug and its cause
   - `fact:<repo>__<slug>`: a non-obvious fact a change could trip on
   Skip setup steps, commands, style rules, anything an editor or linter enforces, and anything with no reason in the source. A memory without a reason gives `why` nothing to answer from.
5. Propose at most 10, the ones most likely to stop a wrong change. Number them, one line each, with the source:
   `1. constraint:engine__d1_batch_only: use batch() only, because D1 has no interactive transactions (CLAUDE.md)`
   Say how many writes keeping all would cost, and ask which to keep: `all`, `none`, or numbers.
6. Store only the approved ones. For each, call `store_event`:
   - `context_id`: the id shown
   - `event_kind`: `decision` for decisions, `fact` for the rest
   - `source`: `assistant`
   - `related_to`: `["project:<repo>"]`
   - `payload`: `{ "data": "<the line shown, without the id or source>", "source": "<file path or commit hash>" }`
   Never send `replace`. If an id already holds a memory, skip it and count it as already stored.
7. Reply with the ids stored, and how many were skipped or already stored.

Run once per repository. A second run proposes only what is new. Never store secrets, tokens or credentials found in any source.
