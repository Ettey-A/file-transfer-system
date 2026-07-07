// Upload file to the central server — visible to all connected clients
import { useCallback, useRef, useState } from "react";
import { CloudUpload, File, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, type TransferJob } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface FileUploadProps {
  onTransferComplete: () => void;
}

export function FileUpload({ onTransferComplete }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<TransferJob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedRef = useRef<number>(0);

  const pollJob = useCallback(
    (jobId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollStartedRef.current = Date.now();

      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStartedRef.current > 120000) {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          setActiveJob(null);
          toast.error("Upload timed out. Check your connection to the central server.");
          return;
        }

        try {
          const job = await api.getTransfer(jobId);
          setActiveJob(job);

          if (job.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploading(false);
            toast.success(`${job.filename} uploaded — available to all clients`);
            setFile(null);
            setActiveJob(null);
            onTransferComplete();
          } else if (job.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setUploading(false);
            toast.error(job.error || "Upload failed");
            setActiveJob(null);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          setActiveJob(null);
          toast.error("Lost connection to server while tracking upload");
        }
      }, 500);
    },
    [onTransferComplete]
  );

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    try {
      await api.health();
      const { job_id } = await api.uploadFile(file);
      toast.info(`Uploading ${file.name} to central server...`);
      pollJob(job_id);
    } catch (e) {
      setUploading(false);
      const msg = e instanceof Error ? e.message : "Failed to start upload";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        toast.error("Cannot reach the server. Run python start.py on the host machine.");
      } else {
        toast.error(msg);
      }
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
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>
              Send a file to the central server — other clients can download it
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

        <Button onClick={handleUpload} disabled={!file || uploading} className="w-full gap-2" size="lg">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading..." : "Upload to Server"}
        </Button>
      </CardContent>
    </Card>
  );
}
