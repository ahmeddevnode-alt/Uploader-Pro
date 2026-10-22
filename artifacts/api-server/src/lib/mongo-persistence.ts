import mongoose, { Schema } from "mongoose";

const recordSchema = new Schema(
  { _id: { type: String, required: true } },
  { strict: false, versionKey: false, minimize: false },
);
recordSchema.index({ sha256: 1 }, { unique: true, sparse: true });

const makeModel = (name: string, collection: string) =>
  mongoose.models[name] ?? mongoose.model(name, recordSchema, collection);

const MediaRecord = makeModel("UploaderMedia", "media");
const TagRecord = makeModel("UploaderTag", "tags");
const CollectionRecord = makeModel("UploaderCollection", "collections");
const MasterCollectionRecord = makeModel("UploaderMasterCollection", "masterCollections");
const BookmarkRecord = makeModel("UploaderBookmark", "bookmarks");
const DecryptJobRecord = makeModel("UploaderDecryptJob", "decryptJobs");

export type StoredState = {
  media: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  bookmarks: Record<string, unknown>[];
  masterCollections: Record<string, unknown>[];
};

export type StoredJob = {
  id: string;
  status: "queued" | "processing" | "done" | "error";
  done: number;
  total: number;
  resultPath?: string;
};

function fromDocument<T extends Record<string, unknown>>(document: Record<string, unknown>): T {
  const { _id, __v, ...data } = document;
  return { ...data, id: data.id ?? _id } as unknown as T;
}

async function replaceRecords(model: typeof MediaRecord, records: Record<string, unknown>[]) {
  if (records.length) {
    await model.bulkWrite(
      records.map((record) => ({
        replaceOne: {
          filter: { _id: String(record.id) },
          replacement: { ...record, _id: String(record.id) },
          upsert: true,
        },
      })),
      { ordered: true },
    );
  }
  await model.deleteMany({ _id: { $nin: records.map((record) => String(record.id)) } });
}

export async function connectMongo(uri: string) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
}

export async function loadVaultState(): Promise<StoredState> {
  const [media, collections, bookmarks, masterCollections] = await Promise.all([
    MediaRecord.find().lean(),
    CollectionRecord.find().lean(),
    BookmarkRecord.find().lean(),
    MasterCollectionRecord.find().lean(),
  ]);
  return {
    media: media.map((record) => fromDocument(record as Record<string, unknown>)),
    collections: collections.map((record) => fromDocument(record as Record<string, unknown>)),
    bookmarks: bookmarks.map((record) => fromDocument(record as Record<string, unknown>)),
    masterCollections: masterCollections.map((record) => fromDocument(record as Record<string, unknown>)),
  };
}

export async function saveVaultState(state: StoredState) {
  const tags = Array.from(
    new Set(state.media.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])).map(String)),
  ).map((name) => ({ id: name, name, createdAt: new Date().toISOString() }));
  await Promise.all([
    replaceRecords(MediaRecord, state.media),
    replaceRecords(CollectionRecord, state.collections),
    replaceRecords(MasterCollectionRecord, state.masterCollections),
    replaceRecords(BookmarkRecord, state.bookmarks),
    replaceRecords(TagRecord, tags),
  ]);
}

export async function loadDecryptJobs(): Promise<StoredJob[]> {
  const jobs = await DecryptJobRecord.find().lean();
  return jobs.map((record) => fromDocument(record as Record<string, unknown>) as StoredJob);
}

export async function saveDecryptJob(job: StoredJob) {
  await DecryptJobRecord.replaceOne(
    { _id: job.id },
    { ...job, _id: job.id },
    { upsert: true },
  );
}
