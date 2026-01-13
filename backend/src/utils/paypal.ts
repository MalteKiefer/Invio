/**
 * PayPal API client for order creation, capture, and webhook verification.
 * Supports both Sandbox and Live environments.
 */

export interface PayPalConfig {
  mode: "sandbox" | "live";
  clientId: string;
  clientSecret: string;
  webhookId?: string;
}

export interface PayPalOrder {
  orderId: string;
  approvalUrl: string;
  status: string;
}

export interface PayPalCaptureResult {
  captureId: string;
  status: string;
  amount: number;
  currency: string;
  payerId: string;
  payerEmail?: string;
  rawResponse: Record<string, unknown>;
}

export interface PayPalInvoiceData {
  invoiceNumber: string;
  amount: number;
  currency: string;
  description?: string;
  customerEmail?: string;
}

// Token cache to avoid unnecessary API calls
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Returns the PayPal API base URL based on mode.
 */
function getBaseUrl(mode: "sandbox" | "live"): string {
  return mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

/**
 * Obtains an OAuth 2.0 access token from PayPal.
 * Caches the token until it expires.
 */
export async function getAccessToken(config: PayPalConfig): Promise<string> {
  // Return cached token if still valid (with 60 second buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const baseUrl = getBaseUrl(config.mode);
  const auth = btoa(`${config.clientId}:${config.clientSecret}`);

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal authentication failed: ${error}`);
  }

  const data = await response.json();
  const expiresIn = (data.expires_in || 3600) * 1000;

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn,
  };

  return cachedToken.token;
}

/**
 * Clears the cached access token.
 * Useful when credentials change or for testing.
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

/**
 * Creates a PayPal order for an invoice.
 * Returns the order ID and approval URL for customer redirect.
 */
export async function createOrder(
  config: PayPalConfig,
  invoice: PayPalInvoiceData,
  returnUrl: string,
  cancelUrl: string
): Promise<PayPalOrder> {
  const baseUrl = getBaseUrl(config.mode);
  const token = await getAccessToken(config);

  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: invoice.invoiceNumber,
        description: invoice.description || `Invoice ${invoice.invoiceNumber}`,
        amount: {
          currency_code: invoice.currency.toUpperCase(),
          value: invoice.amount.toFixed(2),
        },
        invoice_id: invoice.invoiceNumber,
      },
    ],
    application_context: {
      brand_name: "Invio",
      landing_page: "BILLING",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(orderPayload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal order creation failed: ${error}`);
  }

  const data = await response.json();
  const approvalLink = data.links?.find(
    (link: { rel: string; href: string }) => link.rel === "approve"
  );

  if (!approvalLink) {
    throw new Error("PayPal order created but no approval URL found");
  }

  return {
    orderId: data.id,
    approvalUrl: approvalLink.href,
    status: data.status,
  };
}

/**
 * Captures a PayPal order after customer approval.
 * This finalizes the payment and transfers funds.
 */
export async function captureOrder(
  config: PayPalConfig,
  orderId: string
): Promise<PayPalCaptureResult> {
  const baseUrl = getBaseUrl(config.mode);
  const token = await getAccessToken(config);

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal capture failed: ${error}`);
  }

  const data = await response.json();
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];

  if (!capture) {
    throw new Error("PayPal capture succeeded but no capture data found");
  }

  return {
    captureId: capture.id,
    status: capture.status,
    amount: parseFloat(capture.amount?.value || "0"),
    currency: capture.amount?.currency_code || "USD",
    payerId: data.payer?.payer_id || "",
    payerEmail: data.payer?.email_address,
    rawResponse: data,
  };
}

/**
 * Gets details of an existing PayPal order.
 */
export async function getOrderDetails(
  config: PayPalConfig,
  orderId: string
): Promise<Record<string, unknown>> {
  const baseUrl = getBaseUrl(config.mode);
  const token = await getAccessToken(config);

  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal get order failed: ${error}`);
  }

  return await response.json();
}

/**
 * Verifies a PayPal webhook signature.
 * Important for security to ensure webhooks come from PayPal.
 */
export async function verifyWebhookSignature(
  config: PayPalConfig,
  headers: {
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
  },
  webhookId: string,
  body: string
): Promise<boolean> {
  const baseUrl = getBaseUrl(config.mode);
  const token = await getAccessToken(config);

  const verifyPayload = {
    auth_algo: headers.authAlgo,
    cert_url: headers.certUrl,
    transmission_id: headers.transmissionId,
    transmission_sig: headers.transmissionSig,
    transmission_time: headers.transmissionTime,
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  };

  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(verifyPayload),
  });

  if (!response.ok) {
    console.error("PayPal webhook verification request failed");
    return false;
  }

  const data = await response.json();
  return data.verification_status === "SUCCESS";
}

/**
 * Tests PayPal credentials by attempting to get an access token.
 */
export async function testConnection(config: PayPalConfig): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    clearTokenCache();
    await getAccessToken(config);
    return { success: true, message: "Connection successful" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { success: false, message };
  }
}

/**
 * Maps PayPal payment status to internal status.
 */
export function mapPayPalStatus(paypalStatus: string): "pending" | "completed" | "failed" | "cancelled" {
  switch (paypalStatus.toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "APPROVED":
    case "CREATED":
    case "SAVED":
    case "PAYER_ACTION_REQUIRED":
      return "pending";
    case "VOIDED":
      return "cancelled";
    default:
      return "failed";
  }
}
