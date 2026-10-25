import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import AdmZip from "adm-zip";
import { collections, bookmarks, masterCollections, decryptJobs, media, type MediaItem, saveState, flushState, writeEncryptedMedia, readDecryptedMedia, readDecryptedThumbnail, removeMediaFiles, getWatcherStatus, encryptPlaintextSweep, persistDecryptJob } from "../lib/store";
import multer from "multer";

const router: IRouter = Router();
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });
const makeId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const authSecret = () => process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "uploader-local-development-only");
const signMedia = (id: string, kind: "file" | "thumb" = "file") => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const sig = crypto.createHmac("sha256", authSecret()).update(`${id}:${expires}`).digest("hex");
  return `/api/media/${id}/${kind}?expires=${expires}&sig=${sig}`;
};
const verifyMediaSignature = (id: string, expires: unknown, signature: unknown) => {
  const exp = Number(expires);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || typeof signature !== "string") return false;
  const expected = crypto.createHmac("sha256", authSecret()).update(`${id}:${exp}`).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};
const collectionView = (collection: typeof collections[number]) => {
  const mediaIds = collection.mediaIds ?? [];
  const cover = media.find((item) => mediaIds.includes(item.id));
  return { ...collection, coverThumbUrl: cover?.encPath ? signMedia(cover.id, "thumb") : collection.coverThumbUrl };
};

router.post("/auth/login", (req, res) => {
  const password = String(req.body?.password ?? "");
  const expected = process.env.APP_PASSWORD ?? process.env.FERNET_PASSWORD;
  if (!expected) return res.status(503).json({ error: "Vault password is not configured" });
  if (password !== expected) return res.status(401).json({ error: "That password is not correct." });
  const secret = authSecret();
  if (!secret) return res.status(503).json({ error: "Session signing secret is not configured" });
  return res.json({ token: jwt.sign({ purpose: "uploader" }, secret, { expiresIn: "12h" }), expiresIn: 43200 });
});

router.use((req, res, next) => {
  const signedMedia = req.method === "GET" && /^\/media\/[^/]+\/(file|thumb)$/.test(req.path) && verifyMediaSignature(req.path.split("/")[2], req.query.expires, req.query.sig);
  if (signedMedia) return next();
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const secret = authSecret();
  if (!secret) return res.status(503).json({ error: "Session signing secret is not configured" });
  try { jwt.verify(token, secret); return next(); } catch { return res.status(401).json({ error: "Session expired" }); }
});

router.get("/media", (req, res) => {
  const view = String(req.query.view ?? "all");
  const type = req.query.type ? String(req.query.type) : undefined;
  const search = String(req.query.search ?? "").toLowerCase();
  let items = media
    .filter((item) => req.query.includeHidden === "true" || !item.hideFromMain)
    .filter((item) => !type || item.type === type)
    .filter((item) => !search || item.originalName.toLowerCase().includes(search) || item.tags.some((tag) => tag.includes(search)));
  if (view === "new") items = items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (view === "favourites") items = items.filter((item) => item.favourite);
  if (view === "untagged") items = items.filter((item) => item.tags.length === 0);
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 40)));
  const pageItems = items.slice((page - 1) * limit, page * limit).map((item) => {
    return { ...item, thumbUrl: item.encPath ? signMedia(item.id, "thumb") : item.thumbUrl, fileUrl: item.encPath ? signMedia(item.id, "file") : item.fileUrl };
  });
  return res.json({ items: pageItems, total: items.length, page, limit });
});

