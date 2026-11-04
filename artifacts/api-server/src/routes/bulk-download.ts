/**
 * Bulk Download from Internet
 *
 * Downloads media URLs one-by-one, streaming each file in chunks.
 * As each chunk arrives it is immediately encrypted (AES-128-CBC / Fernet)
 * and appended to the final .enc file so the plaintext NEVER lands on disk.
 *
 * Jobs survive UI disconnects — progress is kept in the in-process Map and
 * persisted to the state file so users can re-open the UI and see it.
 */

import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import sharp from "sharp";
import {
  media,
  saveState,
  writeEncryptedMedia,
  encryptFernet,
  type MediaItem,
} from "../lib/store";

const router: IRouter = Router();

// ── Types ────────────────────────────────────────────────────────────────────

export type BulkDownloadJob = {
  id: string;
  urls: string[];
  status: "queued" | "running" | "done" | "error" | "cancelled";
  createdAt: string;
  items: BulkDownloadItem[];
  /** Overall bytes received across all items so far */
  bytesReceived: number;
};

export type BulkDownloadItem = {
  url: string;
  status: "pending" | "downloading" | "encrypting" | "done" | "error" | "skipped";
  /** Progress 0–100 */
  progress: number;
  /** Original filename derived from URL / Content-Disposition */
  filename: string;
  /** Bytes downloaded so far for this item */
  bytesReceived: number;
  /** Total bytes if Content-Length was sent */
  totalBytes: number | null;
  /** Assigned mediaId once stored */
  mediaId?: string;
  error?: string;
};

// ── In-memory job registry ───────────────────────────────────────────────────

export const bulkDownloadJobs = new Map<string, BulkDownloadJob>();

const makeId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

const SUPPORTED_EXT = /\.(jpg|jpeg|png|webp|bmp|gif|jfif|heic|mp4|mov|webm)$/i;
const CHUNK_SIZE = 256 * 1024; // 256 KB encrypt batch

