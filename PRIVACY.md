# Privacy

This page covers the LocusGraph plugins and the `lg` CLI in this repository: what they send,
where it goes, and what stays on your machine. Memories are stored by the LocusGraph service,
which you sign in to; this repository does not run that service.

## What leaves your machine

- **MCP tool calls.** When the agent calls a LocusGraph tool (`retrieve_memories`,
  `store_event`, `list_contexts`, `delete_memory`), the agent sends that call's arguments to the
  LocusGraph MCP server, `https://api.locusgraph.com/mcp` unless you point it elsewhere with
  `LOCUSGRAPH_URL` or `--engine`. A stored memory holds what the agent wrote into it: usually
  one sentence, a `context_id`, and links to other ids. Every write follows the rules shipped
  here: no secrets, tokens or credentials, and the skills that store several memories at once
  ask for your approval first.
- **Session-start recall (Claude Code).** The `recall` hook sends nothing on its own. It prints
  an instruction that asks the agent to call `retrieve_memories` once, with the repository's
  directory name and, on a feature branch, the branch name as the query. Only when you set
  both `LOCUSGRAPH_TOKEN` and `LOCUSGRAPH_GRAPH_ID` does the hook call
  `POST /v1/memories` itself, with that same query and your token.
- **Sign-in.** The first LocusGraph tool call opens your browser to sign in to LocusGraph.
  Your agent stores the resulting token; the plugin never reads or stores it.

## What stays on your machine

- The `guard` hook only reads the name of the tool being called, to block the paid tools
  (`observe`, `deep_recall`). It sends nothing.
- `lg init` and `lg links` write config files in your project or home directory and print
  links. They make no network calls.
- The plugins do not collect analytics or telemetry.

## Your memories

Memories live in your LocusGraph graph. Ask the agent to forget one (`/locusgraph:forget` in
Claude Code) to delete it with `delete_memory`. How the LocusGraph service stores, retains and
protects data is governed by your LocusGraph account terms.

## Contact

Open an issue at https://github.com/locusgraph/plugins/issues.