router.post("/media/upload", multipart.array("files", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const names = files.length ? files.map((file) => file.originalname) : String(req.headers["x-original-filename"] ?? "uploaded-media.jpg").split(",").map((name) => name.trim()).filter(Boolean);
  const results = [];
  for (const [index, originalName] of names.entries()) {
    const file = files[index];
    const bytes = file?.buffer;
    if (!/\.(jpg|jpeg|png|webp|bmp|gif|jfif|heic|mp4|mov|webm)$/i.test(originalName)) {
      results.push({ ok: false, originalName, error: "This file type is not supported." });
      continue;
    }
    const sha256 = bytes ? crypto.createHash("sha256").update(bytes).digest("hex") : undefined;
    const sameContent = media.find((item) => Boolean(sha256 && item.sha256 === sha256));
    const sameName = media.find((item) => item.originalName === originalName && item.sha256 !== sha256);
    if (sameContent) {
      if (originalName === sameContent.originalName) {
        results.push({ ok: true, originalName, duplicate: false, alreadyStored: true, existingName: sameContent.originalName, id: sameContent.id });
        continue;
      }
      if (req.headers["x-allow-duplicate"] !== "true") {
        results.push({ ok: false, originalName, duplicate: true, duplicateKind: "content", existingName: sameContent.originalName, id: sameContent.id });
        continue;
      }
      sameContent.duplicateNameConflicts = Array.from(new Set([...(sameContent.duplicateNameConflicts ?? []), originalName])).filter((name) => name !== sameContent.originalName);
      sameContent.duplicate = true;
      saveState();
      results.push({ ok: true, originalName, duplicate: true, savedAlias: true, duplicateKind: "content", existingName: sameContent.originalName, id: sameContent.id });
      continue;
    }
    if (sameName && req.headers["x-allow-duplicate"] !== "true") {
      results.push({ ok: false, originalName, duplicate: true, duplicateKind: "name", existingName: sameName.originalName, id: sameName.id });
      continue;
    }
    const isVideo = /\.(mp4|mov|webm)$/i.test(originalName);
    const item: MediaItem = { id: makeId("m"), originalName, type: isVideo ? "video" : "image", thumbUrl: "", fileUrl: "", mime: file?.mimetype ?? (isVideo ? "video/mp4" : "image/jpeg"), size: bytes?.length ?? 0, favourite: false, tags: [], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date().toISOString(), sha256 };
    if (sameName) { item.duplicate = true; sameName.duplicate = true; }
    try {
      if (bytes) {
        let thumbnail: Buffer | undefined;
        if (item.type === "image") {
          try { thumbnail = await sharp(bytes).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(); }
          catch { thumbnail = undefined; }
        }
        await writeEncryptedMedia(item, bytes, thumbnail);
      }
      media.unshift(item);
      saveState();
    } catch (error) {
      await removeMediaFiles(item).catch(() => undefined);
      results.push({ ok: false, originalName, error: error instanceof Error ? error.message : "The file could not be secured." });
      continue;
    }
    results.push({ ok: true, originalName, duplicate: false, id: item.id });
  }
  return res.json(results);
});

router.get("/media/:id/file", async (req, res) => {
  const item = media.find((candidate) => String(candidate.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: "Media not found" });
  const bytes = await readDecryptedMedia(item);
  if (!bytes) return res.status(404).json({ error: "Encrypted file is missing" });
  res.setHeader("Content-Type", item.mime);
  return res.send(bytes);
});

router.get("/media/:id/thumb", async (req, res) => {
  const item = media.find((candidate) => String(candidate.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: "Media not found" });
  const bytes = await readDecryptedThumbnail(item);
  if (!bytes) {
    const original = await readDecryptedMedia(item);
    if (!original) return res.status(404).json({ error: "Encrypted file is missing" });
    return res.type(item.mime).send(original);
  }
  return res.type("image/webp").send(bytes);
});

router.delete("/media", async (_req, res) => {
  const total = media.length;
  const toRemove = [...media];
  media.length = 0;
  for (const item of toRemove) {
    try {
      await removeMediaFiles(item);
    } catch {
      // ignore missing physical files
    }
  }
  for (const collection of collections) {
    collection.mediaIds = [];
    collection.itemCount = 0;
    collection.coverThumbUrl = null;
  }
  saveState();
  await flushState();
  return res.json({ deleted: total, total });
});

