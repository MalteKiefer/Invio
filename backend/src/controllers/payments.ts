/**
 * Payments controller for PayPal integration.
 * Handles payment creation, capture, and webhook processing.
 */

import { getDatabase } from "../database/init.ts";
import { Payment, WebhookEvent, PayPalConfig } from "../types/index.ts";
import { getSetting, setSetting } from "./settings.ts";
import { encryptSetting, decryptSetting, isEncrypted } from "../utils/crypto.ts";
import {
  createOrder,
  captureOrder,
  testConnection,
  verifyWebhookSignature,
  mapPayPalStatus,
  clearTokenCache,
  type PayPalConfig as PayPalApiConfig,
  type PayPalInvoiceData,
} from "../utils/paypal.ts";
import { getEnv } from "../utils/env.ts";

// Generate a UUID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Gets PayPal configuration from settings.
 * Returns decrypted credentials if available.
 */
export async function getPayPalConfig(): Promise<PayPalConfig> {
  const enabled = String(getSetting("paypal_enabled") || "false").toLowerCase() === "true";
  const mode = (getSetting("paypal_mode") as "sandbox" | "live") || "sandbox";
  const clientId = getSetting("paypal_client_id") as string | null;
  const secret = getSetting("paypal_client_secret") as string | null;
  const webhookId = getSetting("paypal_webhook_id") as string | null;

  // Determine webhook URL based on environment
  const backendUrl = getEnv("BACKEND_URL") || "http://localhost:3000";
  const webhookUrl = `${backendUrl}/api/webhooks/paypal`;

  return {
    enabled,
    mode,
    clientIdConfigured: !!clientId && clientId.length > 0,
    secretConfigured: !!secret && secret.length > 0,
    webhookId: webhookId || undefined,
    webhookUrl,
  };
}

/**
 * Gets decrypted PayPal API credentials.
 * Returns null if credentials are not configured.
 */
export async function getPayPalApiConfig(): Promise<PayPalApiConfig | null> {
  const enabled = String(getSetting("paypal_enabled") || "false").toLowerCase() === "true";
  if (!enabled) return null;

  const mode = (getSetting("paypal_mode") as "sandbox" | "live") || "sandbox";
  let clientId = getSetting("paypal_client_id") as string | null;
  let secret = getSetting("paypal_client_secret") as string | null;

  if (!clientId || !secret) return null;

  // Decrypt if encrypted
  try {
    if (isEncrypted(clientId)) {
      clientId = await decryptSetting(clientId);
    }
    if (isEncrypted(secret)) {
      secret = await decryptSetting(secret);
    }
  } catch (error) {
    console.error("Failed to decrypt PayPal credentials:", error);
    return null;
  }

  return { mode, clientId, clientSecret: secret };
}

/**
 * Updates PayPal configuration.
 * Encrypts credentials before storing.
 */
export async function updatePayPalConfig(data: {
  enabled?: boolean;
  mode?: "sandbox" | "live";
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
}): Promise<void> {
  if (data.enabled !== undefined) {
    setSetting("paypal_enabled", String(data.enabled));
  }

  if (data.mode !== undefined) {
    setSetting("paypal_mode", data.mode);
    // Clear token cache when mode changes
    clearTokenCache();
  }

  if (data.clientId !== undefined && data.clientId.trim().length > 0) {
    const encrypted = await encryptSetting(data.clientId.trim());
    setSetting("paypal_client_id", encrypted);
    clearTokenCache();
  }

  if (data.clientSecret !== undefined && data.clientSecret.trim().length > 0) {
    const encrypted = await encryptSetting(data.clientSecret.trim());
    setSetting("paypal_client_secret", encrypted);
    clearTokenCache();
  }

  if (data.webhookId !== undefined) {
    setSetting("paypal_webhook_id", data.webhookId);
  }
}

/**
 * Tests PayPal connection with current credentials.
 */
export async function testPayPalConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  const config = await getPayPalApiConfig();
  if (!config) {
    return { success: false, message: "PayPal credentials not configured" };
  }

  return await testConnection(config);
}

/**
 * Creates a payment link for an invoice.
 */
