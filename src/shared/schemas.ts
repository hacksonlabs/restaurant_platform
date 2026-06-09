import { z } from "zod";

export const agentApiScopeSchema = z.enum([
  "restaurants:read",
  "menus:read",
  "payments:start",
  "orders:validate",
  "orders:quote",
  "orders:submit",
  "orders:status",
]);

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
  posProvider: z.enum(["mock", "toast", "square", "deliverect", "olo"]).optional(),
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

export const restaurantSignupSchema = z.object({
  restaurantName: z.string().min(1),
  address1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  timezone: z.string().min(1),
  contactPhone: z.string().min(1),
  ownerFullName: z.string().min(1),
  ownerEmail: z.string().email(),
  password: z.string().min(8),
});

export const onboardingDiscoverSchema = z.object({
  provider: z.enum(["olo", "pos"]),
  query: z.string().min(1),
});

export const onboardingAccessRequestSchema = z.object({
  provider: z.enum(["olo", "pos"]),
  providerAccountId: z.string().min(1),
  providerLocationIds: z.array(z.string().min(1)).min(1),
  email: z.string().email(),
});

export const onboardingActivateSchema = z.object({
  provider: z.enum(["olo", "pos"]),
  providerAccountId: z.string().min(1),
  providerLocationIds: z.array(z.string().min(1)).min(1),
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export const mapProviderLocationSchema = z.object({
  restaurantId: z.string().min(1),
  mode: z.enum(["mock", "live"]).default("live"),
  status: z.enum(["sandbox", "connected"]).default("sandbox"),
});

export const createTeamMemberSchema = z.object({
  fullName: z.string().min(1, "Full name is required."),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["owner", "staff", "viewer"]),
  accessScope: z.enum(["all", "selected"]),
  restaurantIds: z.array(z.string().min(1)),
}).superRefine((value, ctx) => {
  if (value.accessScope === "selected" && value.restaurantIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["restaurantIds"],
      message: "Choose at least one restaurant for this account.",
    });
  }
});

export const updateTeamMemberSchema = z.object({
  fullName: z.string().min(1, "Full name is required."),
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["owner", "staff", "viewer"]),
  accessScope: z.enum(["all", "selected"]),
  restaurantIds: z.array(z.string().min(1)),
}).superRefine((value, ctx) => {
  if (value.accessScope === "selected" && value.restaurantIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["restaurantIds"],
      message: "Choose at least one restaurant for this account.",
    });
  }
});

export const createPartnerCredentialSchema = z.object({
  agentId: z.string().min(1, "Agent is required."),
  label: z.string().min(1, "Credential label is required."),
  scopes: z.array(agentApiScopeSchema).min(1, "Choose at least one credential scope."),
  environment: z.enum(["test", "live"]).default("test"),
});

export const createPartnerSchema = z.object({
  name: z.string().min(1, "Partner name is required."),
  contactEmail: z.string().email("Enter a valid contact email.").optional().or(z.literal("")),
  status: z.enum(["pending", "approved", "suspended"]).default("approved"),
});

export const updatePartnerSchema = z.object({
  name: z.string().min(1, "Partner name is required."),
  contactEmail: z.string().email("Enter a valid contact email.").optional().or(z.literal("")),
  status: z.enum(["pending", "approved", "suspended"]),
});

export const createPartnerAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required."),
});

export const updatePartnerAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required."),
});

export const updatePartnerCredentialSchema = z.object({
  label: z.string().min(1, "Credential label is required."),
  scopes: z.array(agentApiScopeSchema).min(1, "Choose at least one credential scope."),
  environment: z.enum(["test", "live"]),
});

export const rotatePartnerCredentialSchema = z.object({
  scopes: z.array(agentApiScopeSchema).min(1, "Choose at least one credential scope."),
  environment: z.enum(["test", "live"]).default("test"),
});

export type CanonicalOrderIntentInput = z.infer<typeof canonicalOrderIntentSchema>;
