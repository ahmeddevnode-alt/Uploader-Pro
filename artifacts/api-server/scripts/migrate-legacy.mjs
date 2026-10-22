import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mongoose, { Schema } from "mongoose";
import sharp from "sharp";
import { Storage } from "@google-cloud/storage";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const legacyDir = valueAfter("--legacy-dir");
const reportPath = path.resolve(valueAfter("--report") ?? "import-report.json");
const mongoUri = process.env.MONGO_URI;
const password = process.env.FERNET_PASSWORD ?? process.env.APP_PASSWORD;
const salt = process.env.FERNET_SALT ?? "antigravity_salt_123";
if (!legacyDir || !mongoUri || !password) {
  throw new Error("Usage: MONGO_URI=... FERNET_PASSWORD=... node artifacts/api-server/scripts/migrate-legacy.mjs --legacy-dir <folder> [--report <path>]");
}

const root = path.resolve(legacyDir);
await fs.access(root);
const key = crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256");

function decodeFernet(encoded) {
  const raw = encoded[0] === 0x80 ? encoded : Buffer.from(encoded.toString("ascii").trim(), "base64url");
  if (raw.length < 57 || raw[0] !== 0x80 || (raw.length - 57) % 16 !== 0) throw new Error("Invalid Fernet token");
  const body = raw.subarray(0, -32);
  const signature = raw.subarray(-32);
  const expected = crypto.createHmac("sha256", key.subarray(0, 16)).update(body).digest();
  if (!crypto.timingSafeEqual(expected, signature)) throw new Error("Fernet signature mismatch");
  const decipher = crypto.createDecipheriv("aes-128-cbc", key.subarray(16), body.subarray(25, 41));
  return Buffer.concat([decipher.update(body.subarray(41)), decipher.final()]);
}

function encodeFernet(plain) {
  const iv = crypto.randomBytes(16);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const cipher = crypto.createCipheriv("aes-128-cbc", key.subarray(16), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const body = Buffer.concat([Buffer.from([0x80]), timestamp, iv, ciphertext]);
  const signature = crypto.createHmac("sha256", key.subarray(0, 16)).update(body).digest();
  return Buffer.from(Buffer.concat([body, signature]).toString("base64url"));
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(root, file), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function walk(directory) {
  const files = [];
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".enc")) files.push(full);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  return files;
}

const recordSchema = new Schema({ _id: { type: String, required: true } }, { strict: false, versionKey: false, minimize: false });
recordSchema.index({ sha256: 1 }, { unique: true, sparse: true });
const model = (name, collection) => mongoose.models[name] ?? mongoose.model(name, recordSchema, collection);
const Media = model("UploaderMedia", "media");
const Tag = model("UploaderTag", "tags");
const Collection = model("UploaderCollection", "collections");
const MasterCollection = model("UploaderMasterCollection", "masterCollections");
const Bookmark = model("UploaderBookmark", "bookmarks");