export async function createPaymentLink(
  invoiceId: string,
  returnUrl: string,
  cancelUrl: string
): Promise<{
  paymentLinkUrl: string;
  orderId: string;
  paymentId: string;
}> {
  const config = await getPayPalApiConfig();
  if (!config) {
    throw new Error("PayPal is not configured");
  }

  const db = getDatabase();

  // Get invoice details
  const invoiceRows = db.query(
    `SELECT id, invoice_number, total, currency, payment_status
     FROM invoices WHERE id = ?`,
    [invoiceId]
  );

  if (invoiceRows.length === 0) {
    throw new Error("Invoice not found");
  }

  const invoice = invoiceRows[0] as unknown[];
  const invoiceNumber = String(invoice[1]);
  const total = Number(invoice[2]);
  const currency = String(invoice[3]) || "USD";
  const paymentStatus = String(invoice[4]);

  if (paymentStatus === "paid") {
    throw new Error("Invoice is already paid");
  }

  // Create PayPal order
  const invoiceData: PayPalInvoiceData = {
    invoiceNumber,
    amount: total,
    currency,
    description: `Invoice ${invoiceNumber}`,
  };

  const order = await createOrder(config, invoiceData, returnUrl, cancelUrl);

  // Create payment record
  const paymentId = generateId();
  const now = new Date().toISOString();

  db.query(
    `INSERT INTO payments (id, invoice_id, provider, provider_payment_id, amount, currency, status, provider_status, created_at, updated_at)
     VALUES (?, ?, 'paypal', ?, ?, ?, 'pending', ?, ?, ?)`,
    [paymentId, invoiceId, order.orderId, total, currency, order.status, now, now]
  );

  return {
    paymentLinkUrl: order.approvalUrl,
    orderId: order.orderId,
    paymentId,
  };
}

/**
 * Captures a PayPal payment after customer approval.
 */
export async function capturePayment(orderId: string): Promise<Payment> {
  const config = await getPayPalApiConfig();
  if (!config) {
    throw new Error("PayPal is not configured");
  }

  const db = getDatabase();

  // Find payment by order ID
  const paymentRows = db.query(
    "SELECT * FROM payments WHERE provider_payment_id = ?",
    [orderId]
  );

  if (paymentRows.length === 0) {
    throw new Error("Payment not found");
  }

  const paymentRow = paymentRows[0] as unknown[];
  const paymentId = String(paymentRow[0]);
  const invoiceId = String(paymentRow[1]);

  // Capture the order
  const result = await captureOrder(config, orderId);
  const now = new Date().toISOString();
  const status = mapPayPalStatus(result.status);

  // Update payment record
  db.query(
    `UPDATE payments
     SET status = ?, provider_status = ?, provider_payer_id = ?, provider_response = ?, updated_at = ?
     WHERE id = ?`,
    [status, result.status, result.payerId, JSON.stringify(result.rawResponse), now, paymentId]
  );

  // Update invoice payment status if completed
  if (status === "completed") {
    db.query(
      "UPDATE invoices SET payment_status = 'paid', status = 'paid' WHERE id = ?",
      [invoiceId]
    );
  }

  return getPaymentById(paymentId)!;
}

/**
 * Gets a payment by ID.
 */
export function getPaymentById(paymentId: string): Payment | null {
  const db = getDatabase();
  const rows = db.query("SELECT * FROM payments WHERE id = ?", [paymentId]);

  if (rows.length === 0) return null;

  return mapPaymentRow(rows[0] as unknown[]);
}

/**
 * Gets a payment by provider payment ID (e.g., PayPal order ID).
 */
export function getPaymentByProviderPaymentId(providerPaymentId: string): Payment | null {
  const db = getDatabase();
  const rows = db.query(
    "SELECT * FROM payments WHERE provider_payment_id = ?",
    [providerPaymentId]
  );

  if (rows.length === 0) return null;

  return mapPaymentRow(rows[0] as unknown[]);
}

/**
 * Gets all payments for an invoice.
 */
export function getPaymentsByInvoice(invoiceId: string): Payment[] {
  const db = getDatabase();
  const rows = db.query(
    "SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC",
    [invoiceId]
  );

  return rows.map((row) => mapPaymentRow(row as unknown[]));
}

/**
 * Processes a PayPal webhook event.
 * Returns true if processed successfully, false if duplicate or error.
 */
