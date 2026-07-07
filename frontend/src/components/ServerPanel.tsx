// TCP Receiver panel — SERVER role (user types server IP; start/stop on connected PC)
import { useCallback, useEffect, useState } from "react";
import { Play, Square, Server, Wifi, Copy } from "lucide-react";
import { toast } from "sonner";
import { api, type SystemStatus } from "@/lib/api";
import { getServerIp, setServerIp } from "@/lib/networkConfig";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ServerPanelProps {
  status: SystemStatus | null;
  apiOnline: boolean;
  onRefresh: () => void;
}

export function ServerPanel({ status, apiOnline, onRefresh }: ServerPanelProps) {
  const [loading, setLoading] = useState(false); // Disable buttons during API call
  const [serverIp, setServerIpState] = useState(() => getServerIp()); // User-entered server IP (localStorage)
  const detectedIp = status?.detected_ip ?? ""; // Auto-detected hint from backend

  // Persist server IP whenever user types
  useEffect(() => {
    setServerIp(serverIp);
  }, [serverIp]);

  const handleStart = useCallback(async () => {
    if (!apiOnline) {
      toast.error("Run python start.py first to launch the API server");
      return;
    }

    if (!serverIp.trim()) {
      toast.error("Enter your server IP address first");
      return;
    }

    setLoading(true);
    try {
      const res = await api.startServer(); // POST /api/server/start → tcp_server on this PC
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
  }, [apiOnline, onRefresh, serverIp]);

  const handleStop = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.stopServer(); // POST /api/server/stop → release port 9999
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
  const displayIp = serverIp.trim(); // IP shown to senders (user input, not auto)

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
              Set your server IP and start TCP on this PC — independent from the send panel
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
            {/* User types the IP others use to reach THIS machine as receiver */}
            <div className="space-y-2">
              <Label htmlFor="server-ip">Server IP (share with senders)</Label>
              <Input
                id="server-ip"
                value={serverIp}
                onChange={(e) => setServerIpState(e.target.value)}
                placeholder="e.g. 192.168.1.50"
                className="font-mono"
              />
              {detectedIp && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Detected on this PC: <span className="font-mono">{detectedIp}</span>
                  </span>
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => setServerIpState(detectedIp)}
                  >
                    Use detected
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                This is the IP others use to send files to <strong>this</strong> machine. It is
                separate from the receiver IP in the send panel.
              </p>
            </div>

            {server.running && displayIp && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Your server address</p>
                    <p className="text-lg font-mono font-semibold text-primary">
                      {displayIp}:{server.port}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Give this IP and port to anyone sending files to you
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(`${displayIp}:${server.port}`);
                      toast.success("Server address copied");
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
                  {server.running && displayIp && (
                    <p className="text-sm font-mono font-medium text-primary">
                      Listening — share {displayIp}:{server.port}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={loading || server.running || !displayIp}
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