router.delete("/media/:id", async (req, res) => {
  const index = media.findIndex((item) => String(item.id) === String(req.params.id));
  if (index < 0) return res.status(404).json({ error: "Media not found" });
  const [removed] = media.splice(index, 1);
  if (removed) {
    try {
      await removeMediaFiles(removed);
    } catch {
      // ignore missing physical files
    }
    for (const collection of collections) {
      if (!Array.isArray(collection.mediaIds)) collection.mediaIds = [];
      collection.mediaIds = collection.mediaIds.filter((id) => String(id) !== String(removed.id));
      collection.itemCount = collection.mediaIds.length;
      collection.coverThumbUrl = media.find((item) => collection.mediaIds.some((id) => String(id) === String(item.id)))?.thumbUrl ?? null;
    }
  }
  saveState();
  await flushState();
  return res.status(204).send();
});

router.post("/media/:id/favourite", (req, res) => {
  const item = media.find((candidate) => String(candidate.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: "Media not found" });
  item.favourite = !item.favourite;
  saveState();
  return res.json(item);
});

router.post("/media/:id/tags", (req, res) => {
  const item = media.find((candidate) => String(candidate.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: "Media not found" });
  const previousTags = Array.isArray(item.tags) ? item.tags : [];
  item.tags = Array.from(new Set((Array.isArray(req.body?.tags) ? req.body.tags : []).map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean)));
  for (const tag of previousTags.filter((value) => !item.tags.includes(value))) {
    const collection = collections.find((entry) => entry.name?.toLowerCase() === tag);
    if (collection) {
      if (!Array.isArray(collection.mediaIds)) collection.mediaIds = [];
      collection.mediaIds = collection.mediaIds.filter((id) => String(id) !== String(item.id));
      collection.itemCount = collection.mediaIds.length;
    }
  }
  // Tags and collections are intentionally fused: each tag has a same-named collection.
  for (const tag of item.tags) {
    let collection = collections.find((entry) => entry.name?.toLowerCase() === tag);
    if (!collection) {
      collection = { id: makeId("c"), name: tag, itemCount: 0, coverThumbUrl: null, mediaIds: [] };
      collections.push(collection);
    }
    if (!Array.isArray(collection.mediaIds)) collection.mediaIds = [];
    if (!collection.mediaIds.some((id) => String(id) === String(item.id))) collection.mediaIds.push(item.id);
    collection.itemCount = collection.mediaIds.length;
  }
  for (const collection of collections) {
    if (!Array.isArray(collection.mediaIds)) collection.mediaIds = [];
    collection.itemCount = collection.mediaIds.length;
    collection.coverThumbUrl = media.find((entry) => collection.mediaIds.some((id) => String(id) === String(entry.id)))?.thumbUrl ?? null;
  }
  saveState();
  return res.json(item);
});

router.delete("/media/:id/tags/:tag", (req, res) => {
  const item = media.find((candidate) => String(candidate.id) === String(req.params.id));
  if (!item) return res.status(404).json({ error: "Media not found" });
  const tag = String(req.params.tag).toLowerCase();
  item.tags = (Array.isArray(item.tags) ? item.tags : []).filter((value) => value.toLowerCase() !== tag);
  const collection = collections.find((entry) => entry.name?.toLowerCase() === tag);
  if (collection) {
    if (!Array.isArray(collection.mediaIds)) collection.mediaIds = [];
    collection.mediaIds = collection.mediaIds.filter((id) => String(id) !== String(item.id));
    collection.itemCount = collection.mediaIds.length;
    collection.coverThumbUrl = media.find((entry) => collection.mediaIds.some((id) => String(id) === String(entry.id)))?.thumbUrl ?? null;
  }
  saveState();
  return res.json(item);
});

router.get("/tags", (_req, res) => {
  const tags = new Set(media.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])));
  const result = Array.from(tags).sort((a, b) => a.localeCompare(b)).map((name) => {
    const tagged = media.filter((item) => Array.isArray(item.tags) && item.tags.includes(name));
    const cover = tagged[0];
    return {
      name,
      count: tagged.length,
      coverThumbUrl: cover?.encPath ? signMedia(cover.id, "thumb") : cover?.thumbUrl ?? null,
    };
  });
  return res.json(result);
});

