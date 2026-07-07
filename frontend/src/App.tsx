// Main dashboard: polls API, shows receiver + sender panels
import { useCallback, useEffect, useState } from "react";
import { HardDrive, Monitor, Shield, Zap } from "lucide-react";
import { api, type ReceivedFile, type SystemStatus, type TransferJob } from "@/lib/api";
import { ApiConnection } from "@/components/ApiConnection";
import { FileUpload } from "@/components/FileUpload";
import { ReceivedFiles } from "@/components/ReceivedFiles";
import { ServerPanel } from "@/components/ServerPanel";
import { TransferHistory } from "@/components/TransferHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isHostedUI, needsBackendSetup } from "@/lib/config";

export default function App() {
  // --- State from API ---
  const [status, setStatus] = useState<SystemStatus | null>(null); // GET /api/status
  const [files, setFiles] = useState<ReceivedFile[]>([]);         // GET /api/files
  const [directory, setDirectory] = useState("");                   // Save folder path
  const [transfers, setTransfers] = useState<TransferJob[]>([]);    // GET /api/transfers
  const [transferStats, setTransferStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    active: 0,
  });
  const [receivedCount, setReceivedCount] = useState(0);
  const [filesLoading, setFilesLoading] = useState(false);

  // --- Connection state ---
  const [apiOnline, setApiOnline] = useState(false);
  const [backendReady, setBackendReady] = useState(() => !needsBackendSetup()); // false on Vercel until ngrok URL set
  const [showConnectionPanel, setShowConnectionPanel] = useState(false);
  const hosted = isHostedUI(); // true on Vercel

  // Fetch server running state + detected IP
  const refreshStatus = useCallback(async () => {
    if (needsBackendSetup()) {
      setApiOnline(false);
      setStatus(null);
      return;
    }
    try {
      const data = await api.getStatus();
      setStatus(data);
      setApiOnline(true);
      setBackendReady(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  // Fetch list of received files on connected PC
  const refreshFiles = useCallback(async () => {
    if (!backendReady) return;
    setFilesLoading(true);
    try {
      const data = await api.listFiles();
      setFiles(data.files);
      setDirectory(data.directory);
      setReceivedCount(data.count);
    } catch {
      /* ignore */
    } finally {
      setFilesLoading(false);
    }
  }, [backendReady]);

  // Fetch outbound send history
  const refreshTransfers = useCallback(async () => {
    if (!backendReady) return;
    try {
      const data = await api.listTransfers();
      setTransfers(data.transfers);
      setTransferStats(data.stats);
      setReceivedCount(data.received_count);
    } catch {
      /* ignore */
    }
  }, [backendReady]);

  const refreshAll = useCallback(() => {
    refreshStatus();
    refreshFiles();
    refreshTransfers();
  }, [refreshStatus, refreshFiles, refreshTransfers]);

  const handleConnected = useCallback(() => {
    setBackendReady(true);
    setShowConnectionPanel(false);
    refreshAll();
  }, [refreshAll]);

  const handleDisconnected = useCallback(() => {
    setBackendReady(false);
    setApiOnline(false);
    setStatus(null);
    setShowConnectionPanel(true);
  }, []);

  // Auto-refresh: faster when TCP receiver is running
  useEffect(() => {
    if (!backendReady) return;
    refreshAll();
    const receiverActive = status?.server.running;
    const interval = setInterval(refreshAll, receiverActive ? 1500 : 3000);
    return () => clearInterval(interval);
  }, [refreshAll, status?.server.running, backendReady]);

  const showSetup = !backendReady || showConnectionPanel || (!apiOnline && !needsBackendSetup());

  return (
    <div className="min-h-screen">
      {/* Top bar: title + API status + which PC is connected (hosted) */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Transfer System</h1>
              <p className="text-xs text-muted-foreground">TCP File Transfer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hosted && backendReady && status?.detected_ip && (
              <Badge variant="outline" className="gap-1.5 font-mono">
                <Monitor className="h-3 w-3" />
                API PC: {status.detected_ip}
              </Badge>
            )}
            <Badge variant={apiOnline ? "success" : "destructive"}>
              API {apiOnline ? "Online" : "Offline"}
            </Badge>
            {hosted && backendReady && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowConnectionPanel(true)}
              >
                Change PC
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-sm">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span>Concurrent transfers</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-sm">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span>Thread-safe sync</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-sm">
            <HardDrive className="h-3.5 w-3.5 text-emerald-600" />
            <span>Chunked 4KB packets</span>
          </div>
        </div>

        {/* Link browser to this PC's api_server (required on Vercel) */}
        {(showSetup || needsBackendSetup()) && (
          <ApiConnection
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
            forceSetup={needsBackendSetup() || showConnectionPanel}
          />
        )}

        {backendReady && (
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  {/* Left: TCP receiver (server IP + start/stop) + received files */}
                  <ServerPanel status={status} apiOnline={apiOnline} onRefresh={refreshStatus} />
                  <ReceivedFiles
                    files={files}
                    directory={directory}
                    onRefresh={refreshFiles}
                    loading={filesLoading}
                  />
                </div>
                {/* Right: send file (client receiver IP + upload) */}
                <FileUpload
                  serverRunning={status?.server.running}
                  detectedIp={status?.detected_ip}
                  onTransferComplete={refreshAll}
                />
              </div>
            </TabsContent>

            <TabsContent value="history">
              <TransferHistory
                transfers={transfers}
                stats={transferStats}
                receivedCount={receivedCount}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Transfer System — Synchronization: Lock · Semaphore · Condition
      </footer>
    </div>
  );
}
