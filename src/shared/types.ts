export type POSProvider = "mock" | "toast" | "square" | "deliverect" | "olo";
export type OperatorRole = "owner" | "staff" | "viewer";
export type POSConnectionStatus =
  | "not_connected"
  | "sandbox"
  | "connected"
  | "error"
  | "disabled";
export type AgentPermissionStatus = "pending" | "allowed" | "blocked" | "revoked";
export type DefaultApprovalMode = "auto" | "manual_review" | "threshold_review";
export type FulfillmentType = "pickup" | "delivery" | "catering" | "eat_in" | "curbside";
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
  imageUrl?: string;
  cuisineType?: string;
  description?: string;
  rating?: number;
  deliveryFee?: number;
  minimumOrder?: number;
  supportsCatering?: boolean;
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
  latitude?: number | null;
  longitude?: number | null;
}

export interface POSConnection {
  id: string;
  restaurantId: string;
  provider: POSProvider;
  providerAccountId?: string;
  providerLocationId?: string;
  status: POSConnectionStatus;
  mode: "mock" | "live";
  restaurantGuid?: string;
  locationId?: string;
  lastTestedAt?: string;
  lastSyncedAt?: string;
  metadata: Record<string, unknown>;
}

export type ProviderEnvironment = "sandbox" | "production";

