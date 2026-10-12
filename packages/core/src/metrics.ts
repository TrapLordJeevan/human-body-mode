export type MetricsSnapshot = {
  running: boolean
  startedAt?: string
  stoppedAt?: string
  elapsedMs: number
  physicalActionMs: number
  queueWaitMs: number
  charactersTyped: number
  clipboardOperations: number
  commandsExecuted: number
  effectiveWpm: number
  automaticBreaks?: number
  automaticBreakMs?: number
  typingCorrections?: number
  falseStarts?: number
  typingSinceBreakMs?: number
  nextAutomaticBreakMs?: number
  automaticBreakEndsAt?: number
}

export class ExperimentMetrics {
  private started = 0
  private stopped = 0
  private queueWaitCoveredUntil = 0
  physicalActionMs = 0
  queueWaitMs = 0
  charactersTyped = 0
  clipboardOperations = 0
  commandsExecuted = 0
  automaticBreaks = 0
  automaticBreakMs = 0
  typingCorrections = 0
  falseStarts = 0
  typingSinceBreakMs = 0
  nextAutomaticBreakMs = 0
  automaticBreakEndsAt = 0

  start(now = Date.now()): void {
    if (!this.started) this.started = now
    this.stopped = 0
  }

  stop(now = Date.now()): void {
    if (this.started && !this.stopped) this.stopped = now
  }

  reset(now = Date.now()): void {
    this.started = now
    this.stopped = 0
    this.physicalActionMs = 0
    this.queueWaitMs = 0
    this.queueWaitCoveredUntil = now
    this.charactersTyped = 0
    this.clipboardOperations = 0
    this.commandsExecuted = 0
    this.automaticBreaks = this.automaticBreakMs = this.typingCorrections = this.falseStarts = 0
    this.typingSinceBreakMs = this.nextAutomaticBreakMs = 0
    this.automaticBreakEndsAt = 0
  }

  restore(snapshot: MetricsSnapshot): void {
    this.started = snapshot.startedAt ? Date.parse(snapshot.startedAt) : 0
    this.stopped = snapshot.stoppedAt ? Date.parse(snapshot.stoppedAt) : 0
    this.physicalActionMs = snapshot.physicalActionMs
    this.queueWaitMs = snapshot.queueWaitMs
    this.queueWaitCoveredUntil = 0
    this.charactersTyped = snapshot.charactersTyped
    this.clipboardOperations = snapshot.clipboardOperations
    this.commandsExecuted = snapshot.commandsExecuted
    this.automaticBreaks = snapshot.automaticBreaks ?? 0
    this.automaticBreakMs = snapshot.automaticBreakMs ?? 0
    this.typingCorrections = snapshot.typingCorrections ?? 0
    this.falseStarts = snapshot.falseStarts ?? 0
    this.typingSinceBreakMs = snapshot.typingSinceBreakMs ?? 0
    this.nextAutomaticBreakMs = snapshot.nextAutomaticBreakMs ?? 0
    this.automaticBreakEndsAt = snapshot.automaticBreakEndsAt ?? 0
  }

  /** FIFO waiting intervals arrive in time order; count their union, not each agent's overlap. */
  addQueueWait(queuedAt: number, startedAt: number): void {
    this.queueWaitMs += Math.max(0, startedAt - Math.max(queuedAt, this.queueWaitCoveredUntil, this.started))
    this.queueWaitCoveredUntil = Math.max(this.queueWaitCoveredUntil, startedAt)
  }

  snapshot(now = Date.now()): MetricsSnapshot {
    const elapsedMs = this.started ? (this.stopped || now) - this.started : 0
    return {
      running: this.started > 0 && !this.stopped,
      ...(this.started ? { startedAt: new Date(this.started).toISOString() } : {}),
      ...(this.stopped ? { stoppedAt: new Date(this.stopped).toISOString() } : {}),
      elapsedMs,
      physicalActionMs: this.physicalActionMs,
      queueWaitMs: this.queueWaitMs,
      charactersTyped: this.charactersTyped,
      clipboardOperations: this.clipboardOperations,
      commandsExecuted: this.commandsExecuted,
      automaticBreaks: this.automaticBreaks,
      automaticBreakMs: this.automaticBreakMs,
      typingCorrections: this.typingCorrections,
      falseStarts: this.falseStarts,
      typingSinceBreakMs: this.typingSinceBreakMs,
      nextAutomaticBreakMs: this.nextAutomaticBreakMs,
      automaticBreakEndsAt: this.automaticBreakEndsAt,
      effectiveWpm: this.physicalActionMs ? (this.charactersTyped * 12_000) / this.physicalActionMs : 0,
    }
  }
}
