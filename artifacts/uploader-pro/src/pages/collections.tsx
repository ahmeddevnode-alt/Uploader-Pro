import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListCollectionsQueryKey, useCreateCollection, useListCollections } from '@workspace/api-client-react';
import { ArrowUpRight, FolderHeart, Plus } from 'lucide-react';
import { PageHeading } from '@/components/uploader-shell';
import { useLayoutPreference, LayoutSwitcher } from '@/components/layout-preferences';
import type { LayoutMode } from '@/components/layout-preferences';
import type { Collection } from '@workspace/api-client-react';

export default function CollectionsPage() {
  const collections = useListCollections();
  const createCollection = useCreateCollection();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [layout, setLayout] = useLayoutPreference('collections');
  const create = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; createCollection.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(''); queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); } }); };
  return <div className="mx-auto max-w-[1180px]"><PageHeading eyebrow="Library" title="Collections with a pulse." description="Give the archive a little shape. Collections are lightweight ways to return to a feeling, a place, or a season." action={<div className="flex flex-wrap items-center gap-2"><LayoutSwitcher layout={layout} onChange={setLayout} /><form onSubmit={create} className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection name" className="h-10 w-44 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary sm:w-52" aria-label="New collection name" data-testid="input-collection-name" /><button disabled={createCollection.isPending} className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground hover:-translate-y-0.5 disabled:opacity-60" type="submit" aria-label="Create collection" data-testid="button-create-collection"><Plus size={17} /></button></form></div>} />
     {collections.isLoading ? <CollectionSkeleton /> : collections.isError ? <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-16 text-center"><p className="font-serif font-bold">Collections are out of reach.</p><button onClick={() => collections.refetch()} className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold" data-testid="button-retry-collections">Try again</button></div> : collections.data?.length ? (layout === 'list' ? <div className="flex flex-col gap-2 sm:gap-3">{collections.data.map((collection, index) => <CollectionCard key={collection.id} collection={collection} index={index} layout="list" />)}</div> : <div className={collectionGridClass(layout)}>{collections.data.map((collection, index) => <CollectionCard key={collection.id} collection={collection} index={index} layout={layout} />)}</div>) : <div className="vault-grid rounded-2xl border border-dashed border-border px-6 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><FolderHeart size={24} /></div><h3 className="mt-5 font-serif text-lg font-bold">Start with a feeling</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Create a collection above to give your favourite places and people a home.</p></div>}
  </div>;
}

function CollectionSkeleton() { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="shimmer aspect-[1.7]" /><div className="space-y-2 p-4"><div className="shimmer h-4 w-2/3 rounded" /><div className="shimmer h-3 w-1/3 rounded" /></div></div>)}</div>; }

function collectionGridClass(layout: LayoutMode) {
  switch (layout) {
    case 'list': return 'flex flex-col gap-2 sm:gap-3';
    case 'compact': return 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
    case 'details': return 'grid grid-cols-1 gap-4 lg:grid-cols-2';
    case 'comfortable': return 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
    default: return 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  }
}

function CollectionCard({ collection, index, layout }: { collection: Collection; index: number; layout: LayoutMode }) {
  const to = `/collections/${collection.id}`;
  const isCompact = layout === 'compact';
  const cover = collection.coverThumbUrl ? (
    <img src={collection.coverThumbUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
  ) : (
    <div className="vault-grid grid h-full place-items-center"><FolderHeart size={isCompact ? 22 : 34} className="text-primary/60" /></div>
  );

  // List: a compact row with thumb, name and count — great on mobile and for scanning.
  if (layout === 'list') {
    return (
      <Link href={to} className="vault-in group relative flex items-stretch overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary/40" style={{ animationDelay: `${index * 50}ms` }} data-testid={`card-collection-${collection.id}`}>
        <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-secondary sm:h-20 sm:w-20">{cover}</div>
        <div className="flex min-w-0 flex-1 flex-col justify-center p-3 pr-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate font-serif text-sm font-bold sm:text-base">{collection.name}</h2>
            <ArrowUpRight size={16} className="shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{collection.itemCount} items</p>
        </div>
      </Link>
    );
  }

  // Card grid (comfortable / compact / details).
  const isComfortable = layout === 'comfortable';
  const isDetails = layout === 'details';
  const aspect = isCompact ? 'aspect-square' : isDetails ? 'aspect-[1.5]' : 'aspect-[1.7]';
  const pad = isCompact ? 'p-2.5' : isDetails ? 'p-4' : 'p-4';
  const titleSize = isCompact ? 'text-sm' : isDetails ? 'text-base' : 'text-base';
  return (
    <Link href={to} className="vault-in group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-transform hover:-translate-y-1 hover:border-primary/40" style={{ animationDelay: `${index * 50}ms` }} data-testid={`card-collection-${collection.id}`}>
      <div className={`relative ${aspect} overflow-hidden bg-secondary`}>{cover}<div className="absolute inset-0 bg-gradient-to-t from-background/75 to-transparent" /><span className="absolute bottom-3 left-3 rounded-md bg-background/55 px-2 py-1 font-mono text-[10px] text-foreground backdrop-blur">{collection.itemCount} items</span><ArrowUpRight size={17} className="absolute bottom-3 right-3 text-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
      <div className={pad}><h2 className={`font-serif ${titleSize} font-bold`}>{collection.name}</h2><p className="mt-1 text-xs text-muted-foreground">Open collection</p></div>
    </Link>
  );
}
