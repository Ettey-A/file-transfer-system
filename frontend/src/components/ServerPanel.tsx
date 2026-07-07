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

function ServerCard({
  protocol,
  info,
  localIp,
  onStart,
  onStop,
  loading,
}: {
  protocol: "tcp" | "udp";
  info: { running: boolean; port: number; address: string; save_dir: string };
  localIp: string;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
}) {
  const label = protocol.toUpperCase();

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{label} Server</span>
            <Badge variant={info.running ? "success" : "secondary"}>
              {info.running ? "Running" : "Stopped"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Port {info.port}</p>
          {info.running && (
            <p className="text-sm font-mono font-medium text-primary">
              {localIp}:{info.port}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onStart}
            disabled={loading || info.running}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onStop}
            disabled={loading || !info.running}
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ServerPanel({ status, apiOnline, onRefresh }: ServerPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleStart = useCallback(
    async (protocol: "tcp" | "udp") => {
      if (!apiOnline) {
        toast.error("Run python start.py first to launch the API server");
        return;
      }

      setLoading(protocol);
      try {
        const res = await api.startServer(protocol);
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
        setLoading(null);
      }
    },
    [apiOnline, onRefresh]
  );

  const handleStop = useCallback(
    async (protocol: "tcp" | "udp") => {
      setLoading(protocol);
      try {
        const res = await api.stopServer(protocol);
        toast.info(res.message);
        onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to stop server");
        onRefresh();
      } finally {
        setLoading(null);
      }
    },
    [onRefresh]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Receiver Servers</CardTitle>
            <CardDescription>Start TCP or UDP servers to receive incoming files</CardDescription>
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

        {status ? (
          <>
            {(status.servers.tcp.running || status.servers.udp.running) && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">This PC&apos;s IP address</p>
                    <p className="text-lg font-mono font-semibold text-primary">{status.local_ip}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Senders on your network should use this IP
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
            <ServerCard
              protocol="tcp"
              info={status.servers.tcp}
              localIp={status.local_ip}
              onStart={() => handleStart("tcp")}
              onStop={() => handleStop("tcp")}
              loading={loading === "tcp"}
            />
            <ServerCard
              protocol="udp"
              info={status.servers.udp}
              localIp={status.local_ip}
              onStart={() => handleStart("udp")}
              onStop={() => handleStop("udp")}
              loading={loading === "udp"}
            />
            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4" />
              <span>
                Active: <strong className="text-foreground">{status.active_transfers}</strong>
                {" · "}
                Received: <strong className="text-foreground">{status.stats?.received_total ?? 0}</strong>
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={status.servers.tcp.save_dir}>
              Save directory: {status.servers.tcp.save_dir}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading server status...</p>
        )}
      </CardContent>
    </Card>
  );
}
