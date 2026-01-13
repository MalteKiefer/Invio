import { Handlers, PageProps } from "$fresh/server.ts";
import { LuCheckCircle, LuLoader2, LuX } from "../../../components/icons.tsx";

interface PaymentResult {
  success: boolean;
  status?: string;
  paymentId?: string;
  invoiceId?: string;
  amount?: number;
  currency?: string;
  error?: string;
  details?: string;
}

interface Data {
  result: PaymentResult | null;
  loading: boolean;
  orderId: string | null;
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return ctx.render({
        result: { success: false, error: "Missing payment token" },
        loading: false,
        orderId: null,
      });
    }

    try {
      // Call the backend to capture the payment
      const backendUrl = Deno.env.get("BACKEND_URL") || "http://localhost:3000";
      const response = await fetch(`${backendUrl}/public/payment/return?token=${token}`);
      const result = await response.json();

      return ctx.render({
        result,
        loading: false,
        orderId: token,
      });
    } catch (error) {
      return ctx.render({
        result: {
          success: false,
          error: "Failed to process payment",
          details: error instanceof Error ? error.message : String(error),
        },
        loading: false,
        orderId: token,
      });
    }
  },
};

export default function PaymentReturn(props: PageProps<Data>) {
  const { result, orderId } = props.data;

  return (
    <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-xl max-w-md w-full">
        <div class="card-body text-center">
          {result?.success ? (
            <>
              <div class="flex justify-center mb-4">
                <div class="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                  <LuCheckCircle size={40} class="text-success" />
                </div>
              </div>
              <h2 class="card-title justify-center text-2xl">Payment Successful</h2>
              <p class="text-base-content/70">
                Your payment has been processed successfully.
              </p>
              {result.amount && result.currency && (
                <div class="stat bg-base-200 rounded-box mt-4">
                  <div class="stat-title">Amount Paid</div>
                  <div class="stat-value text-success">
                    {result.currency} {result.amount.toFixed(2)}
                  </div>
                </div>
              )}
              <div class="card-actions justify-center mt-6">
                <a href="/dashboard" class="btn btn-primary">
                  Go to Dashboard
                </a>
              </div>
            </>
          ) : (
            <>
              <div class="flex justify-center mb-4">
                <div class="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center">
                  <LuX size={40} class="text-error" />
                </div>
              </div>
              <h2 class="card-title justify-center text-2xl">Payment Failed</h2>
              <p class="text-base-content/70">
                {result?.error || "There was an error processing your payment."}
              </p>
              {result?.details && (
                <div class="alert alert-error mt-4">
                  <span class="text-sm">{result.details}</span>
                </div>
              )}
              <div class="card-actions justify-center mt-6">
                <a href="/dashboard" class="btn btn-primary">
                  Return to Dashboard
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
