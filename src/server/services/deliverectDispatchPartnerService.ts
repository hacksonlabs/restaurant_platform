import { z } from "zod";
import type { AppEnv } from "../config/env";
import { createId } from "../utils/ids";
import { log } from "../utils/logger";

// Phantom acts as a "Generic" Dispatch partner so the full Dispatch loop
// (availability validation -> job creation -> courier status updates) can be
// exercised against the Deliverect sandbox without a commercial DSP contract.
// Deliverect calls the validate/create/cancel webhooks below; Phantom answers
// as a courier fleet and (optionally) simulates a courier run by posting
// status updates back to Deliverect's fulfillment events endpoint.
// Spec: https://developers.deliverect.com/docs/building-dispatch-integration

const dispatchDeliveryLocationSchema = z
  .object({
    orderId: z.string().min(1),
    channelOrderDisplayId: z.string().optional(),
    deliveryTime: z.string().optional(),
    packageSize: z.string().optional(),
    orderDescription: z.string().optional(),
    street: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
  })
  .passthrough();

const dispatchJobPayloadSchema = z
  .object({
    jobId: z.string().min(1),
    account: z.string().optional(),
    pickupTime: z.string().optional(),
    transportType: z.string().optional(),
    driverTip: z.number().optional(),
    pickupLocation: z.record(z.unknown()).optional(),
    deliveryLocations: z.array(dispatchDeliveryLocationSchema).min(1),
    ageCheck: z.boolean().optional(),
  })
  .passthrough();

const dispatchCancelPayloadSchema = z
  .object({
    jobId: z.string().min(1),
  })
  .passthrough();

// Deliverect fulfillment status codes for generic dispatch events.
export const DISPATCH_STATUS_SEQUENCE = [
  { code: 83, label: "en_route_to_pickup" },
  { code: 85, label: "arrived_at_pickup" },
  { code: 87, label: "en_route_to_dropoff" },
  { code: 89, label: "arrived_at_dropoff" },
  { code: 90, label: "delivered" },
] as const;

export interface DispatchJobDelivery {
  deliveryId: string;
  orderId: string;
  channelOrderDisplayId?: string;
  deliveryTimeETA: string;
}

export interface DispatchJobRecord {
  jobId: string;
  externalJobId: string;
  status: "validated" | "accepted" | "in_progress" | "completed" | "cancelled";
  lastStatusCode: number | null;
  pickupTimeETA: string;
  priceCents: number;
  deliveries: DispatchJobDelivery[];
  courier: {
    courierId: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    transportType: string;
  };
  receivedAt: string;
  updatedAt: string;
}

interface DispatchTokenCache {
  accessToken: string;
  expiresAt: number;
}

const PICKUP_LEAD_TIME_MS = 10 * 60 * 1000;
const DROPOFF_TRAVEL_TIME_MS = 15 * 60 * 1000;
const ESTIMATED_DISTANCE_METERS = 3000;

function isoInFuture(base: string | undefined, offsetMs: number) {
  const parsed = base ? new Date(base).getTime() : Number.NaN;
  const anchor = Number.isFinite(parsed) ? Math.max(parsed, Date.now()) : Date.now();
  return new Date(anchor + offsetMs).toISOString();
}

export class DeliverectDispatchPartnerService {
  private jobs = new Map<string, DispatchJobRecord>();

  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();

  private tokenCache: DispatchTokenCache | null = null;

  constructor(private env: AppEnv) {}

  buildWebhookUrls(baseUrl: string) {
    const root = `${baseUrl.replace(/\/$/, "")}/api/webhooks/deliverect/dispatch`;
    return {
      validateURL: `${root}/validate_job`,
      createURL: `${root}/create_job`,
      cancelURL: `${root}/cancel_job`,
    };
  }

  verifyAuthorization(headers: Record<string, unknown>) {
    const expected = this.env.deliverectDispatchWebhookToken;
    if (!expected) {
      return { verified: false, required: false, message: "dispatch webhook token not configured; verification skipped." };
    }
    const raw = headers.authorization ?? headers.Authorization;
    const provided = (Array.isArray(raw) ? raw[0] : String(raw ?? "")).replace(/^Bearer\s+/i, "").trim();
    if (provided !== expected) {
      throw new Error("Deliverect dispatch webhook authorization failed.");
    }
    return { verified: true, required: true, message: "dispatch webhook bearer token verified." };
  }

