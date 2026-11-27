/**
 * SafePay SDK Type Contracts
 *
 * This file defines TypeScript interfaces for the SafePay SDK based on official documentation:
 * https://docs.safepay.com.pk
 *
 * These are contract assumptions to be verified against the actual SafePay SDK before
 * implementing payment operations. If actual SDK interfaces differ, update this file accordingly.
 *
 * VERIFICATION STATUS: Pending verification against SafePay SDK v1.x
 */

/**
 * SafePay CheckoutClient - Main client for creating checkout sessions and verifying webhooks
 */
export interface CheckoutClient {
  /**
   * Create a new checkout session for a payment
   * @param request - Checkout session request with amount, currency, description, etc.
   * @returns Promise resolving to checkout session response with checkoutUrl
   */
  createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse>;

  /**
   * Verify webhook signature using HMAC-SHA256
   * @param payload - Raw webhook payload (JSON stringified)
   * @param signature - HMAC-SHA256 signature from X-Safepay-Signature header
   * @param secret - Webhook secret from environment (SAFEPAY_WEBHOOK_SECRET)
   * @returns true if signature is valid, false otherwise
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
}

/**
 * Request to create a checkout session
 */
export interface CreateCheckoutSessionRequest {
  /** Amount in minor units (paisa). Must be an integer. */
  amount: number;

  /** ISO 4217 currency code. Must be "PKR" for Pakistan operations. */
  currency: string;

  /** Description of the payment (plan name, purpose) */
  description: string;

  /** Unique key to prevent duplicate checkout sessions. Used for idempotency. */
  idempotencyKey: string;

  /** Email address of the customer */
  customerEmail?: string;

  /** Name of the customer */
  customerName?: string;

  /** Metadata passed through to webhook (max 10 fields recommended) */
  metadata?: Record<string, string>;

  /** URL to redirect after successful payment */
  successUrl?: string;

  /** URL to redirect after failed payment */
  cancelUrl?: string;

  /** Webhook URL to receive payment events */
  webhookUrl?: string;
}

/**
 * Response from creating a checkout session
 */
export interface CreateCheckoutSessionResponse {
  /** Unique identifier for this checkout session, assigned by SafePay */
  sessionId: string;

  /** URL to redirect customer for payment */
  checkoutUrl: string;

  /** Payment ID associated with this session */
  paymentId?: string;

  /** Session expiry timestamp (ISO 8601) */
  expiresAt?: string;

  /** Additional metadata echoed back */
  metadata?: Record<string, string>;
}

/**
 * Webhook event payload received from SafePay
 *
 * FIELD NAMING ASSUMPTIONS:
 * - Event ID field: "id" or "eventId" (to be verified)
 * - Event type field: "type" or "eventType" (to be verified)
 * - Payment ID field: "paymentId" or "payment_id" (to be verified)
 */
export interface SafePayWebhookPayload {
  /** Unique identifier for this webhook event */
  id: string;

  /** Event type: payment.success, payment.failed, refund.success, etc. */
  type: string;

  /** Timestamp when event occurred (ISO 8601) */
  timestamp?: string;

  /** Payment-specific data */
  payment?: SafePayWebhookPayment;

  /** Refund-specific data (if refund-related event) */
  refund?: SafePayWebhookRefund;

  /** Raw metadata from checkout request */
  metadata?: Record<string, string>;
}

/**
 * Payment information in webhook payload
 */
export interface SafePayWebhookPayment {
  /** Unique payment ID assigned by SafePay */
  id: string;

  /** Session ID from checkout */
  sessionId?: string;

  /** Amount in minor units (paisa) */
  amount: number;

  /** Currency code */
  currency: string;

  /** Payment status: succeeded, failed, pending, etc. */
  status: string;

  /** Customer email */
  customerEmail?: string;

  /** Customer name */
  customerName?: string;

  /** Metadata from checkout request */
  metadata?: Record<string, string>;

  /** Timestamp when payment was processed */
  paidAt?: string;

  /** Error message if payment failed */
  errorMessage?: string;

  /** Error code if payment failed */
  errorCode?: string;
}

/**
 * Refund information in webhook payload
 */
export interface SafePayWebhookRefund {
  /** Unique refund ID assigned by SafePay */
  id: string;

  /** Original payment ID being refunded */
  paymentId: string;

  /** Refund amount in minor units (paisa) */
  amount: number;

  /** Refund status: succeeded, pending, failed, etc. */
  status: string;

  /** Reason for refund */
  reason?: string;

  /** Timestamp when refund was processed */
  processedAt?: string;

  /** Error message if refund failed */
  errorMessage?: string;
}

/**
 * SafePay SDK initialization options
 */
export interface SafePayInitOptions {
  /** API key for authentication */
  apiKey: string;

  /** Environment: sandbox or production */
  environment: 'sandbox' | 'production';

  /** Optional timeout for API requests (milliseconds) */
  timeout?: number;

  /** Optional custom base URL */
  baseUrl?: string;
}

/**
 * Error response from SafePay API
 */
export interface SafePayErrorResponse {
  /** Error code: INVALID_REQUEST, UNAUTHORIZED, NOT_FOUND, CONFLICT, etc. */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Additional error details */
  details?: Record<string, any>;
}
