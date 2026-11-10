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
