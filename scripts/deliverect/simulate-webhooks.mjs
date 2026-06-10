#!/usr/bin/env node
import { createHmac } from "node:crypto";

const DEFAULT_BASE_URL = "https://staging-phantom.up.railway.app";
const DEFAULT_LOCAL_URL = "http://localhost:3030";

const DEFAULTS = {
  accountId: "acct_deliverect_sandbox",
  accountName: "Deliverect Sandbox Account",
  channelLinkId: "sandbox-channel-link-001",
  channelLocationId: "sandbox-channel-location-001",
  locationId: "sandbox-provider-location-001",
  orderReference: "phantom-sandbox-order-001",
};

const WEBHOOK_PATHS = {
  registration: "/api/webhooks/deliverect/channel/register",
  menu: "/api/webhooks/deliverect/channel/menu",
  "duplicate-menu": "/api/webhooks/deliverect/channel/menu",
  snooze: "/api/webhooks/deliverect/channel/snooze",
  unsnooze: "/api/webhooks/deliverect/channel/snooze",
  "busy-mode": "/api/webhooks/deliverect/channel/busy-mode",
  "order-status": "/api/webhooks/deliverect/channel/order-status",
  "unknown-status": "/api/webhooks/deliverect/channel/order-status",
};

const EVENT_ORDER = [
  "registration",
  "menu",
  "duplicate-menu",
  "snooze",
  "unsnooze",
  "busy-mode",
  "order-status",
  "unknown-status",
];

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.PHANTOM_BASE_URL || DEFAULT_BASE_URL,
    event: "registration",
    ...DEFAULTS,
    sharedSecret: process.env.DELIVERECT_WEBHOOK_SECRET,
    hmacSecret: process.env.DELIVERECT_WEBHOOK_HMAC_SECRET,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (next == null || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  if (args.local) args.baseUrl = DEFAULT_LOCAL_URL;
  return args;
}

function usage() {
  console.log(`Simulate Deliverect Channel webhooks against Phantom.

Usage:
  node scripts/deliverect/simulate-webhooks.mjs --event registration --base-url http://localhost:3030
  node scripts/deliverect/simulate-webhooks.mjs --event menu --base-url https://staging-phantom.up.railway.app
  node scripts/deliverect/simulate-webhooks.mjs --event all --channel-link-id sandbox-channel-link-001

Events:
  ${EVENT_ORDER.join(", ")}

Options:
  --local                         Use ${DEFAULT_LOCAL_URL}
  --base-url <url>                Defaults to ${DEFAULT_BASE_URL}
  --channel-link-id <id>          Defaults to ${DEFAULTS.channelLinkId}
  --account-id <id>               Defaults to ${DEFAULTS.accountId}
  --location-id <id>              Defaults to ${DEFAULTS.locationId}
  --order-reference <reference>   Defaults to ${DEFAULTS.orderReference}
  --shared-secret <secret>        Sends x-deliverect-webhook-secret without printing the secret
  --hmac-secret <secret>          Signs the raw body with X-Server-Authorization-HMAC-SHA256

These payloads are placeholders based on Phantom's current parser expectations until Deliverect sends real sandbox payloads.`);
}

function nowPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function normalizeOptions(args) {
  return {
    ...args,
    channelLinkId: args["channel-link-id"] || args.channelLinkId,
    accountId: args["account-id"] || args.accountId,
    accountName: args["account-name"] || args.accountName,
    channelLocationId: args["channel-location-id"] || args.channelLocationId,
    locationId: args["location-id"] || args.locationId,
    orderReference: args["order-reference"] || args.orderReference,
    sharedSecret: args["shared-secret"] || args.sharedSecret,
    hmacSecret: args["hmac-secret"] || args.hmacSecret,
  };
}

function baseEnvelope(options, eventName) {
  return {
    eventId: `evt_${eventName}_${options.channelLinkId}`,
    accountId: options.accountId,
    accountName: options.accountName,
    channelLocationId: options.channelLocationId,
    channelLinkId: options.channelLinkId,
    locationId: options.locationId,
  };
}

