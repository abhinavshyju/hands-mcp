import type { ControlEvent } from "@editer/shared";

type Handler = (event: ControlEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();
  private replay: ControlEvent[] = [];
  private readonly replayLimit: number;

  constructor(replayLimit = 200) {
    this.replayLimit = replayLimit;
  }

  emit(type: string, payload: unknown): ControlEvent {
    const event: ControlEvent = { type, ts: Date.now(), payload };
    this.replay.push(event);
    if (this.replay.length > this.replayLimit) {
      this.replay.shift();
    }
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (err) {
        console.error("event handler failed", err);
      }
    }
    return event;
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  getReplay(): ControlEvent[] {
    return [...this.replay];
  }
}
