import { z } from "zod";

export const canonicalOrderIntentSchema = z.object({
  restaurant_id: z.string().min(1),
  agent_id: z.string().min(1),
  external_order_reference: z.string().min(1),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    teamName: z.string().optional(),
  }),
  fulfillment_type: z.enum(["pickup", "delivery", "catering"]),
  requested_fulfillment_time: z.string().datetime(),
  fulfillment_address: z
    .object({
      address1: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postal_code: z.string().min(1),
      notes: z.string().optional(),
    })
    .optional(),
  headcount: z.number().int().positive(),
  tip_cents: z.number().int().nonnegative().optional(),
  budget_constraints: z
    .object({
      max_total_cents: z.number().int().positive().optional(),
    })
    .optional(),
  payment_policy: z.enum([
    "required_before_submit",
    "invoice_manual",
    "stored_payment",
  ]),
  items: z
    .array(
      z.object({
        item_id: z.string().min(1),
        quantity: z.number().int().positive(),
        notes: z.string().optional(),
        modifiers: z.array(
          z.object({
            modifier_group_id: z.string().min(1),
            modifier_id: z.string().min(1),
            quantity: z.number().int().positive(),
          }),
        ),
      }),
    )
    .min(1),
  dietary_constraints: z.array(z.string()),
  packaging_instructions: z.string().optional(),
  substitution_policy: z.enum([
    "strict",
    "allow_equivalent",
    "require_approval",
  ]),
  approval_requirements: z
    .object({
      manager_approval_required: z.boolean().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()),
});

export const patchRestaurantSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  posProvider: z.enum(["toast", "square", "deliverect", "olo"]).optional(),
  agentOrderingEnabled: z.boolean().optional(),
  defaultApprovalMode: z.enum(["auto", "manual_review", "threshold_review"]).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().min(1).optional(),
  fulfillmentTypesSupported: z
    .array(z.enum(["pickup", "delivery", "catering"]))
    .optional(),
});

export const patchOrderingRulesSchema = z.object({
  minimumLeadTimeMinutes: z.number().int().nonnegative().optional(),
  maxOrderDollarAmount: z.number().positive().optional(),
  maxItemQuantity: z.number().int().positive().optional(),
  maxHeadcount: z.number().int().positive().optional(),
  autoAcceptEnabled: z.boolean().optional(),
  managerApprovalThresholdCents: z.number().int().nonnegative().optional(),
  allowedFulfillmentTypes: z
    .array(z.enum(["pickup", "delivery", "catering"]))
    .optional(),
  substitutionPolicy: z
    .enum(["strict", "allow_equivalent", "require_approval"])
    .optional(),
  paymentPolicy: z
    .enum(["required_before_submit", "invoice_manual", "stored_payment"])
    .optional(),
  allowedAgentIds: z.array(z.string()).optional(),
});

export const patchPermissionSchema = z.object({
  status: z.enum(["pending", "allowed", "blocked", "revoked"]),
  notes: z.string().optional(),
});

export type CanonicalOrderIntentInput = z.infer<typeof canonicalOrderIntentSchema>;
