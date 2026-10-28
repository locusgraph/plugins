---
description: Store one durable memory in LocusGraph
argument-hint: <what to remember>
---

Store this in LocusGraph: $ARGUMENTS

1. Pick a stable `context_id` in `type:name` form (`decision:`, `constraint:`, `preference:`, `fact:`).
2. Call `retrieve_memories` with `context_ids: [<that id>]`. If the id already holds a memory, show it and ask whether to replace it.
3. Call `store_event` with `source: "user"`, a fitting `event_kind`, and one concise sentence in `payload.data`. Send `replace: true` only if the user agreed.
4. Reply with the context id you stored.

Refuse to store secrets, tokens or credentials.
