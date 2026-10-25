import { useMemo, useState, useRef } from "react";
import { Link } from "wouter";
import {
  useGetStats,
  useGetWatcherStatus,
  useHealthCheck,
  useListCollections,
  useListMedia,
  useDeleteMedia,
  customFetch,
} from "@workspace/api-client-react";
import {
  ArrowUpRight,
  Clock3,
  Database,
  FolderHeart,
  Heart,
  Images,
  LockKeyhole,
  Sparkles,
  Tag,
  UploadCloud,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  PackageOpen,
  X,
  FileArchive,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MediaGrid } from "@/components/media-grid";
import { PageHeading } from "@/components/uploader-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const storage = (bytes = 0) =>
  bytes > 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${(bytes / 1_000_000).toFixed(0)} MB`;

export default function DashboardPage() {
  const stats = useGetStats();
  const watcher = useGetWatcherStatus();
  const health = useHealthCheck();
  const recent = useListMedia({ view: "new", limit: 8 });
  const collections = useListCollections();
  const allMedia = useListMedia({ view: "all", limit: 1000 });
  const deleteMedia = useDeleteMedia();
  const { toast } = useToast();

  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllPending, setDeleteAllPending] = useState(false);
  const [importVaultOpen, setImportVaultOpen] = useState(false);

  const statsData = stats.data;

  const healthLabel =
    health.data?.status === "ok"
      ? "Operational"
      : health.isLoading
        ? "Checking"
        : "Protected";

  const collectionPreview = useMemo(
    () => (collections.data || []).slice(0, 3),
    [collections.data],
  );

  const mediaList = allMedia.data?.items || [];

  const runDeleteAll = async () => {
    if (deleteAllPending) return;

    setDeleteAllPending(true);

    try {
      let deleted = 0;
      let total = stats.data?.totalImages !== undefined
        ? (stats.data.totalImages + (stats.data.totalVideos || 0))
        : mediaList.length;

      try {
        const res = await customFetch<{ deleted: number; total: number }>("/api/media", {
          method: "DELETE",
        });
        deleted = res?.deleted ?? total;
        total = res?.total ?? total;
      } catch {
        // Fallback to per-item loop
        deleted = 0;
        total = mediaList.length;
        for (const media of mediaList) {
          try {
            await deleteMedia.mutateAsync({ id: media.id });
            deleted += 1;
          } catch {
            // continue
          }
        }
      }

      await Promise.all([
        allMedia.refetch(),
        stats.refetch(),
        watcher.refetch(),
        recent.refetch(),
        collections.refetch(),
      ]);

      toast({
        title: "All media deleted",
        description: `${deleted} of ${total} media items purged from the vault.`,
      });

      setDeleteAllOpen(false);
    } catch {
      toast({
        title: "Delete failed",
        description:
          "Some media could not be deleted. Refresh the dashboard and try again.",
        variant: "destructive",
      });

      void allMedia.refetch();
      void stats.refetch();
    } finally {
      setDeleteAllPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading
        eyebrow="Good evening, owner"
        title="Your vault, in focus."
        description="A clear view of what arrived, what needs attention, and where your archive is growing."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportVaultOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-extrabold text-primary hover:bg-primary/20 hover:-translate-y-0.5 transition-transform"
              data-testid="button-import-vault"
            >
              <PackageOpen size={16} />
              Import Vault
            </button>
            <Link
              href="/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.12)] hover:-translate-y-0.5"
              data-testid="link-dashboard-upload"
            >
              <UploadCloud size={16} />
              Import media
            </Link>

            <AlertDialog
              open={deleteAllOpen}
              onOpenChange={(open) => {
                if (!deleteAllPending) setDeleteAllOpen(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs font-extrabold text-destructive hover:bg-destructive/20"
                  data-testid="button-delete-all-media"
                >
                  <Trash2 size={16} />
                  Delete all
                </button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={20} />

                    <div>
                      <AlertDialogTitle>
                        Delete all media?
                      </AlertDialogTitle>

                      <AlertDialogDescription>
                        This permanently erases every photo and video from disk
                        and removes all MongoDB database records. This action
                        cannot be undone.
                      </AlertDialogDescription>
                    </div>
                  </div>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel
                    disabled={deleteAllPending}
                    data-testid="button-cancel-delete-all"
                  >
                    Cancel
                  </AlertDialogCancel>

                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void runDeleteAll();
                    }}
                    disabled={deleteAllPending}
                    className="bg-destructive hover:bg-destructive/90"
                    data-testid="button-confirm-delete-all"
                  >
                    {deleteAllPending ? (
                      <div className="flex gap-2 items-center">
                        <CheckCircle2
                          size={16}
                          className="animate-spin"
                        />
                        Purging vault...
                      </div>
                    ) : (
                      "Delete all media"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Vault Import Dialog */}
      <ImportVaultDialog
        open={importVaultOpen}
        onOpenChange={setImportVaultOpen}
        onSuccess={() => {
          void Promise.all([allMedia.refetch(), stats.refetch(), recent.refetch(), collections.refetch(), watcher.refetch()]);
        }}
      />

      {/* Statistics */}
      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total media"
          value={
            statsData
              ? (
                statsData.totalImages + statsData.totalVideos
              ).toLocaleString()
              : "—"
          }
          detail={
            statsData
              ? `${statsData.totalImages} photos · ${statsData.totalVideos} videos`
              : "Loading archive"
          }
          icon={Images}
          accent="primary"
          testId="total-media"
        />

        <StatCard
          label="Favourites"
          value={statsData ? `${statsData.favouritesCount}` : "—"}
          detail="Your marked moments"
          icon={Heart}
          accent="rose"
          testId="favourites"
        />

        <StatCard
          label="Needs a tag"
          value={statsData ? `${statsData.untaggedCount}` : "—"}
          detail="Ready for a little context"
          icon={Tag}
          accent="teal"
          testId="untagged"
        />

        <StatCard
          label="Storage used"
          value={statsData ? storage(statsData.storageUsed) : "—"}
          detail={
            statsData
              ? `${statsData.masterCount} masters protected`
              : "Measuring vault"
          }
          icon={Database}
          accent="violet"
          testId="storage"
        />
      </section>

      {/* Recent media and sidebar */}
      <section className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">
                Freshly secured
              </p>
              <h2 className="mt-1 font-serif text-xl font-bold tracking-[-.035em]">
                New arrivals
              </h2>
            </div>

            <Link
              href="/new"
              className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
              data-testid="link-see-new"
            >
              View all <ArrowUpRight size={14} />
            </Link>
          </div>

          <MediaGrid
            items={recent.data?.items || []}
            emptyTitle="Your first memories are waiting"
            emptyCopy="Drop a folder into your watched directory or import files to see them here."
          />
        </div>

        <div className="space-y-5">
          {/* System health */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">
                  Archive pulse
                </p>
                <h2 className="mt-1 font-serif text-xl font-bold tracking-[-.035em]">
                  System health
                </h2>
              </div>

              <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {healthLabel}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <LockKeyhole size={14} className="text-primary" />
                  Encryption
                </span>
                <span className="font-mono font-medium text-foreground">
                  AES-256
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 size={14} className="text-accent" />
                  Watcher
                </span>
                <span className="font-mono font-medium text-accent">
                  {watcher.data?.watching ? "Watching" : "Paused"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Database size={14} className="text-violet-400" />
                  Pending import
                </span>
                <span className="font-mono font-medium">
                  {watcher.data?.pending ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Collections */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-violet-300">
                  Organize by feeling
                </p>
                <h2 className="mt-1 font-serif text-xl font-bold tracking-[-.035em]">
                  Collections
                </h2>
              </div>

              <Link
                href="/collections"
                className="text-xs font-bold text-muted-foreground hover:text-primary"
                data-testid="link-dashboard-collections"
              >
                Browse
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {collectionPreview.length ? (
                collectionPreview.map((collection) => (
                  <Link
                    href="/collections"
                    key={collection.id}
                    className="flex items-center gap-3 rounded-xl p-2 hover:bg-secondary"
                    data-testid={`link-collection-${collection.id}`}
                  >
                    <div className="h-10 w-12 overflow-hidden rounded-lg bg-secondary">
                      {collection.coverThumbUrl ? (
                        <img
                          src={collection.coverThumbUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-primary">
                          <FolderHeart size={16} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">
                        {collection.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {collection.itemCount} items
                      </p>
                    </div>

                    <ArrowUpRight
                      size={14}
                      className="text-muted-foreground"
                    />
                  </Link>
                ))
              ) : (
                <p className="py-4 text-xs text-muted-foreground">
                  Collections will appear as you create them.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: string;
  testId: string;
};

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
  testId,
}: StatCardProps) {
  const accentClasses: Record<string, string> = {
    primary: "bg-primary/12 text-primary",
    rose: "bg-rose-400/10 text-rose-300",
    teal: "bg-accent/10 text-accent",
    violet: "bg-violet-400/10 text-violet-300",
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5"
      data-testid={`card-stat-${testId}`}
    >
      <div className="flex items-start justify-between">
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl ${accentClasses[accent] ?? accentClasses.primary
            }`}
        >
          <Icon size={17} />
        </span>
        <Sparkles size={14} className="text-muted-foreground/30" />
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
        {label}
      </p>

      <p
        className="mt-1 font-serif text-3xl font-bold tracking-[-.045em]"
        data-testid={`text-stat-${testId}`}
      >
        {value}
      </p>

      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ImportVaultDialog — accepts a pdf_converter uploader_export.zip