router.get("/tags/:name/media", (req, res) => {
  const name = String(req.params.name).toLowerCase();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 40)));
  const items = media.filter((item) => item.tags.some((tag) => tag.toLowerCase() === name));
  const pageItems = items.slice((page - 1) * limit, page * limit).map((item) => ({
    ...item,
    thumbUrl: item.encPath ? signMedia(item.id, "thumb") : item.thumbUrl,
    fileUrl: item.encPath ? signMedia(item.id, "file") : item.fileUrl,
  }));
  return res.json({ items: pageItems, total: items.length, page, limit });
});

router.delete("/tags/:name", (req, res) => {
  const name = String(req.params.name).toLowerCase();
  for (const item of media) item.tags = item.tags.filter((tag) => tag.toLowerCase() !== name);
  const index = collections.findIndex((entry) => entry.name.toLowerCase() === name);
  if (index >= 0) {
    const [deleted] = collections.splice(index, 1);
    for (const master of masterCollections) master.collectionIds = master.collectionIds.filter((id) => id !== deleted?.id);
  }
  saveState();
  return res.status(204).send();
});

router.get("/stats", (_req, res) => {
  res.json({ totalImages: media.filter((item) => item.type === "image").length, totalVideos: media.filter((item) => item.type === "video").length, favouritesCount: media.filter((item) => item.favourite).length, untaggedCount: media.filter((item) => item.tags.length === 0).length, collectionCount: collections.length, masterCount: masterCollections.length, storageUsed: media.reduce((sum, item) => sum + item.size, 0) });
});

router.get("/system/watcher", (_req, res) => res.json(getWatcherStatus()));
router.get("/system/health", (_req, res) => res.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()), watcher: getWatcherStatus().watching }));
router.post("/media/encrypt-all", async (_req, res) => {
  const encrypted = await encryptPlaintextSweep([process.env.MEDIA_DIR ?? "./media", process.env.WATCH_DIR ?? "./watch_inbox"]);
  return res.json({ encrypted });
});

router.get("/collections", (_req, res) => res.json(collections.map(collectionView)));
router.post("/collections", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (collections.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: "A collection with this name already exists" });
  const collection = { id: makeId("c"), name, itemCount: 0, coverThumbUrl: null, mediaIds: [] as string[] };
  collections.push(collection);
  saveState();
  return res.status(201).json(collectionView(collection));
});
router.delete("/collections/:id", (req, res) => {
  const index = collections.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Collection not found" });
  const [deleted] = collections.splice(index, 1);
  if (deleted) {
    for (const item of media) item.tags = item.tags.filter((tag) => tag.toLowerCase() !== deleted.name.toLowerCase());
    for (const master of masterCollections) master.collectionIds = master.collectionIds.filter((id) => id !== deleted.id);
  }
  saveState();
  return res.status(204).send();
});
router.post("/collections/:id/items", (req, res) => {
  const collection = collections.find((entry) => String(entry.id) === String(req.params.id));
  const item = media.find((entry) => String(entry.id) === String(req.body?.mediaId));
  if (!collection || !item) return res.status(404).json({ error: "Collection or media not found" });
  if (!collection.mediaIds.some((id) => String(id) === String(item.id))) collection.mediaIds.push(item.id);
  if (!item.tags.includes(collection.name.toLowerCase())) item.tags.push(collection.name.toLowerCase());
  item.hideFromMain = Boolean(req.body?.hideFromMain);
  collection.itemCount = collection.mediaIds.length;
  collection.coverThumbUrl = item.thumbUrl;
  saveState();
  return res.json(collectionView(collection));
});
router.delete("/collections/:id/items/:mediaId", (req, res) => {
  const collection = collections.find((entry) => String(entry.id) === String(req.params.id));
  const item = media.find((entry) => String(entry.id) === String(req.params.mediaId));
  if (!collection || !item) return res.status(404).json({ error: "Collection or media not found" });
  collection.mediaIds = collection.mediaIds.filter((id) => String(id) !== String(item.id));
  collection.itemCount = collection.mediaIds.length;
  item.tags = item.tags.filter((tag) => tag.toLowerCase() !== collection.name.toLowerCase());
  item.hideFromMain = false;
  saveState();
  return res.status(204).send();
});

