---
description: Answer a "why" question from LocusGraph memory
argument-hint: <question>
---

Answer this from LocusGraph memory: $ARGUMENTS

If a `deep_recall` tool is available and the user has enabled paid tools (LOCUSGRAPH_PAID=1), call it with the question. The plugin connects with `?tools=free`, so it is usually not available.

Otherwise walk the graph with free tools:
1. Call `list_contexts` with `context_type: "decision"`, then `"constraint"`, and pick the ids that relate to the question.
2. Call `retrieve_memories` with the question, `format: "json"`, `limit: 8`, `ranking: "similarity"` and those ids in `boost_context_ids`.
3. Read every result, not only the first. Keep only memories that are about the question; the one that answers can rank last.
4. Answer in a few sentences. Cite the context ids you used. If no memory is about the question, say memory holds no answer; do not stretch the closest result.