  validateJob(payload: unknown) {
    const job = dispatchJobPayloadSchema.parse(payload);
    const pickupTimeETA = isoInFuture(job.pickupTime, PICKUP_LEAD_TIME_MS);
    const deliveries = job.deliveryLocations.map((location) => ({
      deliveryId: createId("dlv"),
      orderId: location.orderId,
      channelOrderDisplayId: location.channelOrderDisplayId,
      deliveryTimeETA: isoInFuture(location.deliveryTime ?? job.pickupTime, PICKUP_LEAD_TIME_MS + DROPOFF_TRAVEL_TIME_MS),
    }));
    this.rememberJob(job.jobId, deliveries, pickupTimeETA, "validated");
    log("info", "dispatch_job_validated", { stage: "dispatch", jobId: job.jobId, deliveryCount: deliveries.length });
    return {
      jobId: job.jobId,
      canDeliver: true,
      distance: ESTIMATED_DISTANCE_METERS,
      pickupTimeETA,
      deliveryLocations: deliveries.map((delivery) => ({
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        deliveryTimeETA: delivery.deliveryTimeETA,
      })),
      price: {
        price: this.env.deliverectDispatchFlatPriceCents,
        taxRate: this.env.deliverectDispatchTaxRateBasisPoints,
      },
    };
  }

  createJob(payload: unknown) {
    const job = dispatchJobPayloadSchema.parse(payload);
    const existing = this.jobs.get(job.jobId);
    const pickupTimeETA = existing?.pickupTimeETA ?? isoInFuture(job.pickupTime, PICKUP_LEAD_TIME_MS);
    const deliveries =
      existing?.deliveries.length === job.deliveryLocations.length
        ? existing.deliveries
        : job.deliveryLocations.map((location) => ({
            deliveryId: createId("dlv"),
            orderId: location.orderId,
            channelOrderDisplayId: location.channelOrderDisplayId,
            deliveryTimeETA: isoInFuture(location.deliveryTime ?? job.pickupTime, PICKUP_LEAD_TIME_MS + DROPOFF_TRAVEL_TIME_MS),
          }));
    const record = this.rememberJob(job.jobId, deliveries, pickupTimeETA, "accepted");
    log("info", "dispatch_job_created", {
      stage: "dispatch",
      jobId: job.jobId,
      externalJobId: record.externalJobId,
      simulate: this.env.deliverectDispatchSimulate,
    });
    if (this.env.deliverectDispatchSimulate) {
      this.scheduleCourierSimulation(record);
    }
    return {
      jobId: job.jobId,
      canDeliver: true,
      pickupTimeETA,
      externalJobId: record.externalJobId,
      distance: ESTIMATED_DISTANCE_METERS,
      price: {
        price: this.env.deliverectDispatchFlatPriceCents,
        taxRate: this.env.deliverectDispatchTaxRateBasisPoints,
      },
      courier: record.courier,
      deliveryLocations: deliveries.map((delivery) => ({
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        channelOrderDisplayId: delivery.channelOrderDisplayId ?? "",
        deliveryTimeETA: delivery.deliveryTimeETA,
        deliveryRemarks: "",
      })),
    };
  }

  cancelJob(payload: unknown) {
    const cancellation = dispatchCancelPayloadSchema.parse(payload);
    this.clearSimulation(cancellation.jobId);
    const record = this.jobs.get(cancellation.jobId);
    if (record) {
      record.status = "cancelled";
      record.updatedAt = new Date().toISOString();
    }
    log("info", "dispatch_job_cancelled", { stage: "dispatch", jobId: cancellation.jobId, known: Boolean(record) });
    return { status: "confirmed", reason: "", price: 0 };
  }

  listJobs() {
    return Array.from(this.jobs.values()).sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  }