router.get("/master-collections", (_req, res) => res.json(masterCollections));
router.post("/master-collections", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  const collection = { id: makeId("mc"), name, collectionIds: [] as string[] };
  masterCollections.push(collection);
  saveState();
  return res.status(201).json(collection);
});
router.delete("/master-collections/:id", (req, res) => {
  const index = masterCollections.findIndex((entry) => entry.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Master collection not found" });
  masterCollections.splice(index, 1);
  saveState();
  return res.status(204).send();
});
router.post("/master-collections/:id/collections/:collectionId", (req, res) => {
  const master = masterCollections.find((entry) => entry.id === req.params.id);
  const collection = collections.find((entry) => entry.id === req.params.collectionId);
  if (!master || !collection) return res.status(404).json({ error: "Master collection or collection not found" });
  if (!master.collectionIds.includes(collection.id)) master.collectionIds.push(collection.id);
  saveState();
  return res.json(master);
});
router.delete("/master-collections/:id/collections/:collectionId", (req, res) => {
  const master = masterCollections.find((entry) => entry.id === req.params.id);
  if (!master) return res.status(404).json({ error: "Master collection not found" });
  master.collectionIds = master.collectionIds.filter((id) => id !== req.params.collectionId);
  saveState();
  return res.status(204).send();
});

router.get("/bookmarks", (_req, res) => res.json(bookmarks));
router.post("/bookmarks", (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "URL is required" });
  const bookmark = { id: makeId("b"), url, order: bookmarks.length };
  bookmarks.push(bookmark);
  saveState();
  return res.status(201).json(bookmark);
});
router.put("/bookmarks/:id", (req, res) => {
  const bookmark = bookmarks.find((entry) => entry.id === req.params.id);
  const url = String(req.body?.url ?? "").trim();
  if (!bookmark || !url) return res.status(bookmark ? 400 : 404).json({ error: bookmark ? "URL is required" : "Bookmark not found" });
  bookmark.url = url;
  saveState();
  return res.json(bookmark);
});
router.delete("/bookmarks/:id", (req, res) => {
  const index = bookmarks.findIndex((entry) => entry.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Bookmark not found" });
  bookmarks.splice(index, 1);
  bookmarks.forEach((entry, order) => { entry.order = order; });
  saveState();
  return res.status(204).send();
});

const buildDuplicateGroups = () => {
  const groups: { id: string; kind: "content" | "name"; media: MediaItem[] }[] = [];
  const byName = new Map<string, MediaItem[]>();
  media.forEach((item) => {
    if (item.duplicateNameConflicts?.length) groups.push({ id: `content-${item.id}`, kind: "content", media: [item, ...item.duplicateNameConflicts.map((name) => ({ ...item, id: `${item.id}-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 6)}`, originalName: name }))] });
    const sameName = byName.get(item.originalName) ?? [];
    sameName.push(item);
    byName.set(item.originalName, sameName);
  });
  byName.forEach((items, name) => { if (items.length > 1) groups.push({ id: `name-${name}`, kind: "name", media: items }); });
  return groups;
};
router.get("/duplicates", (_req, res) => res.json(buildDuplicateGroups()));
router.post("/duplicates/scan", (_req, res) => res.json({ groups: buildDuplicateGroups().length }));
router.post("/duplicates/:id/resolve", async (req, res) => {
  const group = buildDuplicateGroups().find((candidate) => candidate.id === req.params.id);
  if (!group) return res.status(404).json({ error: "Duplicate group not found" });
  if (req.body?.action === "delete_others") {
    const keepId = String(req.body?.keepMediaId ?? "");
    if (!group.media.some((item) => item.id === keepId)) return res.status(400).json({ error: "Choose a file to keep" });
    for (const entry of group.media.filter((item) => item.id !== keepId)) {
      const original = media.find((item) => item.id === entry.id);
      if (original) { await removeMediaFiles(original); media.splice(media.indexOf(original), 1); }
    }
  }
  for (const entry of group.media) {
    const original = media.find((item) => item.id === entry.id || item.id === entry.id.split("-")[0]);
    if (original) { original.duplicate = false; original.duplicateNameConflicts = []; }
  }
  saveState();
  return res.json({ resolved: true });
});
async function processDecryptJob(job: NonNullable<ReturnType<typeof decryptJobs.get>>) {
  const resultPath = job.resultPath;
  if (!resultPath) throw new Error("Decrypt job is missing its output path.");
  job.status = "processing";
  job.done = 0;
  delete job.error;
  await persistDecryptJob(job);
  await fs.promises.mkdir(path.dirname(resultPath), { recursive: true });
  await fs.promises.rm(resultPath, { force: true });
  const selected = job.mediaIds !== undefined ? media.filter((item) => job.mediaIds?.includes(item.id)) : media.slice();
  const output = fs.createWriteStream(resultPath);
  const archive = archiver("zip", { zlib: { level: 6 } });
  const closed = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    (archive as unknown as NodeJS.EventEmitter).once("error", reject);
  });
  archive.pipe(output);
  for (const item of selected) {
    const bytes = await readDecryptedMedia(item);
    if (bytes) archive.append(bytes, { name: item.originalName });
    job.done += 1;
    await persistDecryptJob(job);
  }
  await archive.finalize();
  await closed;
  job.status = "done";
  await persistDecryptJob(job);
}

