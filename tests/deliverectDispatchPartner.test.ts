import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, type AppEnv } from "../src/server/config/env";
import {
  DeliverectDispatchPartnerService,
  DISPATCH_STATUS_SEQUENCE,
} from "../src/server/services/deliverectDispatchPartnerService";

function buildEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    ...getEnv(),
    deliverectDispatchWebhookToken: "",
    deliverectDispatchFlatPriceCents: 750,
    deliverectDispatchTaxRateBasisPoints: 0,
    deliverectDispatchSimulate: false,
    deliverectDispatchSimulateStepMs: 1,
    deliverectAccessToken: "test-dispatch-token",
    ...overrides,
  };
}

function jobPayload(jobId: string) {
  return {
    jobId,
    account: "account-1",
    pickupTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    transportType: "unknown",
    driverTip: 0,
    pickupLocation: {
      location: "loc-1",
      name: "LB Steakhouse",
      street: "Ashcroft Way",
      streetNumber: "1533",
      postalCode: "94087",
      city: "Sunnyvale",
    },
    deliveryLocations: [
      {
        orderId: "order-abc",
        channelOrderDisplayId: "T1001",
        deliveryTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        packageSize: "large",
        street: "1 Team Way",
        postalCode: "94087",
        city: "Sunnyvale",
        payment: { orderIsAlreadyPaid: true, amount: 13200, paymentType: 0 },
      },
    ],
    ageCheck: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DeliverectDispatchPartnerService", () => {
  it("builds the three standardized dispatch webhook URLs", () => {
    const service = new DeliverectDispatchPartnerService(buildEnv());
    expect(service.buildWebhookUrls("https://staging-phantom.up.railway.app/")).toEqual({
      validateURL: "https://staging-phantom.up.railway.app/api/webhooks/deliverect/dispatch/validate_job",
      createURL: "https://staging-phantom.up.railway.app/api/webhooks/deliverect/dispatch/create_job",
      cancelURL: "https://staging-phantom.up.railway.app/api/webhooks/deliverect/dispatch/cancel_job",
    });
  });

  it("accepts a validate request with ETAs, deliveryIds, and the configured price", () => {
    const service = new DeliverectDispatchPartnerService(buildEnv());
    const result = service.validateJob(jobPayload("job-validate-1"));

    expect(result.jobId).toBe("job-validate-1");
    expect(result.canDeliver).toBe(true);
    expect(result.price).toEqual({ price: 750, taxRate: 0 });
    expect(result.deliveryLocations).toHaveLength(1);
    expect(result.deliveryLocations[0].orderId).toBe("order-abc");
    expect(result.deliveryLocations[0].deliveryId).toMatch(/^dlv_/);
    expect(new Date(result.pickupTimeETA).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(result.deliveryLocations[0].deliveryTimeETA).getTime()).toBeGreaterThan(
      new Date(result.pickupTimeETA).getTime(),
    );
  });

  it("creates a job with a courier, reusing deliveryIds issued during validation", () => {
    const service = new DeliverectDispatchPartnerService(buildEnv());
    const validation = service.validateJob(jobPayload("job-create-1"));
    const created = service.createJob(jobPayload("job-create-1"));

    expect(created.canDeliver).toBe(true);
    expect(created.externalJobId).toMatch(/^phantomjob_/);
    expect(created.courier.firstName).toBe("Phantom");
    expect(created.deliveryLocations[0].deliveryId).toBe(validation.deliveryLocations[0].deliveryId);
  });

  it("confirms cancellations and marks the job cancelled", () => {
    const service = new DeliverectDispatchPartnerService(buildEnv());
    service.createJob(jobPayload("job-cancel-1"));

    const result = service.cancelJob({ jobId: "job-cancel-1" });

    expect(result).toEqual({ status: "confirmed", reason: "", price: 0 });
    expect(service.listJobs().find((job) => job.jobId === "job-cancel-1")?.status).toBe("cancelled");
  });

  it("verifies the bearer token only when one is configured", () => {
    const open = new DeliverectDispatchPartnerService(buildEnv());
    expect(open.verifyAuthorization({}).required).toBe(false);

    const secured = new DeliverectDispatchPartnerService(
      buildEnv({ deliverectDispatchWebhookToken: "dispatch-secret" }),
    );
    expect(secured.verifyAuthorization({ authorization: "Bearer dispatch-secret" }).verified).toBe(true);
    expect(() => secured.verifyAuthorization({ authorization: "Bearer wrong" })).toThrow(
      /authorization failed/,
    );
    expect(() => secured.verifyAuthorization({})).toThrow(/authorization failed/);
  });

  it("simulates the courier lifecycle by posting fulfillment events to Deliverect", async () => {
    const calls: Array<{ url: string; body: any; auth: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        calls.push({
          url: String(url),
          body: JSON.parse(init.body),
          auth: String(init.headers.Authorization),
        });
        return { ok: true, text: async () => "OK", json: async () => ({}) } as any;
      }),
    );

    const service = new DeliverectDispatchPartnerService(buildEnv({ deliverectDispatchSimulate: true }));
    service.createJob(jobPayload("job-simulate-1"));

    await vi.waitFor(() => {
      expect(calls).toHaveLength(DISPATCH_STATUS_SEQUENCE.length);
    });

    expect(calls.every((call) => call.url.endsWith("/fulfillment/generic/events"))).toBe(true);
    expect(calls.every((call) => call.auth === "Bearer test-dispatch-token")).toBe(true);
    expect(calls.map((call) => call.body.locations[0].status)).toEqual(
      DISPATCH_STATUS_SEQUENCE.map((step) => step.code),
    );
    expect(service.listJobs().find((job) => job.jobId === "job-simulate-1")?.status).toBe("completed");
  });
});
