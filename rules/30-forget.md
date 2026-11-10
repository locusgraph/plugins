## Forget

- Call `delete_memory` only when the user explicitly asks to forget something. Find the
  `locus_id` with `retrieve_memories` using `format: "json"`, and confirm with the user first.
