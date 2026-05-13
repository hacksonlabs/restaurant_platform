export interface LogContext {
  requestId?: string;
  orderId?: string;
  correlationId?: string;
  restaurantId?: string;
  agentId?: string;
  stage?: string;
  [key: string]: unknown;
}

export function log(level: "info" | "warn" | "error", message: string, context: LogContext = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
