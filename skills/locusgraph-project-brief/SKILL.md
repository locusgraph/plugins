---
name: locusgraph-project-brief
description: Brief someone on a repository from memory - decisions, constraints, known fixes and where work stopped. Use when the user is new to a repo, returns after a break, or asks "what should I know", "catch me up", "onboard me" or "what did we decide".
---

# Project brief

Uses free tools only.

1. Find `<repo>`: the basename of `git rev-parse --show-toplevel`, lowercased, with every character other than `a-z`, `0-9`, `_` and `-` replaced by `_` (`My.Repo` becomes `my_repo`). The engine stores ids that way, and a lookup must use the stored form.
2. Call `retrieve_memories`:
   - `query`: `<repo> decisions constraints conventions known issues`
   - `coverage_context_ids`: `["project:<repo>"]`
   - `limit`: `15`
   - `format`: `json`
3. Call `retrieve_memories` with `context_ids: ["handoff:<repo>"]`, `format: "json"`, `limit: 1`.
4. Write the brief, grouped and short:
   - **Where it stands**: the handoff's Goal and Next, if there is one.
   - **Decisions**: one line each, newest first. Mark any with `contradicted_by` as superseded.
   - **Constraints and conventions**: rules that would make a change fail review.
   - **Known fixes**: symptom and fix, one line each.
   - **Preferences**: how the user wants work done.
5. Cite context ids so the user can ask for more on one. Say plainly when memory holds nothing for this repo, and suggest `locusgraph-decision` and `locusgraph-handoff` to start building it.

Do not pad the brief with what the README or CLAUDE.md already says.
