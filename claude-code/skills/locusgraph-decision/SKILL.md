---
name: locusgraph-decision
description: Record an architecture or product decision with its reason and the options rejected, and flag when it reverses an earlier one. Use when the user settles a choice ("let's go with X", "we'll use Y instead of Z", "decided"), or asks to record a decision or ADR.
---

# Decision record

1. Find `<repo>`: the basename of `git rev-parse --show-toplevel`.
2. Name the decision as a short snake_case slug, such as `use_d1_batch_only`. The id is `decision:<repo>.<slug>`.
3. Look for earlier decisions on the same subject: call `retrieve_memories` with the decision in plain words, `format: "json"`, `limit: 5`, `context_types: { "decision": [] }`.
   - An earlier decision that this one reverses goes in `contradicts`. Tell the user which one.
   - An earlier decision that this one builds on goes in `extends`.
   - If the same id already holds a memory, show it and ask before sending `replace: true`.
4. Call `store_event`:
   - `context_id`: `decision:<repo>.<slug>`
   - `event_kind`: `decision`
   - `source`: `user` when the user made the call, `assistant` when you proposed it and the user agreed
   - `related_to`: `["project:<repo>"]`, plus any `contradicts` or `extends` from step 3
   - `payload`: `{ "data": "<decision and reason in one sentence>", "rejected": ["<option>: <why not>"], "revisit_if": "<condition that would reopen it>" }`
5. Reply with the id and the one-sentence decision.

Record decisions, not tasks. "Use Postgres for JSON support" is a decision. "Add an index" is not.
