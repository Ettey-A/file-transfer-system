// Connect browser to the transfer server (Vercel proxy or direct ngrok URL)
import { useState } from "react";
import { Link2, Save, Unplug } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  clearApiBase,
  getApiBase,
  getPersonalBackendUrl,
  isHostedUI,
  needsBackendSetup,
  normalizeApiBase,
  setApiBase,
  usesHostedProxy,
} from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiConnectionProps {
  onConnected: () => void;
  onDisconnected?: () => void;
  forceSetup?: boolean;
}

export function ApiConnection({ onConnected, onDisconnected, forceSetup }: ApiConnectionProps) {
  const hosted = isHostedUI();
  const proxyMode = usesHostedProxy();
  const setupRequired = forceSetup ?? needsBackendSetup();
  const [url, setUrl] = useState(() => getPersonalBackendUrl() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const normalized = normalizeApiBase(url);
    if (!normalized) {
      toast.error("Enter the transfer server URL (ngrok)");
      return;
    }

    setSaving(true);
    setApiBase(normalized);
    try {
      await api.health();
      toast.success(hosted ? "Connected to transfer server" : "Connected to API");
      onConnected();
    } catch {
      clearApiBase();
      toast.error(
        hosted
          ? "Cannot reach server. Run python start.py, ngrok http 8001, then paste that URL."
          : "Cannot reach API. Run python start.py first."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = () => {
    clearApiBase();
    toast.info("Disconnected — using hosted proxy if configured");
    onDisconnected?.();
  };

  const handleUseProxy = async () => {
    setSaving(true);
    clearApiBase();
    try {
      await api.health();
      toast.success("Connected via hosted API proxy");
      onConnected();
    } catch {
      toast.error(
        "Hosted proxy unavailable. Set BACKEND_URL on Vercel to your ngrok URL, or paste ngrok below."
      );
    } finally {
      setSaving(false);
    }
  };

  if (hosted) {
    return (
      <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-medium">
                {setupRequired ? "Connect to the transfer server" : "Server connection"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                To share files on the hosted app, everyone uses the same backend. The server PC
                runs <code className="rounded bg-muted px-1">python start.py</code> and{" "}
                <code className="rounded bg-muted px-1">ngrok http 8001</code>.
              </p>
              {proxyMode && !setupRequired && (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                  Using hosted API proxy — uploads and downloads go through this site.
                </p>
              )}
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>Admin sets <strong>BACKEND_URL</strong> on Vercel to the ngrok URL, or</li>
                <li>Each user pastes the same ngrok URL below</li>
                <li>On the server PC: Start TCP Receiver, then send with receiver IP 127.0.0.1</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="api-url" className="text-xs">
                  Transfer server URL (ngrok)
                </Label>
                <Input
                  id="api-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://abc123.ngrok-free.app"
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5 shrink-0">
                <Save className="h-4 w-4" />
                {saving ? "Connecting..." : "Connect"}
              </Button>
            </div>
            {setupRequired && (
              <Button variant="outline" size="sm" onClick={handleUseProxy} disabled={saving} className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Try hosted proxy
              </Button>
            )}
            {!setupRequired && getPersonalBackendUrl() && (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5">
                <Unplug className="h-3.5 w-3.5" />
                Switch to hosted proxy
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-medium">API server offline</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run <code className="rounded bg-muted px-1">python start.py</code> or double-click{" "}
              <code className="rounded bg-muted px-1">start.bat</code>.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="api-url" className="text-xs">
                Custom API URL (optional)
              </Label>
              <Input
                id="api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={getApiBase() || "/api"}
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5 shrink-0">
              <Save className="h-4 w-4" />
              {saving ? "Connecting..." : "Retry"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
