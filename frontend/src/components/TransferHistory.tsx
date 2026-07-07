/** Outbound send history and session stats from api_server transfer_jobs. */
import type { ElementType } from "react";
import { ArrowRightLeft, CheckCircle2, Clock, Inbox, Send, XCircle } from "lucide-react";
import { type TransferJob, type TransferStats } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface TransferHistoryProps {
  transfers: TransferJob[];
  stats: TransferStats;
  receivedCount: number;
}

function statusVariant(status: TransferJob["status"]) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "failed":
      return "destructive" as const;
    case "uploading":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function StatusIcon({ status }: { status: TransferJob["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Clock className="h-4 w-4 text-amber-600" />;
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: ElementType;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-600"
          : "text-primary";

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
        {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function TransferHistory({ transfers, stats, receivedCount }: TransferHistoryProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Uploads (UI)" value={stats.total} icon={Send} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed" value={stats.failed} icon={XCircle} tone="danger" />
        <StatCard label="In progress" value={stats.active} icon={Clock} tone="warning" />
        <StatCard label="Files received" value={receivedCount} icon={Inbox} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Transfer History</CardTitle>
                <CardDescription>
                  {stats.total} upload{stats.total === 1 ? "" : "s"} via UI · {receivedCount} shared
                  file{receivedCount === 1 ? "" : "s"} on server
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">{transfers.length} recorded</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transfers yet. Send a file from the Dashboard to see history here.
            </p>
          ) : (
            <div className="space-y-3">
              {transfers.map((job) => (
                <div key={job.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <StatusIcon status={job.status} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.host === "central" ? "Central server" : `${job.protocol.toUpperCase()} → ${job.host}:${job.port}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  </div>
                  {job.status === "uploading" && (
                    <Progress value={job.progress} className="mt-2 h-1.5" />
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatBytes(job.filesize)}</span>
                    <span>{formatDate(job.created_at)}</span>
                  </div>
                  {job.error && <p className="mt-1 text-xs text-destructive">{job.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