function registrationPayload(options) {
  return {
    ...baseEnvelope(options, "registration"),
    status: "active",
    channelLinkName: "MealOps Deliverect Sandbox",
    fulfillmentTypes: ["pickup", "delivery"],
  };
}

function menuPayload(options) {
  return {
    ...baseEnvelope(options, "menu_push"),
    menus: [
      {
        menuId: "menu_sandbox_lunch",
        menu: "Lunch",
        categories: [
          {
            id: "cat_sandwiches",
            name: "Sandwiches",
            products: [
              {
                plu: "SANDWICH-001",
                name: "Sandbox Chicken Sandwich",
                description: "Placeholder menu item for Deliverect sandbox testing.",
                price: 1299,
                status: "available",
                imageUrl: "https://example.com/sandbox-chicken-sandwich.jpg",
                taxes: [{ name: "Sales tax", rate: 0.0875 }],
                modifierGroups: [
                  {
                    id: "MODGRP-SAUCE",
                    name: "Sauce",
                    min: 1,
                    max: 2,
                    modifiers: [
                      { plu: "SAUCE-RANCH", name: "Ranch", price: 0, status: "available" },
                      { plu: "SAUCE-HOT", name: "Hot Sauce", price: 50, status: "available" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function snoozePayload(options, action) {
  return {
    ...baseEnvelope(options, action),
    operations: [
      {
        action,
        data: {
          items: [
            {
              plu: "SANDWICH-001",
              snoozeStart: action === "snooze" ? new Date().toISOString() : undefined,
              snoozeEnd: action === "snooze" ? nowPlusMinutes(90) : undefined,
            },
          ],
        },
      },
    ],
  };
}

function busyModePayload(options) {
  return {
    ...baseEnvelope(options, "busy_mode"),
    status: "paused",
    until: nowPlusMinutes(45),
    reason: "Manual sandbox busy-mode test.",
  };
}

function orderStatusPayload(options, status) {
  return {
    ...baseEnvelope(options, `order_status_${status}`),
    channelOrderId: options.orderReference,
    orderId: "deliverect-sandbox-order-001",
    status,
    timeStamp: new Date().toISOString(),
  };
}

function payloadFor(event, options) {
  switch (event) {
    case "registration":
      return registrationPayload(options);
    case "menu":
    case "duplicate-menu":
      return menuPayload(options);
    case "snooze":
      return snoozePayload(options, "snooze");
    case "unsnooze":
      return snoozePayload(options, "unsnooze");
    case "busy-mode":
      return busyModePayload(options);
    case "order-status":
      return orderStatusPayload(options, "20");
    case "unknown-status":
      return orderStatusPayload(options, "waiting_for_provider_magic");
    default:
      throw new Error(`Unsupported event "${event}".`);
  }
}

async function postWebhook(event, options) {
  const url = new URL(WEBHOOK_PATHS[event], options.baseUrl).toString();
  const payload = payloadFor(event, options);
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (options.sharedSecret) {
    headers["x-deliverect-webhook-secret"] = options.sharedSecret;
  }
  if (options.hmacSecret) {
    headers["X-Server-Authorization-HMAC-SHA256"] = createHmac("sha256", options.hmacSecret)
      .update(body)
      .digest("hex");
  }

  const response = await fetch(url, { method: "POST", headers, body });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep plain text responses readable.
  }
  console.log(JSON.stringify({
    event,
    method: "POST",
    url,
    status: response.status,
    ok: response.ok,
    response: parsed,
  }, null, 2));
  return response;
}

async function main() {
  const args = normalizeOptions(parseArgs(process.argv.slice(2)));
  if (args.help) {
    usage();
    return;
  }
  const events = args.event === "all" ? EVENT_ORDER : [args.event];
  for (const event of events) {
    if (!WEBHOOK_PATHS[event]) {
      throw new Error(`Unsupported event "${event}". Run with --help for valid events.`);
    }
    await postWebhook(event, args);
    if (event === "duplicate-menu") {
      await postWebhook(event, args);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
