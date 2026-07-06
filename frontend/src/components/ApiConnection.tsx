import { useState } from "react";
import { Link2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getApiBase, isHostedDeployment, setApiBase } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApiConnectionProps {
  onConnected: () => void;
}

export function ApiConnection({ onConnected }: ApiConnectionProps) {
  const [url, setUrl] = useState(() => getApiBase());
  const [saving, setSaving] = useState(false);
  const hosted = isHostedDeployment();

  const handleSave = async () => {
    if (!url.trim()) {
      toast.error("Enter your Python API URL");
      return;
    }
    setSaving(true);
    setApiBase(url);
    try {
      await api.health();
      toast.success("Connected to API server");
      onConnected();
    } catch {
      toast.error("Could not reach API — check URL and that python start.py is running");
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
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {hosted ? "Connect to your Python backend" : "API server offline"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hosted
                ? "The UI is on Vercel. Run python start.py on your PC, expose port 8001 (e.g. ngrok), then paste the API URL below."
                : "Run python start.py or start.bat on the machine running the transfer servers."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="api-url" className="text-xs">
                API URL
              </Label>
              <Input
                id="api-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-tunnel.ngrok.io/api"
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5 shrink-0">
              <Save className="h-4 w-4" />
              {saving ? "Connecting..." : "Connect"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: <code className="rounded bg-muted px-1">https://abc.ngrok-free.app/api</code>
          </p>
        </div>
      </div>
    </div>
  );
}
