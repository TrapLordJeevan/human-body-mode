---
name: human-body-mode
description: Use the connected editor for file changes and terminal commands.
---

Call the `pair` MCP server's `start` tool before changing anything. Use `read` for editor buffers and `step` for every edit, shortcut, and terminal command. Newly authored text must use `type`; `type_fast` is intentionally rate-limited identically. Existing selected text may use copy/paste actions. Never attempt Write, Edit, Bash, shell redirection, patches, heredocs, code generators, or another MCP writer: the Mod blocks them. All subagents may reason and read in parallel, but their physical actions enter the same pair queue.
