export interface InboundEventContext {
  provider: "toast" | "deliverect";
  eventType: string;
  externalEventId?: string;
  payload: Record<string, unknown>;
}

export interface EventHandler {
  provider: "toast" | "deliverect";
  canHandle(event: InboundEventContext): boolean;
  handle(event: InboundEventContext): Promise<{ status: "processed" | "ignored"; orderId?: string }>;
}
