/** Lists files on the connected transfer server — works on local and hosted UI. */
import { useState } from "react";
import { Download, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, type ReceivedFile } from "@/lib/api";
import { usesDirectNgrok } from "@/lib/config";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ReceivedFilesProps {
  files: ReceivedFile[];
  directory: string;
  onRefresh: () => void;
  loading: boolean;
}

export function ReceivedFiles({ files, directory, onRefresh, loading }: ReceivedFilesProps) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (file: ReceivedFile) => {
    setDownloading(file.name);
    try {
      if (usesDirectNgrok()) {
        const blob = await api.downloadFileBlob(file.name);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        const link = document.createElement("a");
        link.href = api.downloadFile(file.name);
        link.download = file.name;
        link.click();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Received Files
                <Badge variant="secondary">{files.length}</Badge>
              </CardTitle>
              <CardDescription>Files on the connected transfer server</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium text-muted-foreground">No files received yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Send a file to the server — everyone on the same hosted link can download it
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(file.modified)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="secondary">{file.size_formatted}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={downloading === file.name}
                    onClick={() => handleDownload(file)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 truncate text-xs text-muted-foreground" title={directory}>
          Directory: {directory}
        </p>
      </CardContent>
    </Card>
  );
}
