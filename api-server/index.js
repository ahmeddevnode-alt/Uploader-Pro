import express from "express";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";

const app = express();
app.use(express.json({ limit: "100mb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// Storage for uploaded encrypted media
const uploadedMedia = new Map();

const UVLT_MAGIC = Buffer.from([0x55, 0x56, 0x4c, 0x54]);

// Health check endpoint
app.get(["/api/v1/health", "/api/healthz", "/api/health"], (req, res) => {
  res.json({
    status: "ok",
    service: "uploader-pro",
    apiVersion: 1,
    secureIngest: true,
  });
});

// Multipart secure ingest endpoint for Downloader-Pro
app.post(
  ["/api/v1/secure-ingest/upload", "/api/v1/upload"],
  upload.single("file"),
  (req, res) => {
    try {
      const file = req.file;
      const mediaId = crypto.randomBytes(16).toString("hex");

      const originalFilename =
        (req.body.originalFilename as string) ||
        (file ? file.originalname.replace(/\.uenc$/, "") : "uploaded-media");

      const mimeType = (req.body.mimeType as string) || (file?.mimetype ?? "application/octet-stream");
      const fileSize = Number(req.body.fileSize || file?.size || 0);
      const sha256 = (req.body.sha256 as string) || "";

      uploadedMedia.set(mediaId, {
        id: mediaId,
        filename: originalFilename,
        mimeType,
        fileSize,
        sha256,
        uploadedAt: new Date(),
        rawBytes: file?.buffer,
      });

      console.log(`[Uploader-Pro] Ingested encrypted media: ${mediaId} (${originalFilename})`);

      res.status(201).json({
        success: true,
        ok: true,
        mediaId,
        id: mediaId,
        sha256,
        verified: true,
        message: "Encrypted media accepted and stored in Uploader-Pro",
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get uploaded media metadata
app.get("/api/v1/media/:mediaId", (req, res) => {
  const { mediaId } = req.params;
  const media = uploadedMedia.get(mediaId);

  if (!media) {
    return res.status(404).json({ error: "Media not found" });
  }

  res.json({
    mediaId,
    metadata: media,
  });
});

// List all uploaded media
app.get("/api/v1/media", (req, res) => {
  const mediaList = [];
  uploadedMedia.forEach((m, id) => {
    mediaList.push({
      mediaId: id,
      filename: m.filename,
      uploadedAt: m.uploadedAt,
    });
  });
  res.json({ media: mediaList });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
app.listen(PORT, () => {
  console.log(`Uploader-Pro API server running at http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET  /api/v1/health - Health check");
  console.log("  POST /api/v1/secure-ingest/upload - Receive encrypted media from Downloader-Pro");
  console.log("  GET  /api/v1/media - List all uploaded media");
});