  private rememberJob(
    jobId: string,
    deliveries: DispatchJobDelivery[],
    pickupTimeETA: string,
    status: DispatchJobRecord["status"],
  ): DispatchJobRecord {
    const now = new Date().toISOString();
    const existing = this.jobs.get(jobId);
    const record: DispatchJobRecord = {
      jobId,
      externalJobId: existing?.externalJobId ?? createId("phantomjob"),
      status,
      lastStatusCode: existing?.lastStatusCode ?? null,
      pickupTimeETA,
      priceCents: this.env.deliverectDispatchFlatPriceCents,
      deliveries,
      courier: existing?.courier ?? {
        courierId: createId("courier"),
        firstName: "Phantom",
        lastName: "Courier",
        phoneNumber: "+15555550100",
        transportType: "car",
      },
      receivedAt: existing?.receivedAt ?? now,
      updatedAt: now,
    };
    this.jobs.set(jobId, record);
    return record;
  }

  private scheduleCourierSimulation(record: DispatchJobRecord) {
    this.clearSimulation(record.jobId);
    const stepMs = this.env.deliverectDispatchSimulateStepMs;
    const timers = DISPATCH_STATUS_SEQUENCE.map((step, index) =>
      setTimeout(() => {
        this.sendCourierUpdate(record.jobId, step.code, step.label).catch((error) => {
          log("warn", "dispatch_simulation_update_failed", {
            stage: "dispatch",
            jobId: record.jobId,
            statusCode: step.code,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        });
      }, stepMs * (index + 1)),
    );
    this.timers.set(record.jobId, timers);
  }

  private clearSimulation(jobId: string) {
    const timers = this.timers.get(jobId);
    if (timers) {
      timers.forEach((timer) => clearTimeout(timer));
      this.timers.delete(jobId);
    }
  }

  private async sendCourierUpdate(jobId: string, statusCode: number, statusLabel: string) {
    const record = this.jobs.get(jobId);
    if (!record || record.status === "cancelled") return;
    const payload = {
      deliveryJobId: jobId,
      externalJobId: record.externalJobId,
      pickupTimeETA: record.pickupTimeETA,
      transportType: record.courier.transportType,
      courier: {
        name: `${record.courier.firstName} ${record.courier.lastName}`,
        phone: record.courier.phoneNumber,
      },
      locations: record.deliveries.map((delivery) => ({
        orderId: delivery.orderId,
        status: statusCode,
        deliveryTimeETA: delivery.deliveryTimeETA,
      })),
    };
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${this.env.deliverectBaseUrl.replace(/\/$/, "")}/fulfillment/generic/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Deliverect fulfillment event rejected: ${response.status} ${body.slice(0, 300)}`);
    }
    record.lastStatusCode = statusCode;
    record.status = statusCode >= 90 ? "completed" : "in_progress";
    record.updatedAt = new Date().toISOString();
    log("info", "dispatch_courier_update_sent", { stage: "dispatch", jobId, statusCode, statusLabel });
  }

  private async getAccessToken() {
    if (this.env.deliverectAccessToken) {
      return this.env.deliverectAccessToken;
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }
    if (!this.env.deliverectClientId || !this.env.deliverectClientSecret) {
      throw new Error("Deliverect client credentials are required to send dispatch courier updates.");
    }
    const response = await fetch(`${this.env.deliverectBaseUrl.replace(/\/$/, "")}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.env.deliverectClientId,
        client_secret: this.env.deliverectClientSecret,
        audience: this.env.deliverectAudience || this.env.deliverectBaseUrl,
        grant_type: this.env.deliverectGrantType || "token",
        ...(this.env.deliverectScope ? { scope: this.env.deliverectScope } : {}),
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(`Deliverect authentication failed for dispatch updates: ${response.status}`);
    }
    const accessToken =
      typeof payload.access_token === "string"
        ? payload.access_token
        : typeof (payload.token as Record<string, unknown> | undefined)?.access_token === "string"
          ? String((payload.token as Record<string, unknown>).access_token)
          : undefined;
    if (!accessToken) {
      throw new Error("Deliverect authentication succeeded but no access token was returned for dispatch updates.");
    }
    const expiresIn = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3300;
    this.tokenCache = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    return accessToken;
  }
}
