import { Router, type IRouter } from "express";
import { collections, bookmarks, decryptJobs, media, type MediaItem } from "../lib/store";

const router: IRouter = Router();
const makeId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

router.post("/auth/login", (req, res) => {
  const password = String(req.body?.password ?? "");
  const expected = process.env.APP_PASSWORD ?? "Ahmed//08112003..";
  if (password !== expected) return res.status(401).json({ error: "That password is not correct." });
  return res.json({ token: "uploader-session", expiresIn: 43200 });
});

router.get("/media", (req, res) => {
  const view = String(req.query.view ?? "all");
  const type = req.query.type ? String(req.query.type) : undefined;
  const search = String(req.query.search ?? "").toLowerCase();
  let items = media.filter((item) => !type || item.type === type).filter((item) => !search || item.originalName.toLowerCase().includes(search) || item.tags.some((tag) => tag.includes(search)));
  if (view === "new") items = items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (view === "favourites") items = items.filter((item) => item.favourite);
  if (view === "untagged") items = items.filter((item) => item.tags.length === 0);
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 40)));
  return res.json({ items: items.slice((page - 1) * limit, page * limit), total: items.length, page, limit });
});

router.post("/media/upload", (req, res) => {
  const names = String(req.headers["x-original-filename"] ?? "uploaded-media.jpg").split(",").map((name) => name.trim()).filter(Boolean);
  const results = names.map((originalName) => {
    const duplicate = media.find((item) => item.originalName === originalName);
    if (duplicate) return { ok: true, originalName, duplicate: true, existingName: duplicate.originalName, id: duplicate.id };
    const isVideo = /\.(mp4|mov|webm)$/i.test(originalName);
    const item: MediaItem = { id: makeId("m"), originalName, type: isVideo ? "video" : "image", thumbUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1800&q=90", mime: isVideo ? "video/mp4" : "image/jpeg", size: 0, favourite: false, tags: [], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date().toISOString() };
    media.unshift(item);
    return { ok: true, originalName, duplicate: false, id: item.id };
  });
  return res.json(results);
});

router.delete("/media/:id", (req, res) => {
  const index = media.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Media not found" });
  media.splice(index, 1);
  return res.status(204).send();
});

router.post("/media/:id/favourite", (req, res) => {
  const item = media.find((candidate) => candidate.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Media not found" });
  item.favourite = !item.favourite;
  return res.json(item);
});

router.post("/media/:id/tags", (req, res) => {
  const item = media.find((candidate) => candidate.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Media not found" });
  item.tags = Array.from(new Set((Array.isArray(req.body?.tags) ? req.body.tags : []).map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean)));
  return res.json(item);
});

router.get("/stats", (_req, res) => {
  res.json({ totalImages: media.filter((item) => item.type === "image").length, totalVideos: media.filter((item) => item.type === "video").length, favouritesCount: media.filter((item) => item.favourite).length, untaggedCount: media.filter((item) => item.tags.length === 0).length, collectionCount: collections.length, masterCount: 0, storageUsed: media.reduce((sum, item) => sum + item.size, 0) });
});

router.get("/system/watcher", (_req, res) => res.json({ watching: true, dir: process.env.WATCH_DIR ?? "./watch_inbox", pending: 0, failed: 0, lastImportAt: new Date(Date.now() - 3600000).toISOString() }));
router.post("/media/encrypt-all", (_req, res) => res.json({ encrypted: 0 }));

router.get("/collections", (_req, res) => res.json(collections));
router.post("/collections", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  const collection = { id: makeId("c"), name, itemCount: 0, coverThumbUrl: null };
  collections.push(collection);
  return res.status(201).json(collection);
});
router.delete("/collections/:id", (req, res) => {
  const index = collections.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Collection not found" });
  collections.splice(index, 1);
  return res.status(204).send();
});

router.get("/bookmarks", (_req, res) => res.json(bookmarks));
router.post("/bookmarks", (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ error: "URL is required" });
  const bookmark = { id: makeId("b"), url, order: bookmarks.length };
  bookmarks.push(bookmark);
  return res.status(201).json(bookmark);
});

router.get("/duplicates", (_req, res) => res.json([]));
router.post("/duplicates/scan", (_req, res) => res.json({ groups: 0 }));
router.post("/decrypt/jobs", (req, res) => {
  const total = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds.length : media.length;
  const id = makeId("job");
  const job = { id, status: "processing" as const, done: 0, total };
  decryptJobs.set(id, job);
  const interval = setInterval(() => {
    const current = decryptJobs.get(id);
    if (!current) return clearInterval(interval);
    current.done = Math.min(current.total, current.done + Math.max(1, Math.ceil(current.total / 4)));
    if (current.done >= current.total) { current.status = "done"; clearInterval(interval); }
  }, 700);
  return res.status(202).json(job);
});
router.get("/decrypt/jobs/:id", (req, res) => {
  const job = decryptJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json(job);
});

export default router;