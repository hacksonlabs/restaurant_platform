import type { EventHandler, InboundEventContext } from "./base";

export class ToastStatusEventHandler implements EventHandler {
  provider = "toast" as const;

  canHandle(event: InboundEventContext) {
    return event.provider === "toast";
  }

  async handle(event: InboundEventContext) {
    return {
      status: "ignored",
      orderId:
        typeof event.payload.orderId === "string"
          ? event.payload.orderId
          : typeof event.payload.guid === "string"
            ? event.payload.guid
            : undefined,
    };
  }
}