function enqueueDecryptJob(job: NonNullable<ReturnType<typeof decryptJobs.get>>) {
  void processDecryptJob(job).catch(async (error: unknown) => {
    job.status = "error";
    job.error = error instanceof Error ? error.message : "The archive could not be created.";
    await persistDecryptJob(job);
  });
}

function decryptJobResponse(job: NonNullable<ReturnType<typeof decryptJobs.get>>) {
  return { id: job.id, status: job.status, progress: { done: job.done, total: job.total }, done: job.done, total: job.total, ...(job.error ? { error: job.error } : {}) };
}

export function resumeDecryptJobs() {
  for (const job of decryptJobs.values()) {
    if (job.status === "queued" || job.status === "processing") enqueueDecryptJob(job);
  }
}

router.post("/decrypt/jobs", async (req, res) => {
  const hasRequestedIds = Array.isArray(req.body?.mediaIds);
  const requestedIds = hasRequestedIds ? req.body.mediaIds.map(String) : undefined;
  const view = String(req.body?.filter?.view ?? "all");
  const type = req.body?.filter?.type ? String(req.body.filter.type) : undefined;
  const search = String(req.body?.filter?.search ?? "").toLowerCase();
  const selected = hasRequestedIds
    ? media.filter((item) => requestedIds?.includes(item.id))
    : media.filter((item) => !item.hideFromMain && (!type || item.type === type) && (!search || item.originalName.toLowerCase().includes(search) || item.tags.some((tag) => tag.includes(search))) && (view !== "favourites" || item.favourite) && (view !== "untagged" || item.tags.length === 0));
  if (view === "new") selected.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (req.body?.format && req.body.format !== "zip") return res.status(400).json({ error: "Only ZIP exports are supported." });
  const id = makeId("job");
  const job = { id, status: "queued" as const, done: 0, total: selected.length, mediaIds: selected.map((item) => item.id), resultPath: path.resolve(process.env.DATA_DIR ?? ".data", `${id}.zip`) };
  decryptJobs.set(id, job);
  await persistDecryptJob(job);
  enqueueDecryptJob(job);
  return res.status(202).json(decryptJobResponse(job));
});
router.get("/decrypt/jobs/:id", (req, res) => {
  const job = decryptJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(decryptJobResponse(job));
});
router.get("/decrypt/jobs/:id/download", (req, res) => {
  const job = decryptJobs.get(req.params.id);
  if (!job || job.status !== "done" || !job.resultPath || !fs.existsSync(job.resultPath)) return res.status(404).json({ error: "Archive is not ready" });
  return res.download(job.resultPath, "uploader-pro-export.zip");
});