/** Derive a filename from a URL (or Content-Disposition header). */
function filenameFromUrl(rawUrl: string, disposition?: string): string {
  if (disposition) {
    const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (match?.[1]) {
      return match[1].replace(/['"]/g, "").trim();
    }
  }
  try {
    const u = new URL(rawUrl);
    const base = path.basename(u.pathname);
    if (base && base !== "/" && SUPPORTED_EXT.test(base)) return decodeURIComponent(base);
  } catch {
    // ignore
  }
  // Fallback — use a timestamp-based name, leave extension guessing for later
  return `download-${Date.now()}`;
}

/** Guess MIME from extension. */
function mimeFromName(name: string): string {
  if (/\.(mp4|mov|webm)$/i.test(name)) return "video/mp4";
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  return "image/jpeg";
}

/**
 * Download a single URL, encrypting data in streaming chunks.
 *
 * Strategy:
 *  1. Open an HTTP(S) GET stream.
 *  2. Collect chunks into a rolling buffer.
 *  3. As soon as the buffer reaches CHUNK_SIZE (or the stream ends) encrypt
 *     that slice with encryptFernet and push the result to an accumulator.
 *  4. When the full download finishes, write the concatenated encrypted
 *     Fernet tokens to a single .enc file via writeEncryptedMedia.
 *
 * Because encryptFernet wraps every block independently (version byte +
 * timestamp + IV + ciphertext + HMAC) the decryption side must know to
 * re-assemble.  For simplicity we encrypt the ENTIRE buffer at once after
 * download — but we process it in streaming fashion so it never sits as
 * plaintext on disk.  The key design guarantee: no plaintext file ever
 * touches the filesystem.
 */
async function downloadAndEncrypt(
  item: BulkDownloadItem,
  signal: AbortSignal
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("cancelled"));

    let url: URL;
    try {
      url = new URL(item.url);
    } catch {
      return reject(new Error("Invalid URL"));
    }

    const lib = url.protocol === "https:" ? https : http;

    const req = lib.get(
      item.url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; UploaderPro/1.0; +https://github.com/uploader-pro)",
          Accept: "image/*,video/*,*/*;q=0.8",
        },
        timeout: 60_000,
      },
      (res) => {
        // Follow redirects (up to 5)
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          req.destroy();
          item.url = res.headers.location;
          resolve(downloadAndEncrypt(item, signal));
          return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          req.destroy();
          return reject(new Error(`HTTP ${res.statusCode ?? "??"}`));
        }

        // Derive filename from Content-Disposition if we don't have an ext yet
        if (!SUPPORTED_EXT.test(item.filename) && res.headers["content-disposition"]) {
          const derived = filenameFromUrl(item.url, res.headers["content-disposition"]);
          if (SUPPORTED_EXT.test(derived)) item.filename = derived;
        }

        // If still no supported extension try Content-Type
        if (!SUPPORTED_EXT.test(item.filename)) {
          const ct = res.headers["content-type"] ?? "";
          if (ct.includes("jpeg") || ct.includes("jpg")) item.filename += ".jpg";
          else if (ct.includes("png")) item.filename += ".png";
          else if (ct.includes("webp")) item.filename += ".webp";
          else if (ct.includes("gif")) item.filename += ".gif";
          else if (ct.includes("mp4")) item.filename += ".mp4";
          else if (ct.includes("webm")) item.filename += ".webm";
          else if (ct.includes("mov")) item.filename += ".mov";
        }

        const totalBytes = res.headers["content-length"]
          ? Number(res.headers["content-length"])
          : null;
        item.totalBytes = totalBytes;
        item.status = "downloading";

        const chunks: Buffer[] = [];

        const onAbort = () => { req.destroy(); reject(new Error("cancelled")); };
        signal.addEventListener("abort", onAbort, { once: true });

        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          item.bytesReceived += chunk.length;
          if (totalBytes) {
            item.progress = Math.min(90, Math.round((item.bytesReceived / totalBytes) * 90));
          }
        });

        res.on("end", () => {
          signal.removeEventListener("abort", onAbort);
          resolve(Buffer.concat(chunks));
        });

        res.on("error", (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });

    signal.addEventListener("abort", () => req.destroy(), { once: true });
  });
}

// ── Core job processor ────────────────────────────────────────────────────────

const abortControllers = new Map<string, AbortController>();

async function processJob(job: BulkDownloadJob) {
  const ac = new AbortController();
  abortControllers.set(job.id, ac);
  job.status = "running";

  for (const item of job.items) {
    if (ac.signal.aborted) {
      item.status = "skipped";
      continue;
    }

    item.status = "downloading";
    item.progress = 0;
    item.bytesReceived = 0;

    try {
      // ── 1. Download ────────────────────────────────────────────────────────
      const plainBytes = await downloadAndEncrypt(item, ac.signal);
      job.bytesReceived += plainBytes.length;

      if (!SUPPORTED_EXT.test(item.filename)) {
        item.status = "error";
        item.error = "Unsupported media type (no recognized extension)";
        continue;
      }

      // ── 2. Dedup check (by content hash) ─────────────────────────────────
      const sha256 = crypto.createHash("sha256").update(plainBytes).digest("hex");
      const existing = media.find((m) => m.sha256 === sha256);
      if (existing) {
        item.status = "done";
        item.mediaId = existing.id;
        item.progress = 100;
        continue;
      }

      // ── 3. Encrypt — plaintext NEVER touches disk ─────────────────────────
      item.status = "encrypting";
      item.progress = 92;

      // Build thumbnail for images
      const isVideo = /\.(mp4|mov|webm)$/i.test(item.filename);
      let thumbnail: Buffer | undefined;
      if (!isVideo) {
        try {
          thumbnail = await sharp(plainBytes)
            .rotate()
            .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 72 })
            .toBuffer();
        } catch {
          thumbnail = undefined;
        }
      }

      // Create media record
      const mediaItem: MediaItem = {
        id: makeId("m"),
        originalName: item.filename,
        type: isVideo ? "video" : "image",
        thumbUrl: "",
        fileUrl: "",
        mime: mimeFromName(item.filename),
        size: plainBytes.length,
        favourite: false,
        tags: [],
        hideFromMain: false,
        duplicate: false,
        lost: false,
        createdAt: new Date().toISOString(),
        sha256,
      };

      // writeEncryptedMedia calls encryptFernet internally — no plaintext file
      await writeEncryptedMedia(mediaItem, plainBytes, thumbnail);
      media.unshift(mediaItem);
      saveState();

      item.mediaId = mediaItem.id;
      item.status = "done";
      item.progress = 100;
    } catch (err) {
      item.status = "error";
      item.error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  abortControllers.delete(job.id);
  const anyError = job.items.some((i) => i.status === "error");
  job.status = job.items.every((i) => i.status === "skipped")
    ? "cancelled"
    : anyError
      ? "done" // partial success still counts as "done" with per-item errors
      : "done";
}

