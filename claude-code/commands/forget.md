---
description: Delete a memory from LocusGraph
argument-hint: <what to forget>
---

Forget this in LocusGraph: $ARGUMENTS

1. Call `retrieve_memories` with that text, `format: "json"`, `limit: 5`.
2. Show the matches with their `locus_id` and text, and ask the user which ones to delete.
3. Call `delete_memory` once per confirmed `locus_id`. Never delete without confirmation.
