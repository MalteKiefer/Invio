import { useState, useEffect } from "preact/hooks";
import { LuDollarSign, LuLoader2, LuCheck, LuX, LuExternalLink, LuCopy } from "../components/icons.tsx";

interface Props {
  invoiceId: string;
  invoiceTotal: number;
  currency: string;
  status: string;
}

interface PayPalPublicConfig {
  enabled: boolean;
  mode: "sandbox" | "live";
}

export default function PaymentButton(props: Props) {
  const [paypalConfig, setPaypalConfig] = useState<PayPalPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check if PayPal is enabled
  useEffect(() => {
    fetchPayPalConfig();
  }, []);

  const fetchPayPalConfig = async () => {
    try {
      const response = await fetch("/api/public/paypal/config");
      if (response.ok) {
        const config = await response.json();
        setPaypalConfig(config);
      }
    } catch (error) {
      console.error("Failed to fetch PayPal config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePaymentLink = async () => {
    setGenerating(true);
    setError(null);
    setPaymentLink(null);

    try {
      const response = await fetch(`/api/v1/invoices/${props.invoiceId}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentLink(data.paymentLinkUrl);
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to generate payment link" }));
        setError(errorData.error || errorData.details || "Failed to generate payment link");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate payment link");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (paymentLink) {
      try {
        await navigator.clipboard.writeText(paymentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    }
  };

  const handleOpenPayPal = () => {
    if (paymentLink) {
      window.open(paymentLink, "_blank");
    }
  };

  // Don't render if PayPal is not enabled or invoice is already paid
  if (loading) {
    return null;
  }

  if (!paypalConfig?.enabled) {
    return null;
  }

  if (props.status === "paid" || props.status === "draft") {
    return null;
  }

  return (
    <div class="space-y-2">
      {!paymentLink ? (
        <button
          type="button"
          class="btn btn-sm btn-outline"
          onClick={handleGeneratePaymentLink}
          disabled={generating}
          title="Generate PayPal payment link"
        >
          {generating ? (
            <LuLoader2 size={16} class="animate-spin" />
          ) : (
            <LuDollarSign size={16} />
          )}
          Request Payment
        </button>
      ) : (
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            onClick={handleOpenPayPal}
          >
            <LuExternalLink size={16} />
            Pay with PayPal
          </button>
          <button
            type="button"
            class="btn btn-sm btn-ghost"
            onClick={handleCopyLink}
            title="Copy payment link"
          >
            {copied ? <LuCheck size={16} /> : <LuCopy size={16} />}
          </button>
        </div>
      )}

      {paypalConfig?.mode === "sandbox" && (
        <div class="text-xs text-warning">
          Sandbox mode - payments are not real
        </div>
      )}

      {error && (
        <div class="text-xs text-error flex items-center gap-1">
          <LuX size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
