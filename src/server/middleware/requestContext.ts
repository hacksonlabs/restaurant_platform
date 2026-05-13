import type { NextFunction, Request, Response } from "express";
import { createId } from "../utils/ids";
import { log } from "../utils/logger";

export function attachRequestContext(request: Request, response: Response, next: NextFunction) {
  const requestId = request.header("x-request-id")?.trim() || createId("req");
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  response.on("finish", () => {
    log(response.statusCode >= 500 ? "error" : "info", "http_request", {
      requestId,
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
    });
  });
  next();
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
