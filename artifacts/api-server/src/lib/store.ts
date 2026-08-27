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
};

export const media: MediaItem[] = [
  { id: "m1", originalName: "blue-hour.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1800&q=90", mime: "image/jpeg", size: 2840000, favourite: true, tags: ["travel", "landscape"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "m2", originalName: "studio-light.png", type: "image", thumbUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1800&q=90", mime: "image/jpeg", size: 1940000, favourite: false, tags: ["work"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: "m3", originalName: "quiet-morning.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1800&q=90", mime: "image/jpeg", size: 3420000, favourite: true, tags: ["personal"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 259200000).toISOString() },
  { id: "m4", originalName: "coastline.mov", type: "video", thumbUrl: "https://images.unsplash.com/photo-1507524887384-25b4e9f1c1a5?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1507524887384-25b4e9f1c1a5?w=1800&q=90", mime: "video/quicktime", size: 18400000, favourite: false, tags: ["travel"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 345600000).toISOString() },
  { id: "m5", originalName: "architecture.jpg", type: "image", thumbUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1800&q=90", mime: "image/jpeg", size: 4100000, favourite: false, tags: ["architecture"], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 432000000).toISOString() },
  { id: "m6", originalName: "film-notes.png", type: "image", thumbUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=700&q=80", fileUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=1800&q=90", mime: "image/jpeg", size: 2260000, favourite: false, tags: [], hideFromMain: false, duplicate: false, lost: false, createdAt: new Date(Date.now() - 518400000).toISOString() },
];

export const collections: { id: string; name: string; itemCount: number; coverThumbUrl: string | null }[] = [
  { id: "c1", name: "Travel", itemCount: 2, coverThumbUrl: media[0].thumbUrl },
  { id: "c2", name: "Work", itemCount: 1, coverThumbUrl: media[1].thumbUrl },
  { id: "c3", name: "Personal", itemCount: 1, coverThumbUrl: media[2].thumbUrl },
];

export const bookmarks = [
  { id: "b1", url: "https://www.are.na/", order: 0 },
  { id: "b2", url: "https://unsplash.com/", order: 1 },
];

export const decryptJobs = new Map<string, { id: string; status: "queued" | "processing" | "done" | "error"; done: number; total: number }>();