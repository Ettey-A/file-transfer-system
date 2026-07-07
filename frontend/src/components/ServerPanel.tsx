// Central server status — one server, many clients
import { Copy, Server, Wifi } from "lucide-react";
import { toast } from "sonner";
import { type SystemStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ServerPanelProps {
  status: SystemStatus | null;
  apiOnline: boolean;
}

export function ServerPanel({ status, apiOnline }: ServerPanelProps) {
  const server = status?.server;
  const detectedIp = status?.detected_ip ?? "";
  const serverUrl = server?.address || (detectedIp ? `http://${detectedIp}:${server?.port ?? 8001}` : "");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Central Server</CardTitle>
            <CardDescription>
              All clients connect here — uploads are stored and shared centrally
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!apiOnline && (
          <p className="text-xs text-muted-foreground text-center">
            Server offline — run <code className="rounded bg-muted px-1">python start.py</code> on
            the host machine
          </p>
        )}

        {status && server ? (
          <>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Server address</p>
                  <p className="text-lg font-mono font-semibold text-primary">{serverUrl}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Share this URL with clients so they can upload and download files
                  </p>
                </div>
                {serverUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => {
                      navigator.clipboard.writeText(serverUrl);
                      toast.success("Server URL copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">File server</span>
                    <Badge variant={apiOnline ? "success" : "secondary"}>
                      {apiOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Port {server.port}</p>
                  {detectedIp && (
                    <p className="text-sm font-mono text-primary">Host IP: {detectedIp}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wifi className="h-4 w-4" />
              <span>
                Active uploads:{" "}
                <strong className="text-foreground">{status.active_transfers}</strong>
                {" · "}
                Shared files:{" "}
                <strong className="text-foreground">{status.stats?.received_total ?? 0}</strong>
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={server.save_dir}>
              Storage: {server.save_dir}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading server status...</p>
        )}
      </CardContent>
    </Card>
  );
}