// ── pdf_converter Vault Import ─────────────────────────────────────────────
// Accepts an `uploader_export.zip` produced by pdf_converter "Export to Vault".
// Media lives in pics/<sha256>.enc (primary store) and Uploaded_Sessions/<session>/*.enc
// (session copies); every entry is a Fernet token under pdf_converter's key.
// Existing media with the same content OR the same name is overwritten in place,
// never skipped. Files referenced by file_map.json but absent from the archive
// are reported as "missing" instead of being counted as duplicates.

const PDF_CONV_PASSWORD = "Ahmed//08112003..";
const PDF_CONV_SALT = "antigravity_salt_123";
const _pdfKey = crypto.pbkdf2Sync(PDF_CONV_PASSWORD, PDF_CONV_SALT, 100000, 32, "sha256");

function decryptPdfFernet(enc: Buffer): Buffer {
  const sk = _pdfKey.subarray(0, 16);
  const ek = _pdfKey.subarray(16);
  const raw: Buffer = enc[0] === 0x80 ? enc : Buffer.from(enc.toString("ascii").trim(), "base64url");
  if (raw.length < 57 || raw[0] !== 0x80 || (raw.length - 57) % 16 !== 0) throw new Error("Bad Fernet token");
  const body = raw.subarray(0, -32);
  const sig = raw.subarray(-32);
  if (!crypto.timingSafeEqual(crypto.createHmac("sha256", sk).update(body).digest(), sig)) throw new Error("HMAC fail");
  // Fernet body layout: version(1) + timestamp(8) + IV(16) + ciphertext
  const dec = crypto.createDecipheriv("aes-128-cbc", ek, body.subarray(9, 25));
  return Buffer.concat([dec.update(body.subarray(25)), dec.final()]);
}

const importMultipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

router.post("/import/vault", importMultipart.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded." });
  let zip: AdmZip;
  try { zip = new AdmZip(file.buffer); }
  catch { return res.status(400).json({ error: "Cannot read ZIP." }); }

  const readJ = <T>(p: string): T | null => {
    const e = zip.getEntry(p); if (!e) return null;
    try { return JSON.parse(e.getData().toString("utf8")) as T; } catch { return null; }
  };

  const fileMap   = readJ<Record<string,string>>("file_map.json") ?? {};
  const tagsData  = readJ<Record<string,string[]>>("tags/tags.json") ?? {};
  const favSet    = new Set(readJ<string[]>("favourites.json") ?? []);
  const bkList    = readJ<string[]>("bookmarks.json") ?? [];
  type PC = { name: string; items: Array<{ filename: string; hide_from_main?: boolean }> };
  const pdfCols: PC[] = [];
  for (const e of zip.getEntries()) {
    if (!e.isDirectory && e.entryName.startsWith("collections/") && e.entryName.endsWith(".json")) {
      try { const c = JSON.parse(e.getData().toString("utf8")) as PC; if (c?.name && Array.isArray(c.items)) pdfCols.push(c); } catch { /**/ }
    }
  }

  // encFilename (e.g. "abc.enc") -> ZIP entry path inside Uploaded_Sessions/
  const encMap = new Map<string,string>();
  for (const e of zip.getEntries()) {
    if (!e.isDirectory && e.entryName.startsWith("Uploaded_Sessions/") && e.entryName.endsWith(".enc"))
      encMap.set(path.basename(e.entryName), e.entryName);
  }

  const MEXT = /\.(jpg|jpeg|png|webp|bmp|gif|jfif|heic|mp4|mov|webm)$/i;
  let imported = 0, skipped = 0, failed = 0, decErr = 0;
  const n2i = new Map<string, MediaItem>();

  for (const [encFn, origName] of Object.entries(fileMap)) {
    if (!MEXT.test(origName)) continue;
    const ep = encMap.get(encFn);
    if (!ep) { skipped++; continue; }
    const ee = zip.getEntry(ep);
    if (!ee) { failed++; continue; }

    let plain: Buffer;
    try { plain = decryptPdfFernet(ee.getData()); }
    catch { decErr++; try { plain = ee.getData(); } catch { failed++; continue; } }

    const sha256 = crypto.createHash("sha256").update(plain).digest("hex");
    const dup = media.find(m => m.sha256 === sha256);
    if (dup) { n2i.set(origName, dup); skipped++; continue; }

    try {
      const isVid = /\.(mp4|mov|webm)$/i.test(origName);
      const item: MediaItem = {
        id: makeId("m"), originalName: origName, type: isVid ? "video" : "image",
        thumbUrl: "", fileUrl: "", mime: isVid ? "video/mp4" : "image/jpeg",
        size: plain.length, favourite: favSet.has(origName),
        tags: (tagsData[origName] ?? []).map(t => t.trim()).filter(Boolean),
        hideFromMain: false, duplicate: false, lost: false,
        createdAt: new Date().toISOString(), sha256,
      };
      let thumb: Buffer | undefined;
      const te = zip.getEntry(`pics/${origName}`);
      if (te) { thumb = te.getData(); }
      else if (!isVid) {
        try { thumb = await sharp(plain).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(); }
        catch { thumb = undefined; }
      }
      await writeEncryptedMedia(item, plain, thumb);
      media.unshift(item); n2i.set(origName, item); imported++;
    } catch { failed++; }
  }

  // Tags
  for (const [on, tags] of Object.entries(tagsData)) {
    const item = n2i.get(on) ?? media.find(m => m.originalName === on);
    if (!item) continue;
    item.tags = Array.from(new Set([...item.tags, ...tags.map(t => t.trim()).filter(Boolean)]));
    for (const tag of item.tags) {
      let col = collections.find(c => c.name.toLowerCase() === tag.toLowerCase());
      if (!col) { col = { id: makeId("c"), name: tag, itemCount: 0, coverThumbUrl: null, mediaIds: [] }; collections.push(col); }
      if (!col.mediaIds.includes(item.id)) col.mediaIds.push(item.id);
      col.itemCount = col.mediaIds.length;
      if (item.thumbUrl) col.coverThumbUrl = item.thumbUrl;
    }
  }

  // Collections
  let colsAdded = 0;
  for (const pc of pdfCols) {
    let col = collections.find(c => c.name.toLowerCase() === pc.name.toLowerCase());
    if (!col) { col = { id: makeId("c"), name: pc.name, itemCount: 0, coverThumbUrl: null, mediaIds: [] }; collections.push(col); colsAdded++; }
    for (const ci of pc.items) {
      const item = n2i.get(ci.filename) ?? media.find(m => m.originalName === ci.filename);
      if (!item) continue;
      if (!col.mediaIds.includes(item.id)) col.mediaIds.push(item.id);
      if (ci.hide_from_main) item.hideFromMain = true;
      const tn = pc.name.toLowerCase();
      if (!item.tags.includes(tn)) item.tags.push(tn);
    }
    col.itemCount = col.mediaIds.length;
    const cover = media.find(m => col!.mediaIds.includes(m.id));
    if (cover?.thumbUrl) col.coverThumbUrl = cover.thumbUrl;
  }

  // Bookmarks
  let bkAdded = 0;
  for (const url of bkList) {
    if (!url || bookmarks.some(b => b.url === url)) continue;
    bookmarks.push({ id: makeId("b"), url, order: bookmarks.length }); bkAdded++;
  }

  saveState(); await flushState();
  return res.json({ ok: true, imported, skipped, failed, decryptErrors: decErr, collectionsImported: colsAdded, bookmarksImported: bkAdded,
    message: `Imported ${imported} media (${skipped} already present, ${failed} failed, ${decErr} decrypt errors). ${colsAdded} collections and ${bkAdded} bookmarks added.` });
});

export default router;