// ─────────────────────────────────────────────────────────────────────────────
type ImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  failed: number;
  collectionsImported: number;
  bookmarksImported: number;
  message: string;
};

function ImportVaultDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (status === "uploading") return;
    reset();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
  };

  const handleImport = async () => {
    if (!file || status === "uploading") return;
    setStatus("uploading");
    setProgress(0);
    setResult(null);
    setErrorMsg("");

    const token = sessionStorage.getItem("uploader-pro-token") ?? "";

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use XHR for upload progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/import/vault");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 85));
        });
        xhr.addEventListener("load", () => {
          setProgress(100);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as ImportResult;
              setResult(data);
              setStatus("done");
              onSuccess();
              resolve();
            } catch {
              reject(new Error("Invalid response from server"));
            }
          } else {
            let msg = "Import failed.";
            try { msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg; } catch { /* */ }
            reject(new Error(msg));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error — check your connection.")));
        xhr.send(formData);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error during import.";
      setErrorMsg(msg);
      setStatus("error");
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import pdf_converter Vault"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <PackageOpen size={20} />
            </span>
            <div>
              <h2 className="font-serif text-lg font-bold tracking-tight">Import pdf_converter Vault</h2>
              <p className="text-[11px] text-muted-foreground">
                Restore from an <code className="rounded bg-secondary px-1 py-px text-[10px]">uploader_export.zip</code>
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={status === "uploading"}
            className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            data-testid="button-close-import-dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* What gets imported */}
        {status === "idle" && (
          <div className="mt-5 rounded-xl bg-secondary/60 p-4 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground mb-2">What will be imported:</p>
            {[
              "All media files (images & videos) from Uploaded_Sessions/",
              "Tags from tags/tags.json",
              "Collections from collections/*.json",
              "Favourites from favourites.json",
              "Bookmarks from bookmarks.json",
            ].map((item) => (
              <p key={item} className="flex items-start gap-2">
                <CheckCircle2 size={12} className="mt-px shrink-0 text-accent" />
                {item}
              </p>
            ))}
            <p className="mt-3 text-[10px] text-muted-foreground/70">
              All matching media files are imported. Media is re-encrypted with your vault key.
            </p>
          </div>
        )}

        {/* File picker */}
        {status !== "done" && (
          <div className="mt-5">
            <label
              htmlFor="vault-zip-input"
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors
                ${file ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/40"}`}
            >
              <FileArchive size={28} className={file ? "text-primary" : "text-muted-foreground"} />
              {file ? (
                <>
                  <span className="text-xs font-semibold text-foreground">{file.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB — click to change
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Click to select <code className="rounded bg-secondary px-1">uploader_export.zip</code>
                  </span>
                  <span className="text-[10px] text-muted-foreground">or drag it here</span>
                </>
              )}
              <input
                id="vault-zip-input"
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="sr-only"
                onChange={handleFileChange}
                data-testid="input-vault-zip"
              />
            </label>
          </div>
        )}

        {/* Upload progress */}
        {status === "uploading" && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>{progress < 86 ? "Uploading & processing…" : "Encrypting and saving media…"}</span>
              <span className="ml-auto font-mono text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Large vaults may take several minutes — please keep this window open.
            </p>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <p className="font-semibold mb-1">Import failed</p>
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Success result */}
        {status === "done" && result && (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-xs text-accent">
              <p className="font-semibold text-foreground mb-3">Import complete!</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Media imported", value: result.imported, color: "text-accent" },
                  { label: "Skipped (not in archive)", value: result.skipped, color: "text-muted-foreground" },
                  { label: "Collections added", value: result.collectionsImported, color: "text-violet-400" },
                  { label: "Bookmarks added", value: result.bookmarksImported, color: "text-primary" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg bg-secondary/60 p-2.5">
                    <p className={`font-mono text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {result.failed > 0 && (
                <p className="mt-3 text-[10px] text-destructive">
                  {result.failed} file{result.failed !== 1 ? "s" : ""} could not be imported (unsupported type or corrupt).
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2">
          {status === "done" ? (
            <button
              onClick={handleClose}
              className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground hover:-translate-y-0.5 transition-transform"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={status === "uploading"}
                className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleImport()}
                disabled={!file || status === "uploading"}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.15)] hover:-translate-y-0.5 transition-transform disabled:opacity-40 disabled:translate-y-0"
                data-testid="button-confirm-import"
              >
                {status === "uploading" ? (
                  <><Loader2 size={14} className="animate-spin" /> Importing…</>
                ) : (
                  <><PackageOpen size={14} /> Import Vault</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
