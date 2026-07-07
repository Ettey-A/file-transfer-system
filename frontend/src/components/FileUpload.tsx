// Send File panel — CLIENT role (user types destination IP; separate from server IP)
import { useCallback, useEffect, useRef, useState } from "react";
import { CloudUpload, File, Send, X } from "lucide-react";
import { toast } from "sonner";
import { api, type TransferJob } from "@/lib/api";
import { getClientReceiverIp, setClientReceiverIp } from "@/lib/networkConfig";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface FileUploadProps {
  serverRunning?: boolean;
  detectedIp?: string;
  onTransferComplete: () => void;
}

export function FileUpload({ serverRunning, detectedIp, onTransferComplete }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [receiverIp, setReceiverIpState] = useState(() => getClientReceiverIp()); // Destination IP (localStorage)
  const [port, setPort] = useState("9999");
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<TransferJob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef<number>(0);

  // Save client receiver IP as user types
  useEffect(() => {
    setClientReceiverIp(receiverIp);
  }, [receiverIp]);

  // Poll GET /api/transfer/{id} every 500ms until done or 120s timeout
  const pollJob = useCallback(
    (jobId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollStartedRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStartedRef.current > 120000) {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          setActiveJob(null);
          toast.error("Transfer timed out. Check receiver IP and that the TCP server is started.");
          return;
        }

        try {
          const job = await api.getTransfer(jobId);
          setActiveJob(job);

          if (job.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploading(false);
            toast.success(`Sent ${job.filename} successfully`);
            setFile(null);
            setActiveJob(null);
            onTransferComplete();
          } else if (job.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploading(false);
            toast.error(job.error || "Transfer failed");
            setActiveJob(null);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          setActiveJob(null);
          toast.error("Lost connection to API while tracking transfer");
        }
      }, 500);
    },
    [onTransferComplete]
  );

  const handleSend = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    const targetHost = receiverIp.trim();
    if (!targetHost) {
      toast.error("Enter the receiver IP address you are sending to");
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      toast.error("Invalid port number");
      return;
    }

    if (serverRunning === false) {
      toast.warning(
        "No local receiver is running. Only relevant if this PC should receive the file."
      );
    }

    setUploading(true);
    try {
      // POST /api/transfer — backend sends file via TCP to targetHost:portNum
      const { job_id } = await api.transferFile(file, targetHost, portNum);
      toast.info(`Transfer started: ${file.name} → ${targetHost}:${portNum}`);
      pollJob(job_id);
    } catch (e) {
      setUploading(false);
      toast.error(e instanceof Error ? e.message : "Failed to start transfer");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Send File</CardTitle>
            <CardDescription>
              Enter the remote receiver IP — separate from your server IP above
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : file
                ? "border-primary/40 bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={uploading}
          />

          {file ? (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <File className="h-6 w-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <CloudUpload className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Drop your file here</p>
              <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="receiver-ip">Receiver IP (client — where to send)</Label>
            <div className="flex gap-2">
              <Input
                id="receiver-ip"
                value={receiverIp}
                onChange={(e) => setReceiverIpState(e.target.value)}
                placeholder="e.g. 192.168.1.100 or 127.0.0.1"
                disabled={uploading}
                className="font-mono"
              />
              {detectedIp && detectedIp !== receiverIp.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={uploading}
                  onClick={() => setReceiverIpState(detectedIp)}
                >
                  Use detected
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              IP of the machine running the TCP receiver. Defaults to 127.0.0.1 for same-PC tests.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Receiver port</Label>
            <Input
              id="port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="9999"
              disabled={uploading}
              className="font-mono"
            />
          </div>
        </div>

        {activeJob && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{activeJob.filename}</span>
              <Badge variant={activeJob.status === "failed" ? "destructive" : "secondary"}>
                {activeJob.status}
              </Badge>
            </div>
            <Progress value={activeJob.progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {activeJob.progress}% — {formatBytes(activeJob.sent)} / {formatBytes(activeJob.filesize)}
            </p>
          </div>
        )}

        <Button
          onClick={handleSend}
          disabled={!file || uploading || !receiverIp.trim()}
          className="w-full gap-2"
          size="lg"
        >
          <Send className="h-4 w-4" />
          {uploading ? "Transferring..." : "Send File"}
        </Button>
      </CardContent>
    </Card>
  );
}
