const SHELL_SYNTAX = /[\n\r;&|><`$(){}]/

/** Commands permitted to run outside Claude's read-only process sandbox. */
export function commandProblem(command: string): string | undefined {
  if (SHELL_SYNTAX.test(command)) return "shell composition, expansion, and redirection are disabled"
  const words = command.trim().split(/\s+/)
  const executable = words[0]?.replace(/^\.\//, "")
  const args = words.slice(1)
  if (!executable) return "empty command"
  if (executable === "git" && ["status", "diff", "log", "show"].includes(args[0] ?? "")) return undefined
  if (executable === "npm" && ["test", "start", "run"].includes(args[0] ?? "")) return undefined
  if (["node", "tsc"].includes(executable)) return undefined
  if (["mvn", "mvnw"].includes(executable) && args.every((a) => !a.startsWith("-") || ["-q", "--quiet"].includes(a))) {
    if (args.some((a) => ["test", "verify", "compile", "clean"].includes(a))) return undefined
  }
  if (["gradle", "gradlew"].includes(executable) && args.some((a) => ["test", "build", "check", "classes", "clean"].includes(a))) {
    return undefined
  }
  if (executable === "javac" || (executable === "java" && args[0] === "-m" && args[1] === "jdk.compiler/com.sun.tools.javac.Main")) {
    const output = args[args.indexOf("-d") + 1]
    if (args.includes("-d") && output && /(^|\/)(target|build)(\/|$)/.test(output)) return undefined
  }
  return "command is not on the Human Body Mode build/test/read-only allowlist"
}
