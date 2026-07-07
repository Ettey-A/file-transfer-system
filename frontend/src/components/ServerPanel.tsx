import { useCallback, useState } from "react";
import { Play, Square, Server, Wifi, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, type SystemStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ServerPanelProps {
  status: SystemStatus | null;
  apiOnline: boolean;
  onRefresh: () => void;
}

export function ServerPanel({ status, apiOnline, onRefresh }: ServerPanelProps) {
  const [loading, setLoading] = useState(false);

  const handleStart = useCallback(async () => {
    if (!apiOnline) {
      toast.error("Run python start.py first to launch the API server");
      return;
    }

    setLoading(true);
    try {
      const res = await api.startServer();
      if (res.running) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start server");
      onRefresh();
    } finally {
      setLoading(false);
    }
  }, [apiOnline, onRefresh]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.stopServer();
      toast.info(res.message);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stop server");
      onRefresh();
    } finally {
      setLoading(false);
    }
  }, [onRefresh]);

  const server = status?.server;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>TCP Receiver</CardTitle>
            <CardDescription>
              Start the TCP server on this PC only — each computer controls its own receiver
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!apiOnline && (
          <p className="text-xs text-muted-foreground text-center">
            API offline — double-click <strong>start.bat</strong> or run{" "}
            <code className="rounded bg-muted px-1">python start.py</code>
          </p>
        )}

        {status && server ? (
          <>
            <div className="rounded-lg border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Controlling <strong className="text-foreground font-mono">{status.local_ip}</strong> —
              start/stop only affects this connected PC.
            </div>
            {server.running && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">This PC&apos;s IP address</p>
                    <p className="text-lg font-mono font-semibold text-primary">{status.local_ip}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Senders on your network should use this IP on port {server.port}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(status.local_ip);
                      toast.success("IP copied to clipboard");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">TCP Server</span>
                    <Badge variant={server.running ? "success" : "secondary"}>
                      {server.running ? "Running" : "Stopped"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Port {server.port}</p>
                  {server.running && (
                    <p className="text-sm font-mono font-medium text-primary">
                      {status.local_ip}:{server.port}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={loading || server.running}
                    className="gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStop}
                    disabled={loading || !server.running}
                    className="gap-1.5"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </Button>
                </div>
              </div>
            </div>

            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4" />
              <span>
                Active: <strong className="text-foreground">{status.active_transfers}</strong>
                {" · "}
                Received: <strong className="text-foreground">{status.stats?.received_total ?? 0}</strong>
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={server.save_dir}>
              Save directory: {server.save_dir}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading server status...</p>
        )}
      </CardContent>
    </Card>
  );
}
