import { Handlers, PageProps } from "$fresh/server.ts";
import { LuX } from "../../../components/icons.tsx";

interface Data {
  orderId: string | null;
}

export const handler: Handlers<Data> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // Optionally notify backend about cancellation
    if (token) {
      try {
        const backendUrl = Deno.env.get("BACKEND_URL") || "http://localhost:3000";
        await fetch(`${backendUrl}/public/payment/cancel?token=${token}`);
      } catch (error) {
        console.error("Failed to notify backend about cancellation:", error);
      }
    }

    return ctx.render({ orderId: token });
  },
};

export default function PaymentCancel(props: PageProps<Data>) {
  return (
    <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-xl max-w-md w-full">
        <div class="card-body text-center">
          <div class="flex justify-center mb-4">
            <div class="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center">
              <LuX size={40} class="text-warning" />
            </div>
          </div>
          <h2 class="card-title justify-center text-2xl">Payment Cancelled</h2>
          <p class="text-base-content/70">
            Your payment was cancelled. No charges have been made.
          </p>
          <div class="card-actions justify-center mt-6">
            <a href="/dashboard" class="btn btn-primary">
              Return to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
