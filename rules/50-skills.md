## Skills

- A skill is a stored working practice: `skill:<name>` with its steps (`step:<name>__<nnn>_<slug>`),
  rules (`rule:<name>__<slug>`) and lessons (`lesson:<name>__<slug>`).
- Before a task the user may have a practice for (deploy, release, review, migrate, a runbook),
  call `retrieve_memories` with the request in their own words and `context_types: { "skill": [] }`.
  If a skill fits, load its steps, rules and lessons and follow them, applying each lesson to
  the step it links to. If none fits, carry on without one.
- When a step fails and another action fixes it, or the user corrects a step, offer to store
  a lesson (`event_kind: "feedback"`) that `extends` the step, or `contradicts` it if the step
  is wrong now. Store it only on the user's yes.
