import * as fs from "node:fs"
import * as esbuild from "esbuild"

fs.mkdirSync("plugin/server", { recursive: true })
const version = JSON.parse(fs.readFileSync("packages/vscode/package.json", "utf8")).version
await esbuild.build({
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  minify: true,
  entryPoints: ["packages/relay/src/main.ts"],
  loader: { ".md": "text" },
  define: { AI_PAIR_VERSION: JSON.stringify(version) },
  outfile: "plugin/server/pair-mcp.cjs",
})