export interface ProviderAccount {
  id: string;
  provider: POSProvider;
  externalAccountId: string;
  displayName: string;
  environment: ProviderEnvironment;
  status: POSConnectionStatus;
  metadata: Record<string, unknown>;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderLocation {
  id: string;
  providerAccountId: string;
  provider: POSProvider;
  externalLocationId: string;
  externalStoreId?: string;
  channelLinkId?: string;
  channelName?: string;
  name: string;
  address?: string;
  timezone?: string;
  status: POSConnectionStatus;
  mappedRestaurantId?: string;
  rawProviderPayload: Record<string, unknown>;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProviderMenuSnapshotStatus = "received" | "processed" | "failed" | "ignored";

export interface ProviderMenuSnapshot {
  id: string;
  provider: POSProvider;
  providerLocationId?: string;
  restaurantId?: string;
  channelLinkId?: string;
  payloadHash: string;
  externalEventId?: string;
  status: ProviderMenuSnapshotStatus;
  rawPayload: Record<string, unknown>;
  error?: string;
  receivedAt: string;
  processedAt?: string;
}

export type CanonicalMenuVersionStatus = "draft" | "published" | "failed" | "retired";

export interface CanonicalMenuVersion {
  id: string;
  restaurantId: string;
  provider: POSProvider;
  providerMenuSnapshotId?: string;
  versionHash: string;
  status: CanonicalMenuVersionStatus;
  itemCount: number;
  categoryCount: number;
  modifierGroupCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  publishedAt?: string;
}

export interface CanonicalModifier {
  id: string;
  modifierGroupId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  menuVersionId?: string;
  sortOrder?: number;
  taxMetadata?: Record<string, unknown>;
}

export interface CanonicalModifierGroup {
  id: string;
  restaurantId: string;
  name: string;
  selectionType: "single" | "multi";
  required: boolean;
  minSelections: number;
  maxSelections: number | null;
  menuVersionId?: string;
  sortOrder?: number;
}

export interface CanonicalMenuItem {
  id: string;
  restaurantId: string;
  category: string;
  name: string;
  description: string;
  imageUrl?: string;
  priceCents: number;
  availability: "available" | "unavailable";
  mappingStatus: "mapped" | "needs_review";
  modifierGroupIds: string[];
  menuVersionId?: string;
  sortOrder?: number;
  taxMetadata?: Record<string, unknown>;
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

export interface Partner {
  id: string;
  name: string;
  slug: string;
  status: "pending" | "approved" | "suspended";
  contactEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  partnerId?: string;
  partner?: Partner;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
}

export interface AgentApiKey {
  id: string;
  agentId: string;
  partnerId?: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  scopes: AgentApiScope[];
  lastUsedAt?: string;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export interface PartnerCredential {
  id: string;
  partnerId: string;
  agentId: string;
  label: string;
  keyPrefix: string;
  keyHash: string;
  scopes: AgentApiScope[];
  environment: "test" | "live";
  lastUsedAt?: string;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export type PartnerCredentialEnvironment = PartnerCredential["environment"];

export interface PartnerCredentialSummary {
  id: string;
  partnerId: string;
  agentId: string;
  label: string;
  keyPrefix: string;
  scopes: AgentApiScope[];
  environment: PartnerCredentialEnvironment;
  lastUsedAt?: string;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export interface PlatformAdminAgentRecord {
  agent: Agent;
  credentials: PartnerCredentialSummary[];
}

export interface PlatformAdminPartnerRecord {
  partner: Partner;
  agents: PlatformAdminAgentRecord[];
  credentials: PartnerCredentialSummary[];
}

export interface AuthenticatedAgentCredential extends AgentApiKey {
  partnerId?: string;
  credentialType: "agent_api_key" | "partner_credential";
  credentialId: string;
}

export type AgentApiScope =
  | "restaurants:read"
  | "menus:read"
  | "payments:start"
  | "orders:validate"
  | "orders:quote"
  | "orders:submit"
  | "orders:status";

export interface RestaurantAgentPermission {
  id: string;
  restaurantId: string;
  agentId: string;
  status: AgentPermissionStatus;
  notes?: string;
  lastActivityAt?: string;
}

export interface OperatorUser {
  id: string;
  email: string;
  fullName: string;
  supabaseUserId?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface OperatorMembership {
  id: string;
  operatorUserId: string;
  restaurantId: string;
  locationId?: string;
  role: OperatorRole;
  createdAt: string;
}

export interface OperatorSession {
  id: string;
  operatorUserId: string;
  selectedRestaurantId: string;
  selectedLocationId?: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedOperator {
  user: OperatorUser;
  memberships: OperatorMembership[];
  selectedMembership: OperatorMembership;
}

export interface PlatformAdminUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt?: string;
}

export interface PlatformAdminSession {
  id: string;
  adminUserId: string;
  sessionTokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedPlatformAdmin {
  user: Omit<PlatformAdminUser, "passwordHash">;
}

export interface TeamMemberAssignment {
  membershipId: string;
  restaurantId: string;
  restaurantName: string;
  locationId?: string;
  role: OperatorRole;
}

export interface TeamMemberRecord {
  user: OperatorUser;
  assignments: TeamMemberAssignment[];
}

export interface CreateTeamMemberInput {
  fullName: string;
  email: string;
  password: string;
  role: OperatorRole;
  accessScope: "all" | "selected";
  restaurantIds: string[];
}

export interface UpdateTeamMemberInput {
  fullName: string;
  email: string;
  role: OperatorRole;
  accessScope: "all" | "selected";
  restaurantIds: string[];
}

export interface RestaurantSignupInput {
  restaurantName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  timezone: string;
  contactPhone: string;
  ownerFullName: string;
  ownerEmail: string;
  password: string;
}

export type OnboardingProvider = "olo" | "pos";

export interface OnboardingDiscoveredLocation {
  id: string;
  name: string;
  address: string;
  timezone: string;
}

export interface OnboardingDiscoveredAccount {
  provider: OnboardingProvider;
  accountId: string;
  name: string;
  locations: OnboardingDiscoveredLocation[];
}

export interface OnboardingDiscoverInput {
  provider: OnboardingProvider;
  query: string;
}

export interface OnboardingAccessRequestInput {
  provider: OnboardingProvider;
  providerAccountId: string;
  providerLocationIds: string[];
  email: string;
}

export interface OnboardingActivateInput {
  provider: OnboardingProvider;
  providerAccountId: string;
  providerLocationIds: string[];
  fullName: string;
  email: string;
  password: string;
}

export interface OnboardingRequestRecord {
  id: string;
  provider: OnboardingProvider;
  providerAccountId: string;
  providerLocationIds: string[];
  accountName: string;
  email: string;
  status: "pending";
  createdAt: string;
  updatedAt: string;
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
  tip_cents?: number;
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
  idempotencyKey?: string;
}

export interface OrderQuote {
  id: string;
  orderId: string;
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  tipCents: number;
  totalCents: number;
  currency: "USD";
  quotedAt: string;
  idempotencyKey?: string;
}

export interface POSPaymentSessionResult {
  ok: boolean;
  status: "redirect_required" | "paid" | "pending_external_confirmation" | "failed";
  redirectUrl?: string | null;
  paymentReference?: string | null;
  totalCents?: number;
  currency?: "USD";
  message: string;
  raw: Record<string, unknown>;
}

export interface POSOrderSubmission {
  id: string;
  orderId: string;
  provider: POSProvider;
  status: "pending" | "submitted" | "accepted" | "failed";
  externalOrderId?: string;
  response: Record<string, unknown>;
  payloadSnapshot?: Record<string, unknown>;
  attemptCount?: number;
  submittedAt: string;
}

export interface StatusEvent {
  id: string;
  orderId: string;
  status: AgentOrderStatus;
  message: string;
  createdAt: string;
  source?: "manager" | "agent" | "system" | "provider";
  provider?: POSProvider;
  providerEventId?: string;
  externalStatus?: string;
  rawEventRef?: string;
}

export interface AgentOrderRecord {
  id: string;
  restaurantId: string;
  agentId: string;
  agentName?: string;
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
  splitGroupId?: string;
  splitGroupIndex?: number;
  splitGroupSize?: number;
  groupedOrderIds?: string[];
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

export type IdempotencyScope = "validate" | "quote" | "submit";

export interface IdempotencyRecord {
  id: string;
  scope: IdempotencyScope;
  restaurantId: string;
  agentId: string;
  idempotencyKey: string;
  requestHash: string;
  status: "pending" | "completed" | "failed";
  orderId?: string;
  response?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetryAttempt {
  id: string;
  orderId?: string;
  stage: "quote" | "pos_submit" | "status_poll";
  attemptNumber: number;
  status: "pending" | "succeeded" | "failed";
  errorMessage?: string;
  payloadSnapshot?: Record<string, unknown>;
  responseSnapshot?: Record<string, unknown>;
  createdAt: string;
}

export interface EventIngestionRecord {
  id: string;
  provider: "toast" | "deliverect";
  eventType: string;
  externalEventId?: string;
  payloadHash?: string;
  orderId?: string;
  status: "received" | "processed" | "failed" | "ignored";
  payload: Record<string, unknown>;
  createdAt: string;
  processedAt?: string;
}

export interface OrderTimelineEvent {
  id: string;
  kind: "status" | "validation" | "quote" | "submission" | "retry" | "audit";
  title: string;
  message: string;
  createdAt: string;
  status?: string;
  details?: Record<string, unknown>;
}

export interface OrderDiagnostics {
  rawOrderIntent: CanonicalOrderIntent;
  latestValidation?: OrderValidationResult;
  latestQuote?: OrderQuote;
  latestSubmission?: POSOrderSubmission;
  mappedPayload?: Record<string, unknown>;
  retries: RetryAttempt[];
}

export interface OperationalDiagnosticsSnapshot {
  failedOrders: Array<{ orderId: string; status: string; updatedAt: string }>;
  stuckOrders: Array<{ orderId: string; status: string; updatedAt: string }>;
  quoteFailures: Array<{ orderId?: string; count: number; lastError?: string }>;
  posFailures: Array<{ orderId?: string; count: number; lastError?: string }>;
  retryQueue: RetryAttempt[];
  mappingIssues: Array<{ menuItemId: string; name: string; mappingStatus: string }>;
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
  tipCents: number;
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
  menuVersion?: CanonicalMenuVersion;
  menuItems: CanonicalMenuItem[];
  modifierGroups: CanonicalModifierGroup[];
  modifiers: CanonicalModifier[];
  menuMappings?: POSMenuMapping[];
}

export interface RestaurantReportingSnapshot {
  metrics: ReportingDailyMetric[];
  topItems: Array<{ name: string; count: number }>;
  topModifiers: Array<{ name: string; count: number }>;
  failureReasons: Array<{ reason: string; count: number }>;
}

export interface ReportingDateRange {
  startDate?: string;
  endDate?: string;
}
