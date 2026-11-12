import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import {
  media,
  saveState,
  writeEncryptedMedia,
  type MediaItem,
} from "../lib/store";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

const makeId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const UVLT_MAGIC = Buffer.from([0x55, 0x56, 0x4c, 0x54]); // 'UVLT'
const CHUNK_MAGIC = Buffer.from([0x43, 0x48, 0x4e, 0x4b]); // 'CHNK'
const MANI_MAGIC = Buffer.from([0x4d, 0x41, 0x4e, 0x49]); // 'MANI'

function buildAAD(fileId: string, chunkIndex: number, plainLength: number): Buffer {
  const buf = Buffer.alloc(4 + 32 + 4 + 4);
  buf.write("UV01", 0, 4, "ascii");
  buf.write(fileId.padEnd(32, "0").slice(0, 32), 4, 32, "utf-8");
  buf.writeUInt32BE(chunkIndex, 36);
  buf.writeUInt32BE(plainLength, 40);
  return buf;
}

function deriveManifestKey(dek: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      dek,
      Buffer.alloc(0),
      Buffer.from("UploaderVault-v1-manifest", "utf-8"),
      32
    )
  );
}

/**
 * Decrypts a .uenc container buffer in RAM, verifying all chunk auth tags and HMAC
 */
function decryptUencBuffer(containerBytes: Buffer): {
  metadata: Record<string, unknown>;
  mediaBytes: Buffer;
  sha256: string;
} {
  let offset = 0;

  // 1. Verify Magic
  const magic = containerBytes.subarray(offset, offset + 4);
  offset += 4;
  if (!magic.equals(UVLT_MAGIC)) {
    throw new Error("Invalid container format: magic mismatch");
  }

  const version = containerBytes.readUInt32BE(offset);
  offset += 4;
  if (version !== 1) {
    throw new Error(`Unsupported container version: ${version}`);
  }

  const fileId = containerBytes.subarray(offset, offset + 32).toString("utf-8").trim();
  offset += 32;

  const dek = containerBytes.subarray(offset, offset + 32);
  offset += 32;

  const metaLen = containerBytes.readUInt32BE(offset);
  offset += 4;

  const metaStr = containerBytes.subarray(offset, offset + metaLen).toString("utf-8");
  offset += metaLen;
  const metadata = JSON.parse(metaStr);

  // 2. Decrypt Chunks
  const decryptedChunks: Buffer[] = [];
  let chunkCount = 0;

  while (offset < containerBytes.length) {
    const sectionMagic = containerBytes.subarray(offset, offset + 4);
    if (sectionMagic.equals(MANI_MAGIC)) {
      break;
    }

    if (!sectionMagic.equals(CHUNK_MAGIC)) {
      throw new Error(`Corrupted chunk header at offset ${offset}`);
    }
    offset += 4;

    const chunkIndex = containerBytes.readUInt32BE(offset);
    offset += 4;
    const plainLength = containerBytes.readUInt32BE(offset);
    offset += 4;
    const nonce = containerBytes.subarray(offset, offset + 12);
    offset += 12;
    const cipherLength = containerBytes.readUInt32BE(offset);
    offset += 4;
    const ciphertext = containerBytes.subarray(offset, offset + cipherLength);
    offset += cipherLength;
    const tag = containerBytes.subarray(offset, offset + 16);
    offset += 16;

    // Decrypt chunk with GCM
    const aad = buildAAD(fileId, chunkIndex, plainLength);
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    decryptedChunks.push(decrypted);
    chunkCount++;
  }

  // 3. Manifest Verification
  const manifestStart = offset;
  const manifestMagic = containerBytes.subarray(offset, offset + 4);
  offset += 4;
  if (!manifestMagic.equals(MANI_MAGIC)) {
    throw new Error("Missing or corrupted manifest header");
  }

  const expectedChunkCount = containerBytes.readUInt32BE(offset);
  offset += 4;
  const expectedTotalSize = Number(containerBytes.readBigUInt64BE(offset));
  offset += 8;
  const originalSha256 = containerBytes.subarray(offset, offset + 64).toString("ascii");
  offset += 64;

  const storedHmac = containerBytes.subarray(offset, offset + 32);
  offset += 32;

  const manifestPayload = containerBytes.subarray(manifestStart, manifestStart + 4 + 4 + 8 + 64);
  const manifestKey = deriveManifestKey(dek);
  const expectedHmac = crypto.createHmac("sha256", manifestKey).update(manifestPayload).digest();

  if (!crypto.timingSafeEqual(storedHmac, expectedHmac)) {
    throw new Error("Manifest HMAC verification failed! Encrypted container was modified.");
  }

  if (chunkCount !== expectedChunkCount) {
    throw new Error(`Chunk count mismatch: expected ${expectedChunkCount}, found ${chunkCount}`);
  }

  const mediaBytes = Buffer.concat(decryptedChunks);
  if (mediaBytes.length !== expectedTotalSize) {
    throw new Error(`Size mismatch: expected ${expectedTotalSize}, got ${mediaBytes.length}`);
  }

  const computedSha256 = crypto.createHash("sha256").update(mediaBytes).digest("hex");
  if (computedSha256 !== originalSha256) {
    throw new Error(`Integrity check failed: SHA-256 mismatch!`);
  }

  return {
    metadata,
    mediaBytes,
    sha256: originalSha256,
  };
}

// ── Health Endpoints (LAN / Tailscale Auto-Discovery) ────────────────────────

router.get(["/v1/health", "/health", "/secure-ingest/health"], (_req, res) => {
  res.json({
    status: "ok",
    service: "uploader-pro",
    apiVersion: 1,
    secureIngest: true,
    supportedFormats: [".uenc", "multipart/form-data"],
  });
});

// ── Secure Ingest Endpoint ───────────────────────────────────────────────────

router.post(
  ["/v1/secure-ingest/upload", "/secure-ingest/upload", "/v1/upload"],
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file || !file.buffer) {
        return res.status(400).json({ error: "No media file payload provided" });
      }

      let originalFilename =
        (req.body.originalFilename as string) || file.originalname || "downloaded-media";
      if (originalFilename.endsWith(".uenc")) {
        originalFilename = originalFilename.replace(/\.uenc$/, "");
      }

      let mimeType =
        (req.body.mimeType as string) || file.mimetype || "application/octet-stream";
      let plainBytes: Buffer;
      let sha256: string;

      // Check if uploaded file is a .uenc container from Downloader-Pro
      if (file.buffer.length >= 4 && file.buffer.subarray(0, 4).equals(UVLT_MAGIC)) {
        // Decrypt and verify in RAM
        const decrypted = decryptUencBuffer(file.buffer);
        plainBytes = decrypted.mediaBytes;
        sha256 = decrypted.sha256;
        if (decrypted.metadata?.filename) {
          originalFilename = String(decrypted.metadata.filename);
        }
        if (decrypted.metadata?.mimeType) {
          mimeType = String(decrypted.metadata.mimeType);
        }
      } else {
        // Plain bytes upload fallback
        plainBytes = file.buffer;
        sha256 = crypto.createHash("sha256").update(plainBytes).digest("hex");
      }

      // Check for content duplication in Uploader-Pro
      const existing = media.find((m) => m.sha256 === sha256);
      if (existing) {
        return res.json({
          success: true,
          ok: true,
          mediaId: existing.id,
          id: existing.id,
          duplicate: true,
          message: "Media already secured in vault",
        });
      }

      const isVideo =
        mimeType.startsWith("video/") ||
        /\.(mp4|mov|webm|mkv)$/i.test(originalFilename);

      // Generate sharp thumbnail for images
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

      // Create new vault MediaItem
      const item: MediaItem = {
        id: makeId("m"),
        originalName: originalFilename,
        type: isVideo ? "video" : "image",
        thumbUrl: "",
        fileUrl: "",
        mime: mimeType,
        size: plainBytes.length,
        favourite: false,
        tags: ["downloader-pro"],
        hideFromMain: false,
        duplicate: false,
        lost: false,
        createdAt: new Date().toISOString(),
        sha256,
      };

      // Encrypt into Uploader-Pro's native Fernet storage
      await writeEncryptedMedia(item, plainBytes, thumbnail);

      media.unshift(item);
      saveState();

      return res.status(201).json({
        success: true,
        ok: true,
        mediaId: item.id,
        id: item.id,
        sha256: item.sha256,
        filename: item.originalName,
        verified: true,
        message: "Successfully verified and stored in Uploader-Pro vault",
      });
    } catch (err) {
      console.error("[Secure Ingest Error]:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to process secure ingest",
      });
    }
  }
);

export default router;
