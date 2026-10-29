---
description: Store one durable memory in LocusGraph
argument-hint: <what to remember>
---

Store this in LocusGraph: $ARGUMENTS

1. Decide whether it is about this repository or about the user in general.
   - Repository: find `<repo>`: the basename of `git rev-parse --show-toplevel`, lowercased, with every character other than `a-z`, `0-9`, `_` and `-` replaced by `_` (`My.Repo` becomes `my_repo`). The engine stores ids that way, and a lookup must use the stored form. The id is `<type>:<repo>__<snake_case_slug>`, such as `constraint:engine__d1_batch_only`. Then make sure the project anchor exists, once per session: call `store_event` with `context_id: "project:<repo>"`, `event_kind: "fact"`, `source: "assistant"` and `payload: { "data": "Repository <repo>: <what it is, in one sentence from its README>" }`, without `replace`. If the engine answers that the id already holds a memory, the anchor exists; carry on.
   - General, such as a personal preference that holds in every repository: the id is `<type>:<snake_case_slug>`.
   - `<type>` is one of `decision`, `constraint`, `preference`, `fact`.
2. Call `retrieve_memories` with `context_ids: [<that id>]`. If the id already holds a memory, show it and ask whether to replace it.
3. Call `store_event` with `source: "user"`, a fitting `event_kind`, and one concise sentence in `payload.data`. For a repository memory, add `related_to: ["project:<repo>"]`. Send `replace: true` only if the user agreed.
4. Reply with the context id you stored.

Refuse to store secrets, tokens or credentials.
