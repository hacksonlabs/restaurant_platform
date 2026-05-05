import type {
  ConnectionTestResult,
  POSConnection,
  POSContext,
  POSDiagnosticsResult,
  POSOrderStatusResult,
  POSProvider,
  POSSubmissionResult,
  MenuSyncResult,
  OrderQuoteResult,
  OrderValidationResult,
  CanonicalOrderIntent,
} from "../../shared/types";

export interface POSAdapter {
  provider: POSProvider;
  testConnection(connection: POSConnection): Promise<ConnectionTestResult>;
  syncMenu(connection: POSConnection, context: POSContext): Promise<MenuSyncResult>;
  validateOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderValidationResult>;
  quoteOrder(order: CanonicalOrderIntent, context: POSContext): Promise<OrderQuoteResult>;
  submitOrder(
    order: CanonicalOrderIntent,
    quote: OrderQuoteResult,
    context: POSContext,
  ): Promise<POSSubmissionResult>;
  getOrderStatus(posOrderId: string, context: POSContext): Promise<POSOrderStatusResult>;
  diagnose?(connection: POSConnection, context: POSContext): Promise<POSDiagnosticsResult>;
  cancelOrder?(posOrderId: string, context: POSContext): Promise<{ ok: boolean; message: string }>;
}
