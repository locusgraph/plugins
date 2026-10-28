---
name: locusgraph-handoff
description: Save where the work stopped so the next session, on any machine or agent, picks it up. Use when the user says wrap up, hand off, end of day, pause, "save progress", or is about to switch tasks or machines.
---

# Session handoff

One handoff per repository, overwritten each time. It costs one write.

1. Find the repository name: the basename of `git rev-parse --show-toplevel`. Call it `<repo>`.
2. Write the handoff from this session. Keep it under 120 words:
   - **Goal**: what the user is trying to finish.
   - **Done**: what changed, with file paths or commit hashes.
   - **Next**: the first concrete step for the next session.
   - **Open**: blockers, unanswered questions, failing tests.
3. Call `store_event`:
   - `context_id`: `handoff:<repo>`
   - `event_kind`: `action`
   - `source`: `assistant`
   - `replace`: `true`
   - `related_to`: `["project:<repo>"]`
   - `payload`: `{ "data": "<one-sentence summary of Goal and Next>", "goal": "...", "done": "...", "next": "...", "open": "...", "branch": "<git branch>" }`
4. Tell the user the handoff is saved, and show the **Next** line.

To resume, call `retrieve_memories` with `context_ids: ["handoff:<repo>"]` and `format: "json"`, then continue from **Next**.

Never put secrets, tokens or credentials in a handoff.
