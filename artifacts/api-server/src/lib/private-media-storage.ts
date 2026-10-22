import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privatePrefix() {
  const parts = String(process.env.PRIVATE_OBJECT_DIR ?? "").replace(/^\/+|\/+$/g, "").split("/");
  const bucketName = parts.shift();
  if (!bucketName) throw new Error("Private App Storage is not configured.");
  return { bucketName, prefix: parts.filter(Boolean).join("/") };
}

function getObjectFile(objectPath: string) {
  if (!objectPath.startsWith("/objects/")) throw new Error("Invalid private media path.");
  const { bucketName, prefix } = privatePrefix();
  const entityPath = objectPath.slice("/objects/".length);
  const objectName = [prefix, entityPath].filter(Boolean).join("/");
  return storage.bucket(bucketName).file(objectName);
}

export function isAppStorageConfigured() {
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
}

export async function storeEncryptedObject(bytes: Buffer, fallbackPath: string) {
  if (!isAppStorageConfigured()) {
    await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
    await fs.writeFile(fallbackPath, bytes);
    return fallbackPath;
  }
  const objectPath = `/objects/uploader-media/${crypto.randomUUID()}.enc`;
  await getObjectFile(objectPath).save(bytes, {
    resumable: false,
    metadata: {
      contentType: "application/octet-stream",
      cacheControl: "private, no-store",
    },
  });
  return objectPath;
}

export async function readEncryptedObject(objectPath: string) {
  if (!objectPath.startsWith("/objects/")) return fs.readFile(objectPath);
  const [bytes] = await getObjectFile(objectPath).download();
  return bytes;
}

export async function deleteEncryptedObject(objectPath: string) {
  if (objectPath.startsWith("/objects/")) {
    await getObjectFile(objectPath).delete({ ignoreNotFound: true });
    return;
  }
  await fs.rm(objectPath, { force: true });
}
