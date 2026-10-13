/** Batch leases keep navigation, clipboard, edits and command entry on the same lane. */
export class InputScheduler {
  mode: "shared" | "individual" | "lead" = "shared"
  lead = ""
  private active = new Map<string, string[]>()
  private waiting: { agent: string; files: string[]; signal: AbortSignal; resolve: (release: () => void) => void; reject: (error: Error) => void; abort: () => void }[] = []

  setMode(mode: unknown, lead = this.lead): void {
    if (!["shared", "individual", "lead"].includes(String(mode))) throw new Error("Unknown typing mode")
    if (this.active.size || this.waiting.length) throw new Error("Wait until all queued input finishes before changing typing mode or lead")
    this.mode = mode as typeof this.mode
    this.lead = lead
  }

  status(agent: string): string {
    return this.active.has(agent) ? "operating" : this.waiting.some(w => w.agent === agent) ? "waiting for typer" : "ready"
  }

  acquire(agent: string, files: string[], signal: AbortSignal): Promise<() => void> {
    if (this.mode === "lead" && agent !== this.lead) return Promise.reject(new Error("Only the selected lead agent may operate the editor. Send your findings to the lead."))
    if (signal.aborted) return Promise.reject(new Error("Input request interrupted"))
    return new Promise((resolve, reject) => {
      const item = { agent, files, signal, resolve, reject, abort: () => {
        this.waiting = this.waiting.filter(w => w !== item)
        reject(new Error("Input request interrupted"))
        this.pump()
      } }
      this.waiting.push(item)
      signal.addEventListener("abort", item.abort, { once: true })
      this.pump()
    })
  }

  private conflicts(a: string[], b: string[]): boolean {
    return this.mode !== "individual" || a.includes("*") || b.includes("*") || a.some(file => b.includes(file))
  }

  private pump(): void {
    for (const item of [...this.waiting]) {
      if (this.active.has(item.agent)) continue
      if ([...this.active.values()].some(files => this.conflicts(files, item.files))) continue
      // A later request may pass a blocked one only if their resources don't overlap.
      if (this.waiting.slice(0, this.waiting.indexOf(item)).some(w => this.conflicts(w.files, item.files))) continue
      this.waiting = this.waiting.filter(w => w !== item)
      item.signal.removeEventListener("abort", item.abort)
      this.active.set(item.agent, item.files)
      let released = false
      item.resolve(() => {
        if (released) return
        released = true
        this.active.delete(item.agent)
        this.pump()
      })
    }
  }
}
