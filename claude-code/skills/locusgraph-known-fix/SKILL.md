---
name: locusgraph-known-fix
description: Check memory for an error before debugging it, and save the fix once it works. Use when a command, test or build fails with an error message, when the user pastes a stack trace, or right after a non-obvious bug is fixed.
---

# Known fix

## Before debugging

Call `retrieve_memories` with the most specific line of the error: the exception type and message, without paths, line numbers, ids or timestamps. Use `format: "toon"`, `limit: 3`, `context_types: { "fix": [] }`.

If a match describes the same failure, try its fix first and say that it came from memory.

## After the fix works

Save it only when the cause was not obvious from the error message, and only after the failing command passes.

1. Find `<repo>`: the basename of `git rev-parse --show-toplevel`, lowercased, with every character other than `a-z`, `0-9`, `_` and `-` replaced by `_` (`My.Repo` becomes `my_repo`). The engine stores ids that way, and a lookup must use the stored form. Then make sure the project anchor exists, once per session: call `store_event` with `context_id: "project:<repo>"`, `event_kind: "fact"`, `source: "assistant"` and `payload: { "data": "Repository <repo>: <what it is, in one sentence from its README>" }`, without `replace`. If the engine answers that the id already holds a memory, the anchor exists; carry on.
2. Call `store_event`:
   - `context_id`: `fix:<repo>__<short_snake_case_symptom>`
   - `event_kind`: `knowledge`
   - `source`: `tool` (the passing command verified it)
   - `related_to`: `["project:<repo>"]`
   - `payload`: `{ "data": "<symptom> is caused by <cause>; fix: <fix>", "error": "<the error line, normalized as above>", "verified_by": "<the command that now passes>" }`
3. Tell the user the fix is saved under that id.

Do not save typos, missing imports or anything the error message already explained.
