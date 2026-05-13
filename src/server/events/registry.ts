import type { EventHandler, InboundEventContext } from "./base";
import { ToastStatusEventHandler } from "./toast";

export class EventHandlerRegistry {
  private handlers: EventHandler[] = [new ToastStatusEventHandler()];

  async handle(event: InboundEventContext) {
    const handler = this.handlers.find((candidate) => candidate.canHandle(event));
    if (!handler) {
      return { status: "ignored" as const };
    }
    return handler.handle(event);
  }
}
