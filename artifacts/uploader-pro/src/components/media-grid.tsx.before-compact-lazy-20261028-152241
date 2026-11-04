import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListMediaQueryKey,
  getListTagsQueryKey,
  useDeleteMedia,
  useListTags,
  useSetMediaTags,
  useToggleFavourite,
} from "@workspace/api-client-react";
import type { Media } from "@workspace/api-client-react";
import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  Film,
  Heart,
  Maximize2,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { LayoutSwitcher } from "@/components/layout-preferences";
import type { LayoutMode } from "@/components/layout-preferences";

const formatSize = (size: number) =>
  size > 1_000_000_000
    ? `${(size / 1_000_000_000).toFixed(1)} GB`
    : `${(size / 1_000_000).toFixed(1)} MB`;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));

/** Distribute items into N columns in a stable, order-preserving way */
function distributeColumns(items: Media[], cols: number): Media[][] {
  const columns: Media[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => {
    columns[i % cols]!.push(item);
  });
  return columns;
}

export function MediaGrid({
  items,
  emptyTitle = "Nothing here yet",
  emptyCopy = "When media arrives, it will settle into this view.",
  layout = "comfortable",
}: {
  items: Media[];
  emptyTitle?: string;
  emptyCopy?: string;
  layout?: LayoutMode;
}) {
  if (!items.length)
    return (
      <div className="vault-grid rounded-2xl border border-dashed border-border px-6 py-20 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary">
          <Film size={23} />
        </div>
        <h3 className="mt-5 font-serif text-lg font-bold">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {emptyCopy}
        </p>
      </div>
    );

  // List: single column of compact rows. Comfortable on phones, scannable on desktop.
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-2 sm:gap-3">
        {items.map((media, idx) => (
          <MediaTile key={media.id} media={media} index={idx} layout="list" />
        ))}
      </div>
    );
  }

  // Compact: dense square thumbnails.
  if (layout === "compact") {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((media, idx) => (
          <MediaTile key={media.id} media={media} index={idx} layout="compact" />
        ))}
      </div>
    );
  }

  // Details: large cards with full metadata.
  if (layout === "details") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {items.map((media, idx) => (
          <MediaTile key={media.id} media={media} index={idx} layout="details" />
        ))}
      </div>
    );
  }

  // Comfortable (default): responsive masonry. One column on phones keeps the
  // rich card legible (fixes the cramped 2-col "desktop on mobile" look); the
  // 3/4/5 column tiers handle tablets and desktops.
  const cols3 = distributeColumns(items, 3);
  const cols4 = distributeColumns(items, 4);
  const cols5 = distributeColumns(items, 5);

  return (
    <>
      {/* 1-col layout: phones only */}
      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((media, idx) => (
          <MediaTile key={media.id} media={media} index={idx} />
        ))}
      </div>
      {/* 3-col layout: sm–lg */}
      <div className="hidden sm:flex lg:hidden gap-3">
        {cols3.map((col, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-3">
            {col.map((media, idx) => (
              <MediaTile key={media.id} media={media} index={ci + idx * 3} />
            ))}
          </div>
        ))}
      </div>
      {/* 4-col layout: lg–xl */}
      <div className="hidden lg:flex xl:hidden gap-3">
        {cols4.map((col, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-3">
            {col.map((media, idx) => (
              <MediaTile key={media.id} media={media} index={ci + idx * 4} />
            ))}
          </div>
        ))}
      </div>
      {/* 5-col layout: xl+ */}
      <div className="hidden xl:flex gap-3">
        {cols5.map((col, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-3">
            {col.map((media, idx) => (
              <MediaTile key={media.id} media={media} index={ci + idx * 5} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function TagEditorModal({
  media,
  open,
  onOpenChange,
  onUpdated,
}: {
  media: Media;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const setMediaTags = useSetMediaTags();
  const tagsQuery = useListTags();
  const [selectedTags, setSelectedTags] = useState<string[]>(media.tags || []);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedTags(media.tags || []);
      setSearch("");
      setHighlightedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, media.tags]);

  const cleanSearch = search.trim().toLowerCase();

  const allKnownTags = useMemo(() => {
    const fromApi = (tagsQuery.data || []).map((t) => t.name.toLowerCase());
    const fromMedia = selectedTags.map((t) => t.toLowerCase());
    return Array.from(new Set([...fromApi, ...fromMedia])).sort();
  }, [tagsQuery.data, selectedTags]);

  const filteredTags = useMemo(() => {
    if (!cleanSearch) return allKnownTags;
    return allKnownTags.filter((tag) => tag.includes(cleanSearch));
  }, [allKnownTags, cleanSearch]);

  const canCreate =
    Boolean(cleanSearch) &&
    !allKnownTags.some((tag) => tag.toLowerCase() === cleanSearch);

  const totalNavigable = filteredTags.length + (canCreate ? 1 : 0);

  // Reset highlight to 0 whenever search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Keep highlighted item visible
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(
      `[data-tag-index="${highlightedIndex}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const toggleTag = (tagName: string) => {
    const lower = tagName.trim().toLowerCase();
    if (!lower) return;
    setSelectedTags((prev) =>
      prev.includes(lower)
        ? prev.filter((t) => t !== lower)
        : [...prev, lower],
    );
  };

  const handleCreate = () => {
    if (!cleanSearch) return;
    if (!selectedTags.includes(cleanSearch)) {
      setSelectedTags((prev) => [...prev, cleanSearch]);
    }
    setSearch("");
    setHighlightedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalNavigable > 0) {
        setHighlightedIndex((prev) => (prev + 1) % totalNavigable);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalNavigable > 0) {
        setHighlightedIndex(
          (prev) => (prev - 1 + totalNavigable) % totalNavigable,
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex < filteredTags.length) {
        const target = filteredTags[highlightedIndex];
        if (target) toggleTag(target);
      } else if (canCreate) {
        handleCreate();
      }
    }
  };

  const handleSave = async () => {
    try {
      await setMediaTags.mutateAsync({
        id: media.id,
        data: { tags: selectedTags },
      });
      toast({
        title: "Tags updated",
        description: `Tags saved for "${media.originalName}".`,
      });
      onOpenChange(false);
      onUpdated();
    } catch {
      toast({
        title: "Failed to save tags",
        description: "An error occurred while updating tags.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Tag size={18} className="text-primary" />
            Edit tags
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            Manage tags for &ldquo;{media.originalName}&rdquo;
          </DialogDescription>
        </DialogHeader>

        {/* Selected tags chip bar */}
        <div className="flex flex-wrap gap-1.5 min-h-8 max-h-24 overflow-y-auto rounded-lg border border-border/60 bg-secondary/40 p-2">
          {selectedTags.length > 0 ? (
            selectedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="rounded-full p-0.5 hover:bg-primary/20 text-primary"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs italic text-muted-foreground">
              No tags applied yet. Search or create below.
            </span>
          )}
        </div>

        {/* Search input with keyboard hints */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tags or type a new one... (Enter to select)"
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            aria-label="Search or create tags"
          />
        </div>

        {/* Searchable tag list */}
        <div
          ref={listRef}
          className="max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 divide-y divide-border/40"
        >
          {filteredTags.map((tag, idx) => {
            const isSelected = selectedTags.includes(tag);
            const isHighlighted = idx === highlightedIndex;

            return (
              <button
                key={tag}
                type="button"
                data-tag-index={idx}
                onClick={() => toggleTag(tag)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                  isHighlighted ? "bg-accent text-accent-foreground" : "hover:bg-secondary/60"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Tag size={13} className="text-muted-foreground" />
                  {tag}
                </span>
                {isSelected ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-primary">
                    <Check size={14} /> Selected
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground opacity-60">
                    Click to add
                  </span>
                )}
              </button>
            );
          })}

          {/* Create new tag entry */}
          {canCreate && (
            <button
              type="button"
              data-tag-index={filteredTags.length}
              onClick={handleCreate}
              onMouseEnter={() => setHighlightedIndex(filteredTags.length)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-primary transition-colors ${
                highlightedIndex === filteredTags.length
                  ? "bg-primary/15"
                  : "hover:bg-primary/10"
              }`}
            >
              <span className="flex items-center gap-2">
                <Plus size={14} />
                Create new tag: &ldquo;{cleanSearch}&rdquo;
              </span>
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-mono">
                Enter
              </span>
            </button>
          )}

          {filteredTags.length === 0 && !canCreate && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No matching tags found. Type to create one.
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 mt-2">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Use <kbd className="rounded border bg-secondary px-1 font-mono text-[10px]">↑</kbd> <kbd className="rounded border bg-secondary px-1 font-mono text-[10px]">↓</kbd> to navigate, <kbd className="rounded border bg-secondary px-1 font-mono text-[10px]">Enter</kbd> to select
          </span>
          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={setMediaTags.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setMediaTags.isPending ? "Saving..." : "Save tags"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaTile({ media, index, layout = "comfortable" }: { media: Media; index: number; layout?: LayoutMode }) {
  const isList = layout === "list";
  const isCompact = layout === "compact";
  const isDetails = layout === "details";
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleFavourite = useToggleFavourite();
  const deleteMedia = useDeleteMedia();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateAll = () => {
    void queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListTagsQueryKey() });
  };

  const handleDeleteSingle = async () => {
    setIsDeleting(true);
    try {
      await deleteMedia.mutateAsync({ id: media.id });
      toast({
        title: "Media deleted",
        description: `"${media.originalName}" was permanently removed from vault.`,
      });
      setConfirmDelete(false);
      updateAll();
    } catch {
      toast({
        title: "Delete failed",
        description: "Could not delete this media item.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {isList ? (
        <article
          className="media-tile vault-in group relative flex items-stretch overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
          style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
          data-testid={`card-media-${media.id}`}
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-secondary sm:h-20 sm:w-20">
            <button
              disabled={media.lost}
              onClick={() => setLightbox(true)}
              className="block h-full w-full disabled:cursor-not-allowed"
              aria-label={`Open ${media.originalName}`}
            >
              {media.type === "video" ? (
                <video
                  src={media.fileUrl}
                  poster={media.thumbUrl || undefined}
                  muted
                  loop
                  playsInline
                  preload="none"
                  className={`h-full w-full object-cover ${media.lost ? "opacity-50 grayscale" : ""}`}
                />
              ) : media.thumbUrl ? (
                <img
                  src={media.thumbUrl}
                  alt={media.originalName}
                  className={`h-full w-full object-cover ${media.lost ? "opacity-50 grayscale" : ""}`}
                  loading="lazy"
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground">
                  <Film size={20} />
                </span>
              )}
            </button>
            {media.type === "video" && (
              <span className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded bg-background/75 text-foreground backdrop-blur">
                <Play size={10} fill="currentColor" />
              </span>
            )}
            {media.lost && (
              <span className="absolute left-1 top-1 rounded bg-destructive px-1 py-0.5 font-mono text-[8px] font-bold text-white">
                LOST
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center p-3">
            <div className="flex items-start justify-between gap-2">
              <p
                className="truncate text-xs font-bold text-foreground sm:text-sm"
                title={media.originalName}
                data-testid={`text-media-name-${media.id}`}
              >
                {media.originalName}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() =>
                    toggleFavourite.mutate({ id: media.id }, { onSuccess: updateAll })
                  }
                  className={`grid h-7 w-7 place-items-center rounded-full backdrop-blur transition-all ${
                    media.favourite
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/65 text-foreground hover:bg-secondary"
                  }`}
                  aria-label={media.favourite ? "Remove from favourites" : "Add to favourites"}
                  data-testid={`button-favourite-${media.id}`}
                >
                  <Heart size={14} fill={media.favourite ? "currentColor" : "none"} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-full bg-background/65 text-foreground hover:bg-secondary"
                      aria-label="Media actions"
                      data-testid={`button-media-menu-${media.id}`}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 z-50">
                    <DropdownMenuItem
                      onClick={() => setTagModalOpen(true)}
                      className="flex items-center gap-2 cursor-pointer text-xs"
                      data-testid={`button-tag-media-${media.id}`}
                    >
                      <Tag size={13} className="text-muted-foreground" />
                      Edit tags
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      asChild
                      className="flex items-center gap-2 cursor-pointer text-xs"
                    >
                      <a href={media.fileUrl} download={media.originalName}>
                        <ArrowDownToLine size={13} className="text-muted-foreground" />
                        Download
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-2 cursor-pointer text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
                      data-testid={`button-delete-media-${media.id}`}
                    >
                      <Trash2 size={13} />
                      Delete media
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
              <span>{formatSize(media.size)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(media.createdAt)}</span>
            </div>
            {media.tags.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {media.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent"
                  >
                    {tag}
                  </span>
                ))}
                {media.tags.length > 4 ? (
                  <span className="text-[9px] text-muted-foreground">
                    +{media.tags.length - 4}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 text-[10px] italic text-muted-foreground/60">No tags</p>
            )}
          </div>
        </article>
      ) : (
      <article
        className="media-tile vault-in group relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm"
        style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
        data-testid={`card-media-${media.id}`}
      >
        <div className="relative overflow-hidden bg-secondary">
          {media.type === "video" ? (
            <button
              disabled={media.lost}
              onClick={() => setLightbox(true)}
              onMouseEnter={(event) => {
                void event.currentTarget
                  .querySelector("video")
                  ?.play()
                  .catch(() => undefined);
              }}
              onMouseLeave={(event) => {
                const video = event.currentTarget.querySelector("video");
                if (video) {
                  video.pause();
                  video.currentTime = 0;
                }
              }}
              className="block w-full disabled:cursor-not-allowed"
              aria-label={`Preview ${media.originalName}`}
            >
              <video
                src={media.fileUrl}
                poster={media.thumbUrl || undefined}
                muted
                loop
                playsInline
                preload="none"
                className={`${isCompact ? "aspect-square" : "aspect-[4/3]"} ${isDetails ? "max-h-[560px]" : "max-h-[420px]"} w-full object-cover ${
                  media.lost ? "opacity-50 grayscale" : ""
                }`}
              />
            </button>
          ) : media.thumbUrl ? (
            <button
              disabled={media.lost}
              onClick={() => setLightbox(true)}
              className="block w-full disabled:cursor-not-allowed"
              aria-label={`Open ${media.originalName}`}
            >
              <img
                src={media.thumbUrl}
                alt={media.originalName}
                className={`${isCompact ? "aspect-square" : "h-auto"} ${isDetails ? "max-h-[560px]" : "max-h-[420px]"} w-full object-cover ${
                  media.lost ? "opacity-50 grayscale" : ""
                }`}
                loading="lazy"
              />
            </button>
          ) : (
            <button
              disabled={media.lost}
              onClick={() => setLightbox(true)}
              className="grid min-h-36 w-full place-items-center text-muted-foreground"
            >
              <Film size={25} />
            </button>
          )}

          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/75 via-transparent to-background/10 opacity-0 transition-opacity group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100" />

          {/* Badges */}
          <div className="absolute left-2.5 top-2.5 flex gap-1.5 pointer-events-none">
            <span className="rounded-md bg-emerald-600/90 px-1.5 py-1 font-mono text-[9px] font-bold text-white">
              SECURED
            </span>
            {media.hideFromMain && (
              <span className="rounded-md bg-blue-600/90 px-1.5 py-1 font-mono text-[9px] font-bold text-white">
                HIDDEN
              </span>
            )}
            {media.lost && (
              <span className="rounded-md bg-destructive px-1.5 py-1 font-mono text-[9px] font-bold text-white">
                LOST
              </span>
            )}
            {media.type === "video" && (
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-background/75 text-foreground backdrop-blur">
                <Play size={12} fill="currentColor" />
              </span>
            )}
            {media.duplicate && (
              <span className="rounded-md bg-destructive/90 px-1.5 py-1 font-mono text-[9px] font-bold text-destructive-foreground">
                DUP
              </span>
            )}
          </div>

          {/* Favourite Button */}
          <button
            onClick={() =>
              toggleFavourite.mutate(
                { id: media.id },
                { onSuccess: updateAll },
              )
            }
            className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition-all ${
              media.favourite
                ? "bg-primary text-primary-foreground"
                : "bg-background/65 text-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            }`}
            aria-label={
              media.favourite ? "Remove from favourites" : "Add to favourites"
            }
            data-testid={`button-favourite-${media.id}`}
          >
            <Heart size={15} fill={media.favourite ? "currentColor" : "none"} />
          </button>

          {media.type === "video" && (
            <span className="absolute bottom-2.5 left-2.5 rounded-md bg-background/70 px-1.5 py-1 font-mono text-[10px] text-foreground backdrop-blur">
              VIDEO
            </span>
          )}

          {/* Three-dot menu portaled outside the card */}
          <div className="absolute bottom-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-lg bg-background/80 text-foreground opacity-100 sm:opacity-0 backdrop-blur transition-opacity sm:group-hover:opacity-100 hover:bg-background shadow"
                  aria-label="Media actions"
                  data-testid={`button-media-menu-${media.id}`}
                >
                  <MoreHorizontal size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 z-50">
                <DropdownMenuItem
                  onClick={() => setTagModalOpen(true)}
                  className="flex items-center gap-2 cursor-pointer text-xs"
                  data-testid={`button-tag-media-${media.id}`}
                >
                  <Tag size={13} className="text-muted-foreground" />
                  Edit tags
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  <a href={media.fileUrl} download={media.originalName}>
                    <ArrowDownToLine size={13} className="text-muted-foreground" />
                    Download
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 cursor-pointer text-xs text-destructive focus:bg-destructive/10 focus:text-destructive"
                  data-testid={`button-delete-media-${media.id}`}
                >
                  <Trash2 size={13} />
                  Delete media
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className={isCompact ? "p-2" : "p-3"}>
          <div className="flex items-start justify-between gap-2">
            <p
              className="truncate text-xs font-bold text-foreground"
              title={media.originalName}
              data-testid={`text-media-name-${media.id}`}
            >
              {media.originalName}
            </p>
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
              {formatSize(media.size)}
            </span>
          </div>
          {isCompact ? null : (
            <>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatDate(media.createdAt)}
              </p>
              {media.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1 overflow-hidden">
                  {(isDetails ? media.tags : media.tags.slice(0, 2)).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[10px] italic text-muted-foreground/60">
                  No tags
                </p>
              )}
            </>
          )}
        </div>
      </article>
      )}

      {/* Edit Tags Modal */}
      <TagEditorModal
        media={media}
        open={tagModalOpen}
        onOpenChange={setTagModalOpen}
        onUpdated={updateAll}
      />

      {/* Single Media Delete Confirmation Dialog */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 shrink-0 text-destructive"
                size={20}
              />
              <div>
                <AlertDialogTitle>Delete this media?</AlertDialogTitle>
                <AlertDialogDescription className="mt-2 text-xs leading-5">
                  This permanently removes &ldquo;{media.originalName}&rdquo; from
                  disk and MongoDB vault records. This action cannot be undone.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteSingle();
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              data-testid={`button-confirm-delete-${media.id}`}
            >
              {isDeleting ? "Deleting..." : "Delete media"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={media.originalName}
          onClick={() => setLightbox(false)}
        >
          <header className="flex items-center gap-3 text-white">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {media.originalName}
            </p>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setZoom((value) => Math.max(0.5, value - 0.25));
              }}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Zoom out"
            >
              <ZoomOut size={17} />
            </button>
            <span className="w-10 text-center text-xs">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setZoom((value) => Math.min(5, value + 0.25));
              }}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Zoom in"
            >
              <ZoomIn size={17} />
            </button>
            <a
              href={media.fileUrl}
              download={media.originalName}
              onClick={(event) => event.stopPropagation()}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Download"
            >
              <ArrowDownToLine size={17} />
            </a>
            <button
              onClick={() => setLightbox(false)}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </header>
          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto"
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) =>
              setZoom((value) =>
                Math.max(0.5, Math.min(5, value + (event.deltaY < 0 ? 0.1 : -0.1))),
              )
            }
          >
            {media.type === "video" ? (
              <video
                src={media.fileUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg"
                style={{ transform: `scale(${zoom})` }}
              />
            ) : (
              <img
                src={media.fileUrl}
                alt={media.originalName}
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `scale(${zoom})` }}
              />
            )}
          </div>
          <span className="sr-only">
            <Maximize2 size={1} />
          </span>
        </div>
      )}
    </>
  );
}

export function MediaToolbar({
  count,
  onSearch,
  filter,
  setFilter,
  layout = "comfortable",
  onLayoutChange,
}: {
  count: number;
  onSearch?: (value: string) => void;
  filter?: string;
  setFilter?: (value: string) => void;
  layout?: LayoutMode;
  onLayoutChange?: (mode: LayoutMode) => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted-foreground">
        <span className="text-foreground">{count}</span> items secured
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onLayoutChange ? (
          <LayoutSwitcher layout={layout} onChange={onLayoutChange} />
        ) : null}
        {onSearch ? (
          <input
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter by name..."
            className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none focus:border-primary sm:w-48"
            aria-label="Filter media"
            data-testid="input-filter-media"
          />
        ) : null}
        {setFilter ? (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none"
            aria-label="Sort media"
            data-testid="select-media-sort"
          >
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        ) : null}
      </div>
    </div>
  );
}