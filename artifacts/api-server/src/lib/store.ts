import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { logger } from "./logger";
import { connectMongo, loadDecryptJobs, loadVaultState, saveDecryptJob, saveVaultState } from "./mongo-persistence";
import { deleteEncryptedObject, readEncryptedObject, storeEncryptedObject } from "./private-media-storage";

export type MediaItem = {
  id: string;
  originalName: string;
  type: "image" | "video";
  thumbUrl: string;
  fileUrl: string;
  mime: string;
  size: number;
  favourite: boolean;
  tags: string[];
  hideFromMain: boolean;
  duplicate: boolean;
  lost: boolean;
  createdAt: string;
  sha256?: string;
  encPath?: string;
  thumbEncPath?: string;
  duplicateNameConflicts?: string[];
};

type PersistedState = { media: MediaItem[]; collections: Collection[]; bookmarks: Bookmark[]; masterCollections: MasterCollection[] };
export type Collection = { id: string; name: string; itemCount: number; coverThumbUrl: string | null; mediaIds: string[] };
export type Bookmark = { id: string; url: string; order: number };
export type MasterCollection = { id: string; name: string; collectionIds: string[] };

const mediaDir = path.resolve(process.env.MEDIA_DIR ?? "./media");
const dataDir = path.resolve(process.env.DATA_DIR ?? "./.data");
const statePath = path.join(dataDir, "uploader-store.json");
fs.mkdirSync(mediaDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const seedMedia: MediaItem[] = [
  { id: "m1", originalName: "blue-hour.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1800&q=90", mime: "image/jpeg", size: 2840000, favourite: true, tags: ["travel", "landscape"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "m2", originalName: "studio-light.png", type: "image", thumbUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1800&q=90", mime: "image/jpeg", size: 1940000, favourite: false, tags: ["work"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: "m3", originalName: "quiet-morning.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1800&q=90", mime: "image/jpeg", size: 3420000, favourite: true, tags: ["personal"], hideFromMain: false, duplicate: false, duplicateNameConflicts: [], lost: false, createdAt: new Date(Date.now() - 259200000).toISOString() },
  { id: "m4", originalName: "coastline.mov", type: "video", thumbUrl: "https://images.unsplash.com/photo-1507524887384-25b4e9f1c1a5?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1507524887384-25b4e9f1c1a5?w=1800&q=90", mime: "video/quicktime", size: 18400000, favourite: false, tags: ["travel"], hideFromMain: false, duplicate: false, duplicateNameConflicts: [], lost: false, createdAt: new Date(Date.now() - 345600000).toISOString() },
  { id: "m5", originalName: "architecture.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1800&q=90", mime: "image/jpeg", size: 4100000, favourite: false, tags: ["architecture"], hideFromMain: false, duplicate: false, duplicateNameConflicts: [], lost: false, createdAt: new Date(Date.now() - 432000000).toISOString() },
  { id: "m6", originalName: "film-notes.png", type: "image", thumbUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1800&q=90", mime: "image/jpeg", size: 2260000, favourite: false, tags: [], hideFromMain: false, duplicate: false, duplicateNameConflicts: [], lost: false, createdAt: new Date(Date.now() - 518400000).toISOString() },
];

const initial: PersistedState = { media: seedMedia, collections: [
  { id: "c1", name: "Travel", itemCount: 2, coverThumbUrl: seedMedia[0].thumbUrl, mediaIds: ["m1", "m4"] },
  { id: "c2", name: "Work", itemCount: 1, coverThumbUrl: seedMedia[1].thumbUrl, mediaIds: ["m2"] },
  { id: "c3", name: "Personal", itemCount: 1, coverThumbUrl: seedMedia[2].thumbUrl, mediaIds: ["m3"] },
], bookmarks: [{ id: "b1", url: "https://www.are.na/", order: 0 }, { id: "b2", url: "https://unsplash.com/", order: 1 }], masterCollections: [] };

let state: PersistedState = fs.existsSync(statePath) ? { ...initial, ...JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<PersistedState> } : initial;
export const media = state.media;
export const collections = state.collections;
export const bookmarks = state.bookmarks;
export const masterCollections = state.masterCollections;
export const decryptJobs = new Map<string, { id: string; status: "queued" | "processing" | "done" | "error"; done: number; total: number; mediaIds?: string[]; resultPath?: string; error?: string }>();
let mongoReady = false;
let saveQueue: Promise<void> = Promise.resolve();
let watcherRunning = false;
let watcherPending = 0;
let watcherFailed = 0;
let lastImportAt: string | null = null;

export async function initializeStore() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    logger.warn("MONGO_URI is not configured; using local development state.");
    return;
  }
  await connectMongo(mongoUri);
  const restored = await loadVaultState();
  media.splice(0, media.length, ...(restored.media as unknown as MediaItem[]));
  collections.splice(0, collections.length, ...(restored.collections as unknown as Collection[]));
  bookmarks.splice(0, bookmarks.length, ...(restored.bookmarks as unknown as Bookmark[]));
  masterCollections.splice(0, masterCollections.length, ...(restored.masterCollections as unknown as MasterCollection[]));
  mongoReady = true;
  for (const job of await loadDecryptJobs()) {
    const resumed = job.status === "processing" ? { ...job, status: "queued" as const, done: 0 } : job;
    decryptJobs.set(job.id, resumed);
    if (resumed !== job) await saveDecryptJob(resumed);
  }
  logger.info("MongoDB persistence connected.");
}

export function saveState() {
  if (!mongoReady) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    return;
  }
  const snapshot = JSON.parse(JSON.stringify(state)) as PersistedState;
  saveQueue = saveQueue
    .then(() => saveVaultState(snapshot as unknown as {
      media: Record<string, unknown>[];
      collections: Record<string, unknown>[];
      bookmarks: Record<string, unknown>[];
      masterCollections: Record<string, unknown>[];
    }))
    .catch((error: unknown) => {
      logger.error({ err: error }, "Failed to persist vault metadata.");
    });
}

export async function flushState() {
  await saveQueue;
}

export async function persistDecryptJob(job: {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  done: number;
  total: number;
  mediaIds?: string[];
  resultPath?: string;
  error?: string;
}) {
  if (mongoReady) await saveDecryptJob(job);
}

function key() {
  const password = process.env.FERNET_PASSWORD ?? process.env.APP_PASSWORD;
  if (!password) throw new Error("FERNET_PASSWORD must be configured before storing media.");
  const salt = process.env.FERNET_SALT ?? "antigravity_salt_123";
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

export function encryptFernet(value: Buffer) {
  const derived = key();
  const signing = derived.subarray(0, 16);
  const encryption = derived.subarray(16);
  const iv = crypto.randomBytes(16);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = crypto.createCipheriv("aes-128-cbc", encryption, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  const body = Buffer.concat([Buffer.from([0x80]), timestamp, iv, ciphertext]);
  return Buffer.from(Buffer.concat([body, crypto.createHmac("sha256", signing).update(body).digest()]).toString("base64url"));
}

export function decryptFernet(token: Buffer) {
  const derived = key();
  const raw = token[0] === 0x80 ? token : Buffer.from(token.toString("ascii").trim(), "base64url");
  if (raw.length < 57 || raw[0] !== 0x80 || (raw.length - 57) % 16 !== 0) throw new Error("Invalid encrypted media token");
  const body = raw.subarray(0, -32);
  const signature = raw.subarray(-32);
  const expected = crypto.createHmac("sha256", derived.subarray(0, 16)).update(body).digest();
  if (!crypto.timingSafeEqual(expected, signature)) throw new Error("Invalid encrypted media token");
  const decipher = crypto.createDecipheriv("aes-128-cbc", derived.subarray(16), body.subarray(25, 41));
  return Buffer.concat([decipher.update(body.subarray(41)), decipher.final()]);
}

export function encryptedMediaPath(item: MediaItem) {
  return item.encPath ? path.resolve(item.encPath) : path.join(mediaDir, `${item.sha256 ?? item.id}.enc`);
}

export async function writeEncryptedMedia(item: MediaItem, bytes: Buffer, thumbnail?: Buffer) {
  const target = path.join(mediaDir, `${item.sha256}.enc`);
  item.encPath = await storeEncryptedObject(encryptFernet(bytes), target);
  if (thumbnail) {
    const thumbTarget = path.join(mediaDir, "thumbs", `${item.sha256}.enc`);
    item.thumbEncPath = await storeEncryptedObject(encryptFernet(thumbnail), thumbTarget);
  }
  item.fileUrl = `/api/media/${item.id}/file`;
  item.thumbUrl = `/api/media/${item.id}/thumb`;
  saveState();
}

export async function readDecryptedMedia(item: MediaItem) {
  const target = encryptedMediaPath(item);
  if (!target.startsWith("/objects/") && !fs.existsSync(target)) { item.lost = true; saveState(); return null; }
  try {
    return decryptFernet(await readEncryptedObject(target));
  } catch (error) {
    const statusCode = (error as { code?: number; statusCode?: number }).code ?? (error as { statusCode?: number }).statusCode;
    if (statusCode === 404) { item.lost = true; saveState(); return null; }
    throw error;
  }
}

export async function readDecryptedThumbnail(item: MediaItem) {
  if (!item.thumbEncPath) return null;
  if (!item.thumbEncPath.startsWith("/objects/") && !fs.existsSync(item.thumbEncPath)) return null;
  try {
    return decryptFernet(await readEncryptedObject(item.thumbEncPath));
  } catch (error) {
    const statusCode = (error as { code?: number; statusCode?: number }).code ?? (error as { statusCode?: number }).statusCode;
    if (statusCode === 404) return null;
    throw error;
  }
}

export async function removeMediaFiles(item: MediaItem) {
  for (const target of [item.encPath, item.thumbEncPath]) {
    if (target) await deleteEncryptedObject(target);
  }
}

export async function importPlainFile(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const existing = media.find((item) => item.sha256 === sha256);
  if (existing) {
    fs.unlinkSync(filePath);
    return existing;
  }
  const originalName = path.basename(filePath);
  const item: MediaItem = { id: `m${Date.now().toString(36)}`, originalName, type: /\.(mp4|mov|webm)$/i.test(originalName) ? "video" : "image", thumbUrl: "", fileUrl: "", mime: /\.(mp4|mov|webm)$/i.test(originalName) ? "video/mp4" : "image/jpeg", size: bytes.length, favourite: false, tags: [], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date().toISOString(), sha256 };
  media.unshift(item);
  await writeEncryptedMedia(item, bytes);
  fs.unlinkSync(filePath);
  return item;
}

export function startWatcher() {
  if (process.env.WATCHER_ENABLED === "false") return;
  const watchDir = path.resolve(process.env.WATCH_DIR ?? "./watch_inbox");
  fs.mkdirSync(watchDir, { recursive: true });
  watcherRunning = true;
  chokidar.watch(watchDir, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
  }).on("add", (filePath) => {
    if (/\.(jpg|jpeg|png|webp|bmp|gif|jfif|heic|mp4|mov|webm)$/i.test(filePath)) {
      watcherPending += 1;
      void importPlainFile(filePath)
        .then(() => { lastImportAt = new Date().toISOString(); })
        .catch((error: unknown) => {
          watcherFailed += 1;
          logger.error({ err: error, fileName: path.basename(filePath) }, "Watched media import failed.");
        })
        .finally(() => { watcherPending = Math.max(0, watcherPending - 1); });
    }
  });
}

export function getWatcherStatus() {
  return { watching: watcherRunning, dir: path.resolve(process.env.WATCH_DIR ?? "./watch_inbox"), pending: watcherPending, failed: watcherFailed, lastImportAt };
}

export async function encryptPlaintextSweep(directories: string[]) {
  let encrypted = 0;
  const allowed = /\.(jpg|jpeg|png|webp|bmp|gif|jfif|heic|mp4|mov|webm)$/i;
  for (const directory of directories) {
    const root = path.resolve(directory);
    if (!fs.existsSync(root)) continue;
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(filePath);
        else if (entry.isFile() && allowed.test(entry.name)) {
          try { await importPlainFile(filePath); encrypted += 1; }
          catch (error) { logger.warn({ err: error, fileName: path.basename(filePath) }, "Plaintext media could not be encrypted."); }
        }
      }
    };
    await walk(root);
  }
  return encrypted;
}