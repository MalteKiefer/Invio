import { useState, useEffect } from "preact/hooks";
import { LuCheck, LuX, LuCopy, LuLoader2, LuExternalLink } from "../components/icons.tsx";

interface PayPalConfig {
  enabled: boolean;
  mode: "sandbox" | "live";
  clientIdConfigured: boolean;
  secretConfigured: boolean;
  webhookId?: string;
  webhookUrl: string;
}

interface Props {
  initialConfig?: PayPalConfig;
  demoMode?: boolean;
  authHeader?: string;
}

export default function PayPalIntegration(props: Props) {
  const [config, setConfig] = useState<PayPalConfig>(
    props.initialConfig || {
      enabled: false,
      mode: "sandbox",
      clientIdConfigured: false,
      secretConfigured: false,
      webhookUrl: "",
    }
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch current config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/v1/integrations/paypal", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error("Failed to fetch PayPal config:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    setTestResult(null);

    try {
      const payload: Record<string, unknown> = {
        enabled: config.enabled,
        mode: config.mode,
      };

      // Only include credentials if they were entered
      if (clientId.trim()) {
        payload.clientId = clientId.trim();
      }
      if (clientSecret.trim()) {
        payload.clientSecret = clientSecret.trim();
      }

      const response = await fetch("/api/v1/integrations/paypal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        setClientId("");
        setClientSecret("");
        setSaveResult({ success: true, message: "PayPal credentials updated" });
      } else {
        const error = await response.text();
        setSaveResult({ success: false, message: error || "Failed to save" });
      }
    } catch (error) {
      setSaveResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to save",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/v1/integrations/paypal/test", {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (config.webhookUrl) {
      try {
        await navigator.clipboard.writeText(config.webhookUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
      }
    }
  };

  const isConfigured = config.clientIdConfigured && config.secretConfigured;

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">PayPal Integration</h3>
          <p class="text-sm text-base-content/60">
            Accept payments directly on your invoices via PayPal.
          </p>
        </div>
        <div class="flex items-center gap-2">
          {isConfigured ? (
            <span class="badge badge-success gap-1">
              <LuCheck size={14} />
              Connected
            </span>
          ) : (
            <span class="badge badge-warning gap-1">
              <LuX size={14} />
              Not configured
            </span>
          )}
        </div>
      </div>

      {/* Enable Toggle */}
      <div class="form-control">
        <label class="label cursor-pointer justify-start gap-4">
          <input
            type="checkbox"
            class="toggle toggle-primary"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: (e.target as HTMLInputElement).checked })
            }
            disabled={props.demoMode}
          />
          <span class="label-text font-medium">Enable PayPal payments</span>
        </label>
      </div>

      {/* Mode Selection */}
      <div class="form-control">
        <label class="label">
          <span class="label-text">PayPal Mode</span>
        </label>
        <select
          class="select select-bordered w-full max-w-xs"
          value={config.mode}
          onChange={(e) =>
            setConfig({
              ...config,
              mode: (e.target as HTMLSelectElement).value as "sandbox" | "live",
            })
          }
          disabled={props.demoMode}
        >
          <option value="sandbox">Sandbox (Testing)</option>
          <option value="live">Live (Production)</option>
        </select>
        {config.mode === "sandbox" && (
          <label class="label">
            <span class="label-text-alt text-warning">
              Sandbox mode - payments will not be real
            </span>
          </label>
        )}
      </div>

      {/* Credentials */}
      <div class="card bg-base-200 p-4 space-y-4">
        <h4 class="font-medium">API Credentials</h4>

        <div class="form-control">
          <label class="label">
            <span class="label-text">PayPal Client ID</span>
            {config.clientIdConfigured && (
              <span class="label-text-alt text-success">Configured</span>
            )}
          </label>
          <input
            type="text"
            class="input input-bordered w-full"
            placeholder={
              config.clientIdConfigured
                ? "••••••••••••••••••••"
                : "Enter your PayPal Client ID"
            }
            value={clientId}
            onInput={(e) => setClientId((e.target as HTMLInputElement).value)}
            disabled={props.demoMode}
          />
        </div>

        <div class="form-control">
          <label class="label">
            <span class="label-text">PayPal Client Secret</span>
            {config.secretConfigured && (
              <span class="label-text-alt text-success">Configured</span>
            )}
          </label>
          <input
            type="password"
            class="input input-bordered w-full"
            placeholder={
              config.secretConfigured
                ? "••••••••••••••••••••"
                : "Enter your PayPal Client Secret"
            }
            value={clientSecret}
            onInput={(e) => setClientSecret((e.target as HTMLInputElement).value)}
            disabled={props.demoMode}
          />
        </div>

        <div class="text-sm text-base-content/60">
          <p>
            Get your credentials from the{" "}
            <a
              href="https://developer.paypal.com/dashboard/applications"
              target="_blank"
              rel="noopener noreferrer"
              class="link link-primary"
            >
              PayPal Developer Dashboard
              <LuExternalLink size={12} class="inline ml-1" />
            </a>
          </p>
        </div>
      </div>

      {/* Webhook URL */}
      {config.webhookUrl && (
        <div class="form-control">
          <label class="label">
            <span class="label-text">Webhook URL</span>
          </label>
          <div class="join w-full">
            <input
              type="text"
              class="input input-bordered join-item w-full"
              value={config.webhookUrl}
              readOnly
            />
            <button
              type="button"
              class="btn join-item"
              onClick={handleCopyWebhookUrl}
              title="Copy webhook URL"
            >
              {copied ? <LuCheck size={16} /> : <LuCopy size={16} />}
            </button>
          </div>
          <label class="label">
            <span class="label-text-alt">
              Copy this URL to your PayPal Developer Dashboard to receive payment
              notifications
            </span>
          </label>
        </div>
      )}

      {/* Action Buttons */}
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="btn btn-primary"
          onClick={handleSave}
          disabled={saving || props.demoMode}
        >
          {saving && <LuLoader2 size={16} class="animate-spin" />}
          Save PayPal Settings
        </button>

        <button
          type="button"
          class="btn btn-outline"
          onClick={handleTestConnection}
          disabled={testing || !isConfigured || props.demoMode}
        >
          {testing && <LuLoader2 size={16} class="animate-spin" />}
          Test Connection
        </button>
      </div>

      {/* Results */}
      {saveResult && (
        <div
          class={`alert ${saveResult.success ? "alert-success" : "alert-error"}`}
        >
          {saveResult.success ? <LuCheck size={16} /> : <LuX size={16} />}
          <span>{saveResult.message}</span>
        </div>
      )}

      {testResult && (
        <div
          class={`alert ${testResult.success ? "alert-success" : "alert-error"}`}
        >
          {testResult.success ? <LuCheck size={16} /> : <LuX size={16} />}
          <span>{testResult.message}</span>
        </div>
      )}
    </div>
  );
}