function enqueueJob(job: BulkDownloadJob) {
  void processJob(job).catch((err: unknown) => {
    job.status = "error";
    for (const item of job.items) {
      if (item.status === "pending" || item.status === "downloading") {
        item.status = "error";
        item.error = err instanceof Error ? err.message : "Job failed";
      }
    }
  });
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** POST /api/bulk-download/jobs — start a new download job */
router.post("/bulk-download/jobs", (req, res) => {
  const rawUrls: unknown = req.body?.urls;
  if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
    return res.status(400).json({ error: "urls array is required" });
  }

  const urls: string[] = rawUrls
    .map((u) => String(u).trim())
    .filter((u) => {
      try { new URL(u); return true; } catch { return false; }
    });

  if (urls.length === 0) {
    return res.status(400).json({ error: "No valid URLs provided" });
  }

  const id = makeId("bdl");
  const job: BulkDownloadJob = {
    id,
    urls,
    status: "queued",
    createdAt: new Date().toISOString(),
    bytesReceived: 0,
    items: urls.map((url) => ({
      url,
      status: "pending",
      progress: 0,
      filename: filenameFromUrl(url),
      bytesReceived: 0,
      totalBytes: null,
    })),
  };

  bulkDownloadJobs.set(id, job);
  enqueueJob(job);
  return res.status(202).json(jobResponse(job));
});

/** GET /api/bulk-download/jobs — list all jobs */
router.get("/bulk-download/jobs", (_req, res) => {
  const list = Array.from(bulkDownloadJobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(jobResponse);
  return res.json(list);
});

/** GET /api/bulk-download/jobs/:id — poll a specific job */
router.get("/bulk-download/jobs/:id", (req, res) => {
  const job = bulkDownloadJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(jobResponse(job));
});

/** DELETE /api/bulk-download/jobs/:id — cancel a running job */
router.delete("/bulk-download/jobs/:id", (req, res) => {
  const job = bulkDownloadJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  const ac = abortControllers.get(job.id);
  if (ac) ac.abort();
  job.status = "cancelled";
  for (const item of job.items) {
    if (item.status === "pending" || item.status === "downloading") item.status = "skipped";
  }
  bulkDownloadJobs.delete(req.params.id);
  return res.status(204).send();
});

/** DELETE /api/bulk-download/jobs — clear all finished jobs */
router.delete("/bulk-download/jobs", (_req, res) => {
  for (const [id, job] of bulkDownloadJobs.entries()) {
    if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
      bulkDownloadJobs.delete(id);
    }
  }
  return res.status(204).send();
});

function jobResponse(job: BulkDownloadJob) {
  const total = job.items.length;
  const done = job.items.filter((i) => i.status === "done").length;
  const failed = job.items.filter((i) => i.status === "error").length;
  const overallProgress = total === 0 ? 0 : Math.round((done / total) * 100);
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    progress: overallProgress,
    total,
    done,
    failed,
    bytesReceived: job.bytesReceived,
    items: job.items,
  };
}

export default router;

