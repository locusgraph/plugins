---
description: Answer a "why" question from LocusGraph memory
argument-hint: <question>
---

Answer this from LocusGraph memory: $ARGUMENTS

If the user has enabled paid tools (LOCUSGRAPH_PAID=1), call `deep_recall` with the question.

Otherwise walk the graph with free tools:
1. Call `list_contexts` with `context_type: "decision"`, then `"constraint"`, and pick the ids that relate to the question.
2. Call `retrieve_memories` with the question, `format: "toon"`, `limit: 8` and those ids in `boost_context_ids`.
3. Answer in a few sentences. Cite the context ids you used. Say plainly when memory holds no answer.
