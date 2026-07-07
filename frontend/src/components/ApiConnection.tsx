// Connect browser to the central transfer server
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
  const setupRequired = forceSetup ?? needsBackendSetup();
  const [url, setUrl] = useState(() => getPersonalBackendUrl() ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const normalized = normalizeApiBase(url);
    if (!normalized) {
      toast.error("Enter the central server URL");
      return;
    }

    setSaving(true);
    setApiBase(normalized);
    try {
      await api.health();
      toast.success(hosted ? "Connected to central server" : "Connected to server");
      onConnected();
    } catch {
      clearApiBase();
      toast.error(
        hosted
          ? "Cannot reach the server. Ask the host to run python start.py and share their ngrok URL."
          : "Cannot reach server. Run python start.py on the host machine first."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = () => {
    clearApiBase();
    toast.info("Disconnected from central server");
    onDisconnected?.();
  };

  if (hosted) {
    return (
      <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 space-y-3">
            <div>
              <p className="font-medium">
                {setupRequired ? "Connect to the central server" : "Server connection"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                All clients use the same server URL. Uploads go to shared storage and every
                connected client can download them.
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
                <li>
                  Host runs <code className="rounded bg-muted px-1">python start.py</code>
                </li>
                <li>
                  Expose port 8001:{" "}
                  <code className="rounded bg-muted px-1">ngrok http 8001</code>
                </li>
                <li>Every client pastes the same ngrok URL below</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="api-url" className="text-xs">
                  Central server URL
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
            {!setupRequired && getPersonalBackendUrl() && (
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5">
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
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
            <p className="font-medium">Central server offline</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run <code className="rounded bg-muted px-1">python start.py</code> on the host
              machine, or connect to a remote server URL.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="api-url" className="text-xs">
                Server URL (optional — defaults to local)
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
