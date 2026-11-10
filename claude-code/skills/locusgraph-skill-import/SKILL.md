---
name: locusgraph-skill-import
description: Port an existing skill, runbook or checklist file into LocusGraph so it can be found from any agent and improve from use, storing only what the user approves. Use when the user asks to import, port, move, upload or store a skill or SKILL.md in LocusGraph, or names a runbook, checklist or instruction file to turn into a reusable skill.
---

# Import a skill

Uses free tools only. Each memory stored costs one write, and nothing is stored or replaced without the user's approval. The stored form is the one `locusgraph-skills` reads: follow its ids, `event_kind`s and links exactly.

1. Read the file the user named. If they named none, ask for the path; do not search the disk for skills on your own.
2. Name the skill `<skill>`: the frontmatter `name` or the file's title, in snake_case, using only `a-z`, `0-9`, `_` and `-`. Ask once whether it is personal or for this repository only. For a repository skill, name it `<repo>__<name>`, where `<repo>` is the basename of `git rev-parse --show-toplevel`, lowercased, with every other character replaced by `_`.
3. Check whether it is already stored: call `retrieve_memories` with `query: "<skill>"`, `context_ids: ["skill:<skill>"]`, `format: "json"`, `limit: 1`. If it is, go to step 8.
4. Split the file into memories:
   - `skill:<skill>`: one line, `"Skill <skill> (v1): <what it does>. Use when <trigger words>."` Take the triggers from the frontmatter `description`, or from when the file says to use it.
   - `step:<skill>__<nnn>_<slug>`: each action the reader does, in order, numbered in tens from `010` (`010`, `020`, `030`). One action per step: `"<skill> step: <action>"`. Keep commands exact. Merge sub-bullets into their step.
   - `rule:<skill>__<slug>`: each rule that holds for every step ("never", "always", "must"), with its reason from the file: `"Rule of <skill>: <rule>, because <reason>"`. A rule with no reason in the file keeps the file's wording and gets no invented reason.
   Leave out introductions, examples that only restate a step, and anything another tool already enforces. A code block longer than a few lines stays in the file: the step names the file and section instead.
5. Show the plan as a numbered list, one line each:
   `1. skill:deploy: Skill deploy (v1): deploy the API to production. Use when deploy, ship, release.`
   `2. step:deploy__010_build: deploy step: run npm run build`
   Say how many writes it costs, and ask: `all`, `none`, or numbers. The skill line is required if anything is kept.
6. Store only the approved ones. For each, call `store_event`:
   - `context_id`: the id shown
   - `event_kind`: `knowledge`
   - `source`: `document`
   - `payload`: `{ "data": "<the line shown, without the id>", "source": "<file path>" }`
   - the skill: `related_to: ["project:<repo>"]` for a repository skill, nothing otherwise
   - a step or rule: `extends: ["skill:<skill>"]`
   Never send `replace` here. If an id already holds a memory, skip it and say so.
7. Reply with the skill id, the count of steps and rules stored, and: `Ask for it by name or by task; locusgraph-skills will load it and learn from each run.` Leave the original file as it is. Offer, once, to replace its body with a pointer to the stored skill; change it only on a yes.

## 8. Re-import a skill that is stored

1. Load it the way `locusgraph-skills` does: `list_contexts` for `step`, `rule` and `lesson`, each with `context_name: "<skill>__"` and `limit: 1000`; keep the names that start with `<skill>__`; then `retrieve_memories` with those `context_ids` in batches of 50, `format: "json"` and `limit` equal to the batch size.
2. Compare the file with what is stored and list only the differences, numbered: new steps and rules, changed ones (old text, then new text), and ones the file no longer has. Lessons stay as they are and are never listed for deletion here.
3. Ask which to apply. For an approved change, call `store_event` with the same `context_id`, `replace: true`, `source: "document"` and the new text. For an approved removal, call `delete_memory` with its `locus_id`. If anything changed, replace `skill:<skill>` with the version raised by one.

Never store secrets, tokens or credentials found in the file.
