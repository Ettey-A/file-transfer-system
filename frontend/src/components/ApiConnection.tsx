import { useState } from "react";
import { Link2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getApiBase, isHostedUI, setApiBase } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiConnectionProps {
  onConnected: () => void;
}

export function ApiConnection({ onConnected }: ApiConnectionProps) {
  const hosted = isHostedUI();
  const [url, setUrl] = useState(() => getApiBase());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    if (url.trim() && url.trim() !== "/api") {
      setApiBase(url);
    }
    try {
      await api.health();
      toast.success("Connected to API");
      onConnected();
    } catch {
      toast.error(
        hosted
          ? "Cannot reach API. Set BACKEND_URL in Vercel and run python start.py + ngrok."
          : "Cannot reach API. Run python start.py first."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-medium">API server offline</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hosted ? (
                <>
                  Vercel hosts the UI only. Run <code className="rounded bg-muted px-1">python start.py</code> on
                  your PC, expose port 8001 with ngrok, then set{" "}
                  <strong>BACKEND_URL</strong> in Vercel → Settings → Environment Variables (e.g.{" "}
                  <code className="rounded bg-muted px-1">https://abc.ngrok-free.app</code>) and redeploy.
                </>
              ) : (
                <>
                  Run <code className="rounded bg-muted px-1">python start.py</code> or double-click{" "}
                  <code className="rounded bg-muted px-1">start.bat</code>.
                </>
              )}
            </p>
          </div>
          {!hosted && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="api-url" className="text-xs">
                  Custom API URL (optional)
                </Label>
                <Input
                  id="api-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="/api"
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5 shrink-0">
                <Save className="h-4 w-4" />
                {saving ? "Connecting..." : "Retry"}
              </Button>
            </div>
          )}
          {hosted && (
            <Button onClick={handleSave} disabled={saving} variant="outline" size="sm">
              {saving ? "Checking..." : "Retry connection"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
