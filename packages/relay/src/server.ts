import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import type { FileContent, Report, ToolName } from "@ai-pair/protocol"
import { RelayError, type EditorLink } from "./link"
import { renderFile, renderReport } from "./render"
import { TOOLS } from "./tools"

/** The extension's version, which the build defines; unbuilt, as in tests, there's none. */
declare const AI_PAIR_VERSION: string | undefined
const VERSION = typeof AI_PAIR_VERSION === "string" ? AI_PAIR_VERSION : "dev"

/** Always loaded by the harness, so kept short; the full guide comes with `start`. */
export const INSTRUCTIONS = `Work in the connected VS Code editor. Call \`start\` with your working directory and follow the guide it returns. Read buffers with \`read\`; perform changes and terminal commands through \`step\`. The user can interrupt or take over. Use \`listen\` when waiting for clarification. Flush actions and call \`end\` when the requested work is complete, then report the result.`

/** The agent-facing part of AGENT_GUIDE.md: everything after the first horizontal rule. */
export function agentGuide(markdown: string): string {
  const rule = /\r?\n---\r?\n/.exec(markdown)
  return (rule ? markdown.slice(rule.index + rule[0].length) : markdown).trim()
}

export function startPrompt(task?: string): string {
  const what = task?.trim() ? `The task: ${task.trim()}` : "Ask me what we're working on, unless it's clear from our conversation."
  return `Let's pair program. ${what}\n\nStart a session with the \`start\` tool of the pair server, then follow the guide it returns.`
}

/** How long to wait for the harness to list its roots: one that claims to but never answers mustn't block `start`. */
const ROOTS_MS = 2000

/**
 * `cwd` is the relay's working directory. The agent's paths are relative to its own, which `start`
 * finds as the first of these that a VS Code window has open: the one the agent gives, the harness's
 * roots, and `cwd`. Some harnesses start MCP servers in `/` or in their own install folder.
 */
export function createServer(link: EditorLink, guide: string, cwd: string): McpServer {
  const server = new McpServer({ name: "ai-pair", version: VERSION }, { instructions: INSTRUCTIONS })

  const roots = async (): Promise<string[]> => {
    if (!server.server.getClientCapabilities()?.roots) return []
    try {
      const { roots } = await server.server.listRoots(undefined, { timeout: ROOTS_MS })
      return roots.filter((r) => r.uri.startsWith("file:")).map((r) => fileURLToPath(r.uri))
    } catch {
      return []
    }
  }

  const run = async (tool: Exclude<ToolName, "control">, args: object, signal: AbortSignal, before?: () => Promise<object>): Promise<CallToolResult> => {
    try {
      if (before) args = { ...args, ...(await before()) }
      const result = await link.call(tool, args as Record<string, unknown>, signal)
      const text = tool === "read" ? renderFile(result as FileContent) : renderReport(result as Report, tool)
      const content: CallToolResult["content"] = [{ type: "text", text }]
      if (tool === "start") content.push({ type: "text", text: `# Editor workflow\n\nRead and reason without volume limits. Use this server's read tool or simple native read-only inspection for repository reading. The terminal run action is for allowlisted builds/tests (e.g. node verify.cjs, npm test, mvn test) and read-only Git commands, not rg/ls/cat, compound shell commands, source generators or patches. Enter new commands and newly authored code through step. Clipboard paste can only reuse existing editor content, never internal generated output. Operator controls are for the user. Follow these tool restrictions when examples below suggest unrestricted background commands. Flush actions and end the session when the requested work is complete.\n\n# Pairing guide\n\n${guide}` })
      return { content }
    } catch (e) {
      const code = e instanceof RelayError ? e.code : "internal"
      const message = e instanceof Error ? e.message : String(e)
      return { isError: true, content: [{ type: "text", text: `${code}: ${message}` }] }
    }
  }

  server.registerTool("start", TOOLS.start, ({ cwd: given, ...args }, extra) =>
    run("start", args, extra.signal, async () => {
      const folders = [...(given && path.isAbsolute(given) ? [given] : []), ...(await roots()), cwd]
      return { cwd: link.locate(folders) }
    }),
  )
  server.registerTool("step", TOOLS.step, (args, extra) => run("step", args, extra.signal))
  server.registerTool("listen", TOOLS.listen, (args, extra) => run("listen", args, extra.signal))
  server.registerTool("end", TOOLS.end, (args, extra) => run("end", args, extra.signal))
  server.registerTool("read", TOOLS.read, (args, extra) => run("read", args, extra.signal))
  server.registerTool("control", {
    description: "Supervisor controls. Human Body Mode blocks model access to this tool; use the TUI controls.",
    inputSchema: {
      operation: z.enum(["status", "pause", "resume", "wpm", "break", "reset", "stop", "run", "profile", "typingMode", "selectAgent"]),
      value: z.union([z.number(), z.string()]).optional(),
      agentId: z.string().optional(),
      leadAgent: z.string().optional(),
      scope: z.enum(["all"]).optional(),
      command: z.string().optional(),
      profile: z.object({ timing: z.record(z.string(), z.unknown()), seed: z.number().optional() }).optional(),
    },
  }, async (args, extra) => {
    try {
      link.locate([cwd])
      const result = await link.call("control", args, extra.signal)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String(e) }] }
    }
  })

  server.registerPrompt(
    "start",
    {
      description: "Start pair programming: the agent works in your editor at a human pace, narrating as it goes.",
      argsSchema: { task: z.string().optional().describe("What to work on.") },
    },
    ({ task }) => ({ messages: [{ role: "user", content: { type: "text", text: startPrompt(task) } }] }),
  )

  return server
}
