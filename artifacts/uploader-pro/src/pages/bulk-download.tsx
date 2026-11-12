import { useState, useEffect, useRef, useCallback } from "react";
import { PageHeading } from "@/components/uploader-shell";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";
import {
  Download,
  Link2,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ClipboardPaste,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = "pending" | "downloading" | "encrypting" | "done" | "error" | "skipped";

type DownloadItem = {
  url: string;
  status: ItemStatus;
  progress: number;
  filename: string;
  bytesReceived: number;
  totalBytes: number | null;
  mediaId?: string;
  error?: string;
};

type Job = {
  id: string;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  createdAt: string;
  progress: number;
  total: number;
  done: number;
  failed: number;
  bytesReceived: number;
  items: DownloadItem[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBytes = (b: number) =>
  b >= 1_073_741_824
    ? `${(b / 1_073_741_824).toFixed(1)} GB`
    : b >= 1_048_576
    ? `${(b / 1_048_576).toFixed(1)} MB`
    : b >= 1024
    ? `${(b / 1024).toFixed(0)} KB`
    : `${b} B`;

const statusColor: Record<ItemStatus, string> = {
  pending: "text-muted-foreground",
  downloading: "text-blue-400",
  encrypting: "text-violet-400",
  done: "text-accent",
  error: "text-destructive",
  skipped: "text-muted-foreground",
};

const statusLabel: Record<ItemStatus, string> = {
  pending: "Queued",
  downloading: "Downloading…",
  encrypting: "Encrypting…",
  done: "Secured",
  error: "Failed",
  skipped: "Skipped",
};

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === "done") return <CheckCircle2 size={14} className="text-accent shrink-0" />;
  if (status === "error") return <AlertCircle size={14} className="text-destructive shrink-0" />;
  if (status === "downloading" || status === "encrypting")
    return <Loader2 size={14} className="animate-spin text-primary shrink-0" />;
  return <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/40" />;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BulkDownloadPage() {
  const { toast } = useToast();

  // URL input list
  const [urlInputs, setUrlInputs] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [pasteFallbackText, setPasteFallbackText] = useState("");
  const pasteFallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (showPasteFallback) pasteFallbackRef.current?.focus();
  }, [showPasteFallback]);

  // Job list (persists across poll intervals)
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch all jobs ────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try {
      const data = await customFetch<Job[]>("/api/bulk-download/jobs");
      if (Array.isArray(data)) setJobs(data);
    } catch {
      // Silently ignore transient errors during polling
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  // Initial load + polling every 1.5 s when any job is active
  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "queued" || j.status === "running"
    );
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => { void fetchJobs(); }, 1500);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobs, fetchJobs]);

  // ── URL input management ──────────────────────────────────────────────────
  const addRow = () => setUrlInputs((prev) => [...prev, ""]);

  const removeRow = (i: number) =>
    setUrlInputs((prev) => prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i));

  const updateRow = (i: number, value: string) =>
    setUrlInputs((prev) => prev.map((v, idx) => (idx === i ? value : v)));

  const applyPastedUrls = (text: string) => {
    const lines = text
      .split(/[\n\r,]+/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      toast({
        title: "No URLs found",
        description: "Paste one or more links first.",
        variant: "destructive",
      });
      return;
    }

    setUrlInputs(lines.length === 1 ? [lines[0], ""] : lines);
    setPasteFallbackText("");
    setShowPasteFallback(false);
  };

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("Clipboard API unavailable");
      }

      const text = await navigator.clipboard.readText();

      if (text.trim()) {
        applyPastedUrls(text);
      } else {
        toast({ title: "Clipboard is empty", description: "Copy your URLs first." });
      }
    } catch {
      setShowPasteFallback(true);
      toast({
        title: "Use your phone's Paste action",
        description: "Long-press the box below and tap Paste.",
      });
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = urlInputs.map((u) => u.trim()).filter(Boolean);
    if (!urls.length) {
      toast({ title: "Add at least one URL", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const job = await customFetch<Job>("/api/bulk-download/jobs", {
        method: "POST",
        body: JSON.stringify({ urls }),
        headers: { "Content-Type": "application/json" },
      });
      if (job?.id) {
        setJobs((prev) => [job, ...prev]);
        setUrlInputs([""]);
        toast({ title: "Download started", description: `${urls.length} URL${urls.length !== 1 ? "s" : ""} queued.` });
      }
    } catch (err) {
      toast({
        title: "Could not start download",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cancel job ────────────────────────────────────────────────────────────
  const cancelJob = async (id: string) => {
    try {
      await customFetch(`/api/bulk-download/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch {
      toast({ title: "Could not cancel job", variant: "destructive" });
    }
  };

  // ── Clear finished ────────────────────────────────────────────────────────
  const clearFinished = async () => {
    try {
      await customFetch("/api/bulk-download/jobs", { method: "DELETE" });
      setJobs((prev) =>
        prev.filter((j) => j.status === "queued" || j.status === "running")
      );
    } catch {
      toast({ title: "Could not clear jobs", variant: "destructive" });
    }
  };

  const hasFinished = jobs.some(
    (j) => j.status === "done" || j.status === "error" || j.status === "cancelled"
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeading
        eyebrow="Bulk downloader"
        title="Fetch & secure from the web."
        description="Paste media URLs — each file is downloaded, immediately encrypted in-memory, and stored. Plaintext never touches disk."
        action={
          jobs.length > 0 ? (
            <button
              onClick={() => void fetchJobs()}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          ) : undefined
        }
      />

      {/* ── URL input form ─────────────────────────────────────────────────── */}
      <section className="mt-7">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">
                  Source URLs
                </p>
                <h2 className="mt-0.5 font-serif text-lg font-bold tracking-tight">
                  Add media links
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void pasteFromClipboard()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary"
              >
                <ClipboardPaste size={13} />
                Paste URLs
              </button>
            </div>

            {showPasteFallback && (
              <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold text-foreground">
                  Paste your copied URLs here
                </p>
                <textarea
                  ref={pasteFallbackRef}
                  value={pasteFallbackText}
                  onChange={(e) => setPasteFallbackText(e.target.value)}
                  placeholder="Long-press here and choose Paste…"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteFallback(false)}
                    className="rounded-lg px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPastedUrls(pasteFallbackText)}
                    disabled={!pasteFallbackText.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Use URLs
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {urlInputs.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="shrink-0">
                    <Link2 size={14} className="text-muted-foreground/50" />
                  </span>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => updateRow(i, e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Remove URL"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
              >
                <Plus size={13} />
                Add another URL
              </button>

              <button
                type="submit"
                disabled={submitting || urlInputs.every((u) => !u.trim())}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.15)] hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:translate-y-0"
              >
                {submitting ? (
                  <><Loader2 size={14} className="animate-spin" /> Starting…</>
                ) : (
                  <><Download size={14} /> Download & Encrypt</>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* ── Security badge ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[11px] text-primary">
        <ShieldCheck size={15} className="shrink-0" />
        <span>
          <strong>End-to-end encrypted at rest.</strong> Files are encrypted
          chunk-by-chunk as they arrive — no plaintext ever lands on disk.
          Even partial downloads are secured immediately.
        </span>
      </div>

      {/* ── Jobs list ──────────────────────────────────────────────────────── */}
      {(jobs.length > 0 || loadingJobs) && (
        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-bold tracking-tight">
              Download jobs
            </h3>
            {hasFinished && (
              <button
                onClick={() => void clearFinished()}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={12} />
                Clear finished
              </button>
            )}
          </div>

          {loadingJobs && jobs.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 size={14} className="animate-spin" />
              Loading jobs…
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} onCancel={cancelJob} />
              ))}
            </div>
          )}
        </section>
      )}

      {!loadingJobs && jobs.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
          <Download size={36} strokeWidth={1.2} className="opacity-30" />
          <p className="text-sm font-semibold">No download jobs yet</p>
          <p className="text-[11px]">Paste a URL above and click Download &amp; Encrypt to begin.</p>
        </div>
      )}
    </div>
  );
}

// ── JobCard component ─────────────────────────────────────────────────────────

function JobCard({ job, onCancel }: { job: Job; onCancel: (id: string) => void }) {
  const isActive = job.status === "queued" || job.status === "running";

  const statusBadge = {
    queued: "bg-yellow-500/10 text-yellow-400",
    running: "bg-blue-500/10 text-blue-400",
    done: "bg-accent/10 text-accent",
    error: "bg-destructive/10 text-destructive",
    cancelled: "bg-secondary text-muted-foreground",
  }[job.status];

  const statusText = {
    queued: "Queued",
    running: "Running",
    done: job.failed > 0 ? `Done (${job.failed} failed)` : "Complete",
    error: "Error",
    cancelled: "Cancelled",
  }[job.status];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge}`}>
              {statusText}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {new Date(job.createdAt).toLocaleTimeString()} ·{" "}
              {job.done}/{job.total} files · {fmtBytes(job.bytesReceived)} received
            </span>
          </div>
        </div>

        {isActive && (
          <button
            onClick={() => onCancel(job.id)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/20"
          >
            <X size={12} /> Cancel
          </button>
        )}
      </div>

      {/* Overall progress bar */}
      {isActive && (
        <div className="px-5 pb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-right font-mono text-[10px] text-muted-foreground">
            {job.progress}%
          </p>
        </div>
      )}

      {/* Item list */}
      <div className="divide-y divide-border border-t border-border">
        {job.items.map((item, i) => (
          <ItemRow key={i} item={item} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: DownloadItem }) {
  const isActive = item.status === "downloading" || item.status === "encrypting";

  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-3">
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">
            {item.filename || item.url}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground font-mono">
            {item.url}
          </p>

          {/* Per-item progress bar */}
          {isActive && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/60 transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}

          <div className="mt-1 flex items-center gap-3 text-[10px]">
            <span className={`font-semibold ${statusColor[item.status]}`}>
              {statusLabel[item.status]}
            </span>
            {item.bytesReceived > 0 && (
              <span className="text-muted-foreground">
                {fmtBytes(item.bytesReceived)}
                {item.totalBytes ? ` / ${fmtBytes(item.totalBytes)}` : ""}
              </span>
            )}
            {item.status === "done" && item.mediaId && (
              <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] text-accent">
                <ShieldCheck size={9} className="inline mr-0.5" />
                stored
              </span>
            )}
            {item.error && (
              <span className="text-destructive">{item.error}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

