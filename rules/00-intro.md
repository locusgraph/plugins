# LocusGraph memory

LocusGraph is long-term memory that persists across sessions, projects and tools. It is
reached through the `locusgraph` MCP server.

If session start names this repository's graph, pass that graph as `graph_id` on every
LocusGraph tool call. Without such a note, leave `graph_id` out.
