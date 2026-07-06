import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HardDrive, Shield, Zap } from "lucide-react";
import { Toaster } from "sonner";
import { api, type ReceivedFile, type SystemStatus, type TransferJob } from "@/lib/api";
import { isHostedDeployment } from "@/lib/config";
import { ApiConnection } from "@/components/ApiConnection";
import { FileUpload } from "@/components/FileUpload";
import { ReceivedFiles } from "@/components/ReceivedFiles";
import { ServerPanel } from "@/components/ServerPanel";
import { TransferHistory } from "@/components/TransferHistory";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "./index.css";

function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const [directory, setDirectory] = useState("");
  const [transfers, setTransfers] = useState<TransferJob[]>([]);
  const [transferStats, setTransferStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    active: 0,
  });
  const [receivedCount, setReceivedCount] = useState(0);
  const [filesLoading, setFilesLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const hosted = isHostedDeployment();

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  const refreshFiles = useCallback(async () => {
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
  }, []);

  const refreshTransfers = useCallback(async () => {
    try {
      const data = await api.listTransfers();
      setTransfers(data.transfers);
      setTransferStats(data.stats);
      setReceivedCount(data.received_count);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(() => {
    refreshStatus();
    refreshFiles();
    refreshTransfers();
  }, [refreshStatus, refreshFiles, refreshTransfers]);

  useEffect(() => {
    refreshAll();
    const receiversActive =
      status?.servers.tcp.running || status?.servers.udp.running;
    const interval = setInterval(refreshAll, receiversActive ? 1500 : 3000);
    return () => clearInterval(interval);
  }, [refreshAll, status?.servers.tcp.running, status?.servers.udp.running]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Transfer System</h1>
              <p className="text-xs text-muted-foreground">TCP & UDP File Transfer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hosted && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Vercel
              </Badge>
            )}
            <Badge variant={apiOnline ? "success" : "destructive"}>
              API {apiOnline ? "Online" : "Offline"}
            </Badge>
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

        {!apiOnline && <ApiConnection onConnected={refreshAll} />}

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <ServerPanel status={status} apiOnline={apiOnline} onRefresh={refreshStatus} />
                <ReceivedFiles
                  files={files}
                  directory={directory}
                  onRefresh={refreshFiles}
                  loading={filesLoading}
                />
              </div>
              <FileUpload
                localIp={status?.local_ip}
                serversRunning={
                  status?.servers.tcp.running || status?.servers.udp.running
                }
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
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Transfer System — Synchronization: Lock · Semaphore · Condition
      </footer>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
      <Toaster richColors position="top-right" />
    </StrictMode>
  );
}

export default App;
