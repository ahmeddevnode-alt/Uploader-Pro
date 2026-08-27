import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListMediaQueryKey, useDeleteMedia, useSetMediaTags, useToggleFavourite } from '@workspace/api-client-react';
import type { Media } from '@workspace/api-client-react';
import { Check, Film, Heart, MoreHorizontal, Play, Tag, Trash2, X } from 'lucide-react';

const formatSize = (size: number) => size > 1_000_000_000 ? `${(size / 1_000_000_000).toFixed(1)} GB` : `${(size / 1_000_000).toFixed(1)} MB`;
const formatDate = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));

export function MediaGrid({ items, emptyTitle = 'Nothing here yet', emptyCopy = 'When media arrives, it will settle into this view.' }: { items: Media[]; emptyTitle?: string; emptyCopy?: string }) {
  if (!items.length) return <div className="vault-grid rounded-2xl border border-dashed border-border px-6 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><Film size={23} /></div><h3 className="mt-5 font-serif text-lg font-bold">{emptyTitle}</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{emptyCopy}</p></div>;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((media, index) => <MediaTile key={media.id} media={media} index={index} />)}</div>;
}

function MediaTile({ media, index }: { media: Media; index: number }) {
  const [menu, setMenu] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [tags, setTags] = useState(media.tags.join(', '));
  const toggleFavourite = useToggleFavourite();
  const deleteMedia = useDeleteMedia();
  const setMediaTags = useSetMediaTags();
  const queryClient = useQueryClient();
  const updateAll = () => queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
  const saveTags = () => setMediaTags.mutate({ id: media.id, data: { tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) } }, { onSuccess: () => { setTagging(false); updateAll(); } });
  return <article className="media-tile vault-in group relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }} data-testid={`card-media-${media.id}`}>
    <div className="relative aspect-[1.15] overflow-hidden bg-secondary">
      {media.thumbUrl ? <img src={media.thumbUrl} alt={media.originalName} className="h-full w-full object-cover" loading="lazy" /> : <div className="grid h-full place-items-center text-muted-foreground"><Film size={25} /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-background/10 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="absolute left-2.5 top-2.5 flex gap-1.5">{media.type === 'video' ? <span className="grid h-7 w-7 place-items-center rounded-lg bg-background/75 text-foreground backdrop-blur"><Play size={12} fill="currentColor" /></span> : null}{media.duplicate ? <span className="rounded-md bg-destructive/90 px-1.5 py-1 font-mono text-[9px] font-bold text-destructive-foreground">DUP</span> : null}</div>
      <button onClick={() => toggleFavourite.mutate({ id: media.id }, { onSuccess: updateAll })} className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition-all ${media.favourite ? 'bg-primary text-primary-foreground' : 'bg-background/65 text-foreground opacity-0 group-hover:opacity-100'}`} aria-label={media.favourite ? 'Remove from favourites' : 'Add to favourites'} data-testid={`button-favourite-${media.id}`}><Heart size={15} fill={media.favourite ? 'currentColor' : 'none'} /></button>
      {media.type === 'video' ? <span className="absolute bottom-2.5 left-2.5 rounded-md bg-background/70 px-1.5 py-1 font-mono text-[10px] text-foreground backdrop-blur">VIDEO</span> : null}
      <button onClick={() => setMenu(!menu)} className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-lg bg-background/75 text-foreground opacity-0 backdrop-blur group-hover:opacity-100" aria-label="Media actions" data-testid={`button-media-menu-${media.id}`}><MoreHorizontal size={15} /></button>
      {menu ? <div className="absolute bottom-10 right-2 z-10 w-40 rounded-xl border border-border bg-popover p-1.5 shadow-xl"><button onClick={() => { setTagging(true); setMenu(false); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-secondary" data-testid={`button-tag-media-${media.id}`}><Tag size={13} /> Edit tags</button><button onClick={() => { if (window.confirm('Remove this media from the vault?')) deleteMedia.mutate({ id: media.id }, { onSuccess: updateAll }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-destructive hover:bg-destructive/10" data-testid={`button-delete-media-${media.id}`}><Trash2 size={13} /> Delete media</button></div> : null}
    </div>
    <div className="p-3"><div className="flex items-start justify-between gap-2"><p className="truncate text-xs font-bold text-foreground" title={media.originalName} data-testid={`text-media-name-${media.id}`}>{media.originalName}</p><span className="shrink-0 font-mono text-[9px] text-muted-foreground">{formatSize(media.size)}</span></div><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(media.createdAt)}</p>{media.tags.length ? <div className="mt-2 flex gap-1 overflow-hidden">{media.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">{tag}</span>)}</div> : <p className="mt-2 text-[10px] italic text-muted-foreground/60">No tags</p>}</div>
    {tagging ? <div className="absolute inset-0 z-20 flex flex-col justify-end bg-background/95 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold">Edit tags</span><button onClick={() => setTagging(false)} className="text-muted-foreground" aria-label="Close tag editor" data-testid={`button-close-tags-${media.id}`}><X size={15} /></button></div><input autoFocus value={tags} onChange={(e) => setTags(e.target.value)} placeholder="travel, 2024" className="h-8 rounded-lg border border-input bg-secondary px-2 text-xs outline-none focus:border-primary" aria-label="Media tags" data-testid={`input-tags-${media.id}`} /><button onClick={saveTags} className="mt-2 flex h-8 items-center justify-center gap-1 rounded-lg bg-primary text-xs font-bold text-primary-foreground" data-testid={`button-save-tags-${media.id}`}><Check size={13} /> Save tags</button></div> : null}
  </article>;
}

export function MediaToolbar({ count, onSearch, filter, setFilter }: { count: number; onSearch?: (value: string) => void; filter?: string; setFilter?: (value: string) => void }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="font-mono text-[11px] uppercase tracking-[.12em] text-muted-foreground"><span className="text-foreground">{count}</span> items secured</div><div className="flex gap-2">{onSearch ? <input onChange={(e) => onSearch(e.target.value)} placeholder="Filter by name..." className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs outline-none focus:border-primary sm:w-48" aria-label="Filter media" data-testid="input-filter-media" /> : null}{setFilter ? <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground outline-none" aria-label="Sort media" data-testid="select-media-sort"><option value="recent">Most recent</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select> : null}</div></div>;
}