const mediaDir = path.resolve(process.env.MEDIA_DIR ?? "./media");
const privateDir = String(process.env.PRIVATE_OBJECT_DIR ?? "").replace(/^\/+|\/+$/g, "");
const appStorage = Boolean(privateDir);
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: "http://127.0.0.1:1106/token",
    type: "external_account",
    credential_source: {
      url: "http://127.0.0.1:1106/credential",
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function storeCiphertext(ciphertext, name) {
  if (!appStorage) {
    await fs.mkdir(mediaDir, { recursive: true });
    const target = path.join(mediaDir, name);
    await fs.writeFile(target, ciphertext);
    return target;
  }
  const [bucketName, ...prefixParts] = privateDir.split("/");
  const objectName = [...prefixParts, "uploader-media", name].filter(Boolean).join("/");
  await storage.bucket(bucketName).file(objectName).save(ciphertext, {
    resumable: false,
    metadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
  });
  return `/objects/uploader-media/${name}`;
}

await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
const report = {
  importedMedia: 0,
  skippedExisting: 0,
  failedToDecrypt: [],
  unmatchedTags: [],
  unmatchedCollectionItems: [],
  duplicateNameCollisions: [],
  contentNameAliases: [],
  importedTags: 0,
  importedCollections: 0,
  importedMasterCollections: 0,
  importedFavourites: 0,
  importedBookmarks: 0,
};

try {
  const fileMap = await readJson("file_map.json", {});
  const favouriteNames = new Set(await readJson("favourites.json", []));
  const tagData = await readJson("tags/tags.json", { tags: {}, file_tags: {} });
  const bookmarkData = await readJson("bookmarks.json", []);
  const legacyCollections = [];
  const collectionsDir = path.join(root, "collections");
  try {
    for (const entry of await fs.readdir(collectionsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^col_.*\.json$/i.test(entry.name)) continue;
      legacyCollections.push(await readJson(path.join("collections", entry.name), null));
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const masterData = await readJson("collections/master_collections.json", []);

  const encryptedFiles = [
    ...await walk(path.join(root, "pics")),
    ...await walk(path.join(root, "Uploaded_Sessions")),
  ];
  const mediaByName = new Map();
  const mediaByHash = new Map();

  for (const filePath of encryptedFiles) {
    try {
      const encrypted = await fs.readFile(filePath);
      const plain = decodeFernet(encrypted);
      const sha256 = crypto.createHash("sha256").update(plain).digest("hex");
      const legacyHash = path.basename(filePath, ".enc");
      const mappedName = fileMap[`${legacyHash}.enc`] ?? fileMap[legacyHash] ?? fileMap[`${sha256}.enc`] ?? fileMap[sha256];
      const originalName = path.basename(String(mappedName ?? legacyHash));
      const sessionRoot = path.join(root, "Uploaded_Sessions") + path.sep;
      const importedFrom = filePath.startsWith(sessionRoot) ? path.relative(path.join(root, "Uploaded_Sessions"), path.dirname(filePath)).split(path.sep)[0] : undefined;
      const existing = await Media.findOne({ sha256 }).lean();
      if (existing) {
        const id = String(existing.id ?? existing._id);
        const names = new Set([...(existing.duplicateNameConflicts ?? []), originalName]);
        names.delete(existing.originalName);
        await Media.updateOne({ _id: id }, { $set: { duplicateNameConflicts: [...names], duplicate: names.size > 0 } });
        if (originalName !== existing.originalName) report.contentNameAliases.push({ sha256, names: [existing.originalName, ...names] });
        mediaByHash.set(sha256, { ...existing, id, originalName: existing.originalName, duplicateNameConflicts: [...names] });
        mediaByName.set(originalName, mediaByHash.get(sha256));
        report.skippedExisting += 1;
        continue;
      }
      const id = `legacy-${sha256}`;
      const extension = path.extname(originalName).toLowerCase();
      const type = /\.(mp4|mov|webm)$/.test(extension) ? "video" : "image";
      let thumbEncPath;
      if (type === "image") {
        try {
          const thumbnail = await sharp(plain).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
          thumbEncPath = await storeCiphertext(encodeFernet(thumbnail), `${sha256}-thumb.enc`);
        } catch { /* Legacy media remains importable even if a thumbnail cannot be generated. */ }
      }
      const encPath = await storeCiphertext(encrypted, `${sha256}.enc`);
      const record = {
        _id: id, id, sha256, originalName, type,
        thumbUrl: "", fileUrl: "", encPath, thumbEncPath,
        mime: type === "video" ? "video/mp4" : "image/jpeg",
        size: plain.length, favourite: favouriteNames.has(originalName),
        tags: [], hideFromMain: false, duplicate: false, lost: false,
        createdAt: (await fs.stat(filePath)).mtime.toISOString(),
        ...(importedFrom ? { importedFrom } : {}),
        legacyId: legacyHash,
      };
      await Media.create(record);
      mediaByHash.set(sha256, record);
      mediaByName.set(originalName, record);
      if (record.favourite) report.importedFavourites += 1;
      report.importedMedia += 1;
    } catch (error) {
      report.failedToDecrypt.push({ file: path.relative(root, filePath), error: error instanceof Error ? error.message : String(error) });
    }
  }

  for (const [tagName, filenames] of Object.entries(tagData.tags ?? {})) {
    for (const filename of Array.isArray(filenames) ? filenames : []) {
      const item = mediaByName.get(path.basename(String(filename)));
      if (!item) { report.unmatchedTags.push({ tag: tagName, file: filename }); continue; }
      item.tags = Array.from(new Set([...(item.tags ?? []), String(tagName).toLowerCase()]));
      await Media.updateOne({ _id: item.id }, { $set: { tags: item.tags } });
    }
  }
  for (const [filename, names] of Object.entries(tagData.file_tags ?? {})) {
    const item = mediaByName.get(path.basename(filename));
    if (!item) {
      for (const tagName of Array.isArray(names) ? names : []) report.unmatchedTags.push({ tag: tagName, file: filename });
      continue;
    }
    item.tags = Array.from(new Set([...(item.tags ?? []), ...(Array.isArray(names) ? names.map((tag) => String(tag).toLowerCase()) : [])]));
    await Media.updateOne({ _id: item.id }, { $set: { tags: item.tags } });
  }

  const collectionIds = new Map();
  const collectionDocs = [];
  for (const legacy of legacyCollections.filter(Boolean)) {
    const name = String(legacy.name ?? "Imported collection");
    const id = String(legacy.id ?? `legacy-collection-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 12)}`);
    const items = [];
    for (const entry of legacy.items ?? []) {
      const item = mediaByName.get(path.basename(String(entry.filename ?? "")));
      if (!item) { report.unmatchedCollectionItems.push({ collection: name, file: entry.filename }); continue; }
      if (!items.includes(item.id)) items.push(item.id);
      item.tags = Array.from(new Set([...(item.tags ?? []), name.toLowerCase()]));
      if (entry.hide_from_main) item.hideFromMain = true;
      await Media.updateOne({ _id: item.id }, { $set: { tags: item.tags, hideFromMain: item.hideFromMain } });
    }
    const doc = { _id: id, id, name, legacyId: id, itemCount: items.length, mediaIds: items, coverThumbUrl: null, createdAt: legacy.created_at ?? new Date().toISOString() };
    collectionDocs.push(doc);
    collectionIds.set(id, id);
    report.importedCollections += 1;
  }
  const knownCollectionNames = new Set(collectionDocs.map((doc) => doc.name.toLowerCase()));
  const allTags = new Set();
  for (const item of mediaByHash.values()) {
    for (const tag of item.tags ?? []) {
      allTags.add(tag);
      if (!knownCollectionNames.has(tag)) {
        const id = `tag-${crypto.createHash("sha1").update(tag).digest("hex").slice(0, 12)}`;
        collectionDocs.push({ _id: id, id, name: tag, legacyId: id, itemCount: 0, mediaIds: [], coverThumbUrl: null, createdAt: new Date().toISOString() });
        knownCollectionNames.add(tag);
      }
    }
  }
  for (const doc of collectionDocs) {
    await Collection.replaceOne({ _id: doc._id }, doc, { upsert: true });
    report.importedCollections = Math.max(report.importedCollections, collectionDocs.length);
  }
  for (const tagName of allTags) {
    const id = `tag-${crypto.createHash("sha1").update(tagName).digest("hex").slice(0, 12)}`;
    await Tag.replaceOne({ _id: id }, { _id: id, id, name: tagName, fileCount: 0, createdAt: new Date().toISOString() }, { upsert: true });
    report.importedTags += 1;
  }
  for (const [name, sameName] of Object.groupBy([...mediaByHash.values()], (item) => item.originalName)) {
    const unique = [...new Set(sameName.map((item) => item.id))];
    if (unique.length > 1) {
      report.duplicateNameCollisions.push({ name, ids: unique });
      await Media.updateMany({ _id: { $in: unique } }, { $set: { duplicate: true } });
    }
  }

  const mappedMasters = (Array.isArray(masterData) ? masterData : []).map((master, index) => {
    const id = String(master.id ?? `legacy-master-${index + 1}`);
    const collectionIdsForMaster = (master.collection_ids ?? []).map((collectionId) => collectionIds.get(String(collectionId))).filter(Boolean);
    report.importedMasterCollections += 1;
    return { _id: id, id, name: String(master.name ?? "Imported group"), collectionIds: collectionIdsForMaster, legacyId: id, createdAt: master.created_at ?? new Date().toISOString() };
  });
  if (mappedMasters.length) {
    for (const doc of mappedMasters) await MasterCollection.replaceOne({ _id: doc._id }, doc, { upsert: true });
  }

  const existingBookmarks = Array.isArray(bookmarkData) ? bookmarkData : [];
  for (const [order, urlValue] of existingBookmarks.entries()) {
    const url = typeof urlValue === "string" ? urlValue : String(urlValue.url ?? "");
    if (!url) continue;
    const id = `legacy-bookmark-${crypto.createHash("sha1").update(`${order}:${url}`).digest("hex").slice(0, 12)}`;
    await Bookmark.replaceOne({ _id: id }, { _id: id, id, url, order, legacyId: id, createdAt: new Date().toISOString() }, { upsert: true });
    report.importedBookmarks += 1;
  }

  report.duplicateNameCollisions = Array.from(new Map(report.duplicateNameCollisions.map((item) => [item.name, item])).values());
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`Legacy import report written to ${reportPath}\n${JSON.stringify(report, null, 2)}\n`);
} finally {
  await mongoose.disconnect();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The script is intentionally executable as a standalone CLI.
}
