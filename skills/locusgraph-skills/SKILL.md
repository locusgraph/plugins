---
name: locusgraph-skills
description: Find a working practice stored in LocusGraph, follow it, and improve it from what each run teaches, with the user's approval. Use before a task the user may have a written practice for (deploy, release, review, migrate, set up, a runbook or checklist), when the user asks "how do we usually do X" or "use our skill for X", or when a step of a stored skill fails or the user corrects it.
---

# LocusGraph skills

Uses free tools only. Reading a skill costs nothing; each memory stored or replaced costs one write, and nothing is stored, replaced or deleted without the user's approval.

## How a skill is stored

`<skill>` is the skill's name in snake_case, using only `a-z`, `0-9`, `_` and `-`. A skill that belongs to one repository is named `<repo>__<name>`, where `<repo>` is the basename of `git rev-parse --show-toplevel`, lowercased, with every other character replaced by `_`.

| Id | `event_kind` | Holds |
|---|---|---|
| `skill:<skill>` | `knowledge` | `"Skill <skill> (v<n>): <what it does>. Use when <trigger words>."` |
| `step:<skill>__<nnn>_<slug>` | `knowledge` | One action: `"<skill> step: <action>"` |
| `rule:<skill>__<slug>` | `knowledge` | One rule that holds for every step: `"Rule of <skill>: <rule>, because <reason>"` |
| `lesson:<skill>__<slug>` | `feedback` | One thing a run taught: `"Lesson for <skill>: <lesson>"` |

`<nnn>` is three digits counted in tens (`010`, `020`, `030`) so steps sort in order and a new step fits between two others (`015`). Steps and rules `extends` the skill. A lesson links to the one step or rule it is about.

## Links

- `extends`: structure and added detail. A step or rule extends `skill:<skill>`. A lesson that adds something the step left out extends that step. This is the default.
- `contradicts`: a lesson that shows a step or rule is now wrong (a renamed command, a removed flag). The engine lowers the old memory's confidence and recall marks it `contradicted_by`; follow the lesson, not the step.
- `reinforces`: a lesson that records a non-obvious success of a step (it worked on a new platform, version or edge case). It raises the step's confidence. At most one per step per change; never for an ordinary run.
- `related_to`: only between a skill and something outside it: `project:<repo>` for a repository skill, or another `skill:` it hands off to. Never from a lesson.

## 1. Find

1. Call `retrieve_memories` with the user's request in their own words as `query`, `context_types: { "skill": [] }`, `ranking: "similarity"`, `format: "json"`, `limit: 5`. In a repository, also pass `boost_context_ids: ["project:<repo>"]`.
2. Pick the one skill whose trigger fits the task. If none fits, say "No stored skill for this" once and do the task without one. Do not search again with other words.
3. If two fit, prefer the repository's skill, then the one with higher confidence, and say which you chose.

## 2. Load

1. Call `list_contexts` with `context_type: "step"`, then `"rule"`, then `"lesson"`, each with `context_name: "<skill>__"` and `limit: 1000`. The name filter matches names that contain the text, so keep only the names that start with `<skill>__`.
2. Call `retrieve_memories` with `query: "<skill> steps rules lessons"`, `context_ids` set to up to 50 of the ids kept, `format: "json"` and `limit` equal to that count. Repeat with the next 50 until every id is fetched; the engine returns at most 100 per call.
3. Order steps by `<nnn>`. Put each lesson under the step or rule it links to. Mark any memory with `contradicted_by`.

## 3. Use

1. Say which skill and version you are following, in one line: `Using deploy v2 (5 steps, 1 lesson).`
2. Follow the steps in order. Apply every rule throughout. Where a lesson sits under a step, apply the lesson. Where a step is `contradicted_by` a lesson, follow the lesson.
3. If the user tells you to do something different, do what the user says and note it for step 4.

## 4. Learn

After the task, look back at the run. Propose a lesson only for one of these:

| What happened | Lesson links with | `source` |
|---|---|---|
| A step failed and a different action fixed it | `extends` the step | `tool` |
| A step is wrong now (renamed, removed, unsafe) | `contradicts` the step | `tool`, or `user` if the user said so |
| The user corrected or added a step | `extends` the step, or `contradicts` it if the user said it is wrong | `user` |
| A step worked in a case it was unproven for | `reinforces` the step | `tool` |

Nothing went differently from the skill: propose nothing.

Show the proposals in one numbered list, one line each, with the link:
`1. lesson:deploy__account_id extends step:deploy__030_push: export CLOUDFLARE_ACCOUNT_ID before push`
Ask which to keep: `all`, `none`, or numbers. For each approved one, call `store_event` with that `context_id`, `event_kind: "feedback"`, the `source` from the table, the link field, and `payload: { "data": "Lesson for <skill>: <lesson>" }`. Never send `replace`; if the id is taken, pick a new slug.

## 5. Improve

When a step or rule you loaded has a lesson that `extends` or `contradicts` it, offer once, at the end of the task, to fold the lessons in:
`Step 030_push has 1 lesson. Rewrite it as: "deploy step: export CLOUDFLARE_ACCOUNT_ID, then run wrangler deploy"? Version becomes v3.`

Only on the user's yes:
1. Call `store_event` for the step with the same `context_id`, `replace: true`, `event_kind: "knowledge"`, `source: "user"`, `extends: ["skill:<skill>"]` and the rewritten `payload.data`.
2. Call `store_event` for `skill:<skill>` with `replace: true`, the same text and `v<n+1>`.
3. Call `delete_memory` with the `locus_id` of each lesson that was folded in. Keep lessons that `reinforces` a step: they are the evidence.

A new step the user approves takes a free number between its neighbours (`015` between `010` and `020`), stored with `extends: ["skill:<skill>"]` and the version raised by one.

Never store secrets, tokens or credentials in a skill, step, rule or lesson.