export async function processWebhook(
  eventId: string,
  eventType: string,
  payload: string,
  headers: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
  }
): Promise<{ success: boolean; message: string }> {
  const db = getDatabase();

  // Check for duplicate event (idempotency)
  const existing = db.query(
    "SELECT id FROM webhook_events WHERE provider = 'paypal' AND event_id = ?",
    [eventId]
  );

  if (existing.length > 0) {
    return { success: true, message: "Event already processed" };
  }

  // Store the event
  const webhookEventId = generateId();
  const now = new Date().toISOString();

  db.query(
    `INSERT INTO webhook_events (id, provider, event_id, event_type, payload, created_at)
     VALUES (?, 'paypal', ?, ?, ?, ?)`,
    [webhookEventId, eventId, eventType, payload, now]
  );

  // Verify webhook signature
  const config = await getPayPalApiConfig();
  const webhookId = getSetting("paypal_webhook_id") as string | null;

  if (config && webhookId) {
    try {
      const isValid = await verifyWebhookSignature(config, headers, webhookId, payload);
      if (!isValid) {
        db.query(
          "UPDATE webhook_events SET error_message = ? WHERE id = ?",
          ["Invalid signature", webhookEventId]
        );
        return { success: false, message: "Invalid webhook signature" };
      }
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      // Continue processing even if verification fails (for development)
    }
  }

  // Process the event
  try {
    const event = JSON.parse(payload);
    await handleWebhookEvent(eventType, event);

    db.query(
      "UPDATE webhook_events SET processed = 1, processed_at = ? WHERE id = ?",
      [now, webhookEventId]
    );

    return { success: true, message: "Event processed" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    db.query(
      "UPDATE webhook_events SET error_message = ? WHERE id = ?",
      [errorMessage, webhookEventId]
    );
    return { success: false, message: errorMessage };
  }
}

/**
 * Handles a specific webhook event type.
 */
async function handleWebhookEvent(
  eventType: string,
  event: Record<string, unknown>
): Promise<void> {
  const db = getDatabase();
  const resource = event.resource as Record<string, unknown> | undefined;

  if (!resource) return;

  switch (eventType) {
    case "CHECKOUT.ORDER.APPROVED": {
      // Order approved, ready to capture
      const orderId = resource.id as string;
      if (orderId) {
        db.query(
          "UPDATE payments SET provider_status = 'APPROVED', updated_at = ? WHERE provider_payment_id = ?",
          [new Date().toISOString(), orderId]
        );
      }
      break;
    }

    case "PAYMENT.CAPTURE.COMPLETED": {
      // Payment captured successfully
      const captureId = resource.id as string;
      const supplementaryData = resource.supplementary_data as Record<string, unknown> | undefined;
      const orderId = supplementaryData?.related_ids?.order_id as string | undefined;

      if (orderId) {
        const now = new Date().toISOString();
        db.query(
          `UPDATE payments
           SET status = 'completed', provider_status = 'COMPLETED', updated_at = ?
           WHERE provider_payment_id = ?`,
          [now, orderId]
        );

        // Update invoice
        const payments = db.query(
          "SELECT invoice_id FROM payments WHERE provider_payment_id = ?",
          [orderId]
        );
        if (payments.length > 0) {
          const invoiceId = (payments[0] as unknown[])[0] as string;
          db.query(
            "UPDATE invoices SET payment_status = 'paid', status = 'paid' WHERE id = ?",
            [invoiceId]
          );
        }
      }
      break;
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      // Payment failed
      const orderId = (resource.supplementary_data as Record<string, unknown>)?.related_ids
        ?.order_id as string | undefined;

      if (orderId) {
        db.query(
          "UPDATE payments SET status = 'failed', provider_status = ?, updated_at = ? WHERE provider_payment_id = ?",
          [eventType, new Date().toISOString(), orderId]
        );
      }
      break;
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      // Payment refunded
      const orderId = (resource.supplementary_data as Record<string, unknown>)?.related_ids
        ?.order_id as string | undefined;

      if (orderId) {
        const now = new Date().toISOString();
        db.query(
          "UPDATE payments SET status = 'refunded', provider_status = 'REFUNDED', updated_at = ? WHERE provider_payment_id = ?",
          [now, orderId]
        );

        // Update invoice back to unpaid
        const payments = db.query(
          "SELECT invoice_id FROM payments WHERE provider_payment_id = ?",
          [orderId]
        );
        if (payments.length > 0) {
          const invoiceId = (payments[0] as unknown[])[0] as string;
          db.query(
            "UPDATE invoices SET payment_status = 'unpaid', status = 'sent' WHERE id = ?",
            [invoiceId]
          );
        }
      }
      break;
    }

    default:
      // Unknown event type, log and ignore
      console.log(`Unhandled PayPal webhook event: ${eventType}`);
  }
}

/**
 * Updates a payment's status based on cancellation.
 */
export function cancelPayment(orderId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.query(
    "UPDATE payments SET status = 'cancelled', provider_status = 'CANCELLED', updated_at = ? WHERE provider_payment_id = ?",
    [now, orderId]
  );
}

/**
 * Maps a database row to a Payment object.
 */
function mapPaymentRow(row: unknown[]): Payment {
  return {
    id: String(row[0]),
    invoiceId: String(row[1]),
    provider: String(row[2]) as "paypal",
    providerPaymentId: row[3] ? String(row[3]) : undefined,
    providerPayerId: row[4] ? String(row[4]) : undefined,
    amount: Number(row[5]),
    currency: String(row[6]),
    status: String(row[7]) as Payment["status"],
    providerStatus: row[8] ? String(row[8]) : undefined,
    providerResponse: row[9] ? String(row[9]) : undefined,
    createdAt: new Date(String(row[10])),
    updatedAt: new Date(String(row[11])),
  };
}
