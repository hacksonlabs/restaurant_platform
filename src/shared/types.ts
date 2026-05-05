export type POSProvider = "toast" | "square" | "deliverect" | "olo";
export type POSConnectionStatus =
  | "not_connected"
  | "sandbox"
  | "connected"
  | "error"
  | "disabled";
export type AgentPermissionStatus = "pending" | "allowed" | "blocked" | "revoked";
export type DefaultApprovalMode = "auto" | "manual_review" | "threshold_review";
export type FulfillmentType = "pickup" | "delivery" | "catering";
export type SubstitutionPolicy = "strict" | "allow_equivalent" | "require_approval";
export type PaymentPolicy = "required_before_submit" | "invoice_manual" | "stored_payment";
export type AgentOrderStatus =
  | "draft"
  | "received"
  | "validating"
  | "validation_failed"
  | "needs_approval"
  | "approved"
  | "quoting"
  | "quoted"
  | "quote_failed"
  | "submitting_to_pos"
  | "submitted_to_pos"
  | "accepted"
  | "rejected"
  | "preparing"
  | "ready"
  | "completed"
  | "failed"
  | "cancelled";

export interface Restaurant {
  id: string;
  name: string;
  location: string;
  timezone: string;
  posProvider: POSProvider;
  agentOrderingEnabled: boolean;
  defaultApprovalMode: DefaultApprovalMode;
  contactEmail: string;
  contactPhone: string;
  fulfillmentTypesSupported: FulfillmentType[];
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantLocation {
  id: string;
  restaurantId: string;
  name: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface POSConnection {
  id: string;
  restaurantId: string;
  provider: POSProvider;
  status: POSConnectionStatus;
  mode: "mock" | "live";
  restaurantGuid?: string;
  locationId?: string;
  lastTestedAt?: string;
  lastSyncedAt?: string;
  metadata: Record<string, unknown>;
}

export interface CanonicalModifier {
  id: string;
  modifierGroupId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
}

export interface CanonicalModifierGroup {
  id: string;
  restaurantId: string;
  name: string;
  selectionType: "single" | "multi";
  required: boolean;
  minSelections: number;
  maxSelections: number | null;
}

export interface CanonicalMenuItem {
  id: string;
  restaurantId: string;
  category: string;
  name: string;
  description: string;
  priceCents: number;
  availability: "available" | "unavailable";
  mappingStatus: "mapped" | "needs_review";
  modifierGroupIds: string[];
  posRef: {
    provider: POSProvider;
    externalId: string;
  };
}

export interface POSMenuMapping {
  id: string;
  restaurantId: string;
  canonicalType: "item" | "modifier_group" | "modifier";
  canonicalId: string;
  provider: POSProvider;
  providerReference: string;
  status: "mapped" | "needs_review";
}

export interface Agent {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

export interface AgentApiKey {
  id: string;
  agentId: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  lastUsedAt?: string;
  createdAt: string;
  rotatedAt?: string;
}

export interface RestaurantAgentPermission {
  id: string;
  restaurantId: string;
  agentId: string;
  status: AgentPermissionStatus;
  notes?: string;
  lastActivityAt?: string;
}

export interface OrderingRule {
  id: string;
  restaurantId: string;
  minimumLeadTimeMinutes: number;
  maxOrderDollarAmount: number;
  maxItemQuantity: number;
  maxHeadcount: number;
  autoAcceptEnabled: boolean;
  managerApprovalThresholdCents: number;
  blackoutWindows: Array<{ id: string; label: string; startsAt: string; endsAt: string }>;
  allowedFulfillmentTypes: FulfillmentType[];
  substitutionPolicy: SubstitutionPolicy;
  paymentPolicy: PaymentPolicy;
  allowedAgentIds: string[];
}

export interface CanonicalCustomerInfo {
  name: string;
  email?: string;
  phone?: string;
  teamName?: string;
}

export interface CanonicalOrderModifierIntent {
  modifier_group_id: string;
  modifier_id: string;
  quantity: number;
}

export interface CanonicalOrderItemIntent {
  item_id: string;
  quantity: number;
  notes?: string;
  modifiers: CanonicalOrderModifierIntent[];
}

export interface CanonicalOrderIntent {
  restaurant_id: string;
  agent_id: string;
  external_order_reference: string;
  customer: CanonicalCustomerInfo;
  fulfillment_type: FulfillmentType;
  requested_fulfillment_time: string;
  fulfillment_address?: {
    address1: string;
    city: string;
    state: string;
    postal_code: string;
    notes?: string;
  };
  headcount: number;
  budget_constraints?: {
    max_total_cents?: number;
  };
  payment_policy: PaymentPolicy;
  items: CanonicalOrderItemIntent[];
  dietary_constraints: string[];
  packaging_instructions?: string;
  substitution_policy: SubstitutionPolicy;
  approval_requirements?: {
    manager_approval_required?: boolean;
  };
  metadata: Record<string, unknown>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
}

export interface OrderValidationResult {
  id: string;
  orderId: string;
  valid: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
}

export interface OrderQuote {
  id: string;
  orderId: string;
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  currency: "USD";
  quotedAt: string;
}

export interface POSOrderSubmission {
  id: string;
  orderId: string;
  provider: POSProvider;
  status: "pending" | "submitted" | "accepted" | "failed";
  externalOrderId?: string;
  response: Record<string, unknown>;
  submittedAt: string;
}

export interface StatusEvent {
  id: string;
  orderId: string;
  status: AgentOrderStatus;
  message: string;
  createdAt: string;
}

export interface AgentOrderRecord {
  id: string;
  restaurantId: string;
  agentId: string;
  externalOrderReference: string;
  customerName: string;
  customerEmail?: string;
  teamName?: string;
  fulfillmentType: FulfillmentType;
  requestedFulfillmentTime: string;
  headcount: number;
  status: AgentOrderStatus;
  approvalRequired: boolean;
  totalEstimateCents: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  packagingInstructions?: string;
  dietaryConstraints: string[];
  orderIntent: CanonicalOrderIntent;
}

export interface AgentOrderItemRecord {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  notes?: string;
}

export interface AgentOrderModifierRecord {
  id: string;
  orderItemId: string;
  modifierGroupId: string;
  modifierId: string;
  quantity: number;
}

export interface ReportingDailyMetric {
  id: string;
  restaurantId: string;
  date: string;
  totalOrders: number;
  revenueCents: number;
  averageOrderValueCents: number;
  approvalRate: number;
  successRate: number;
  rejectedOrders: number;
  averageLeadTimeMinutes: number;
  upcomingScheduledOrderVolume: number;
}

export interface AuditLog {
  id: string;
  restaurantId: string;
  actorType: "manager" | "agent" | "system";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface DashboardSnapshot {
  restaurant: Restaurant;
  posConnectionStatus: POSConnectionStatus;
  agentOrderingStatus: "enabled" | "disabled";
  ordersThisWeek: number;
  revenueFromAgentOrdersCents: number;
  topItem: string;
  ordersNeedingReview: number;
  recentActivity: AuditLog[];
}

export interface MenuSyncResult {
  status: "success" | "warning" | "error";
  syncedAt: string;
  itemCount: number;
  categoryCount: number;
  modifierGroupCount: number;
  message: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: POSConnectionStatus;
  message: string;
  checkedAt: string;
}

export interface OrderQuoteResult {
  ok: boolean;
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  totalCents: number;
  message: string;
}

export interface POSSubmissionResult {
  ok: boolean;
  externalOrderId: string | null;
  status: "submitted" | "accepted" | "failed";
  message: string;
  raw: Record<string, unknown>;
}

export interface POSOrderStatusResult {
  ok: boolean;
  externalOrderId: string;
  status: AgentOrderStatus;
  message: string;
}

export interface POSDiagnosticCheck {
  key: string;
  ok: boolean;
  message: string;
}

export interface POSDiagnosticsResult {
  provider: POSProvider;
  mode: "mock" | "live";
  overallOk: boolean;
  checks: POSDiagnosticCheck[];
}

export interface POSContext {
  restaurant: Restaurant;
  location: RestaurantLocation;
  connection: POSConnection;
  menuItems: CanonicalMenuItem[];
  modifierGroups: CanonicalModifierGroup[];
  modifiers: CanonicalModifier[];
}

export interface RestaurantReportingSnapshot {
  metrics: ReportingDailyMetric[];
  topItems: Array<{ name: string; count: number }>;
  topModifiers: Array<{ name: string; count: number }>;
  failureReasons: Array<{ reason: string; count: number }>;
}
