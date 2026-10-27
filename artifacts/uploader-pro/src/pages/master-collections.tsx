import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListCollectionsQueryKey, getListMasterCollectionsQueryKey, useAddCollectionToMaster, useCreateMasterCollection, useDeleteMasterCollection, useListCollections, useListMasterCollections, useRemoveCollectionFromMaster } from '@workspace/api-client-react';
import { FolderTree, Plus, Trash2, X } from 'lucide-react';
import { PageHeading } from '@/components/uploader-shell';
import { LayoutMode, LayoutSwitcher, useLayoutPreference } from '@/components/layout-preferences';

export default function MasterCollectionsPage() {
  const masters = useListMasterCollections();
  const collections = useListCollections();
  const create = useCreateMasterCollection();
  const remove = useDeleteMasterCollection();
  const attach = useAddCollectionToMaster();
  const detach = useRemoveCollectionFromMaster();
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const [layout, setLayout] = useLayoutPreference('master');
  const refresh = () => { void cache.invalidateQueries({ queryKey: getListMasterCollectionsQueryKey() }); void cache.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); };
  const onCreate = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; create.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(''); refresh(); } }); };
  return <div className="mx-auto max-w-[1180px]">
    <PageHeading eyebrow="Library" title="Collections, together." description="Group related collections into larger themes without moving or duplicating your media." action={<div className="flex flex-wrap items-center gap-2"><LayoutSwitcher layout={layout} onChange={setLayout} /><form onSubmit={onCreate} className="flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-44 rounded-xl border border-input bg-card px-3 text-xs" placeholder="New group name" aria-label="New master collection name" /><button className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground" aria-label="Create group"><Plus size={17} /></button></form></div>} />
    {masters.isLoading ? <p className="p-8 text-sm text-muted-foreground">Loading groups…</p> : masters.isError ? <button onClick={() => void masters.refetch()} className="rounded-lg border border-border px-4 py-2 text-xs">Retry</button> : masters.data?.length ? <div className={masterCollectionGridClass(layout)}>{masters.data.map((master) => {
      const children = collections.data?.filter((collection) => master.collectionIds.includes(collection.id)) ?? [];
      const unassigned = collections.data?.filter((collection) => !master.collectionIds.includes(collection.id)) ?? [];
      return <MasterCollectionCard
        key={master.id}
        master={master}
        collections={collections.data ?? []}
        layout={layout}
        onRemove={(id, collectionId) => void detach.mutate({ id, collectionId }, { onSuccess: refresh })}
        onAttach={(id, collectionId) => void attach.mutate({ id, collectionId }, { onSuccess: refresh })}
        onDetach={(id, collectionId) => void detach.mutate({ id, collectionId }, { onSuccess: refresh })}
        onDelete={() => void remove.mutate({ id: master.id }, { onSuccess: refresh })}
      />
    })}</div> : <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center"><FolderTree size={24} className="mx-auto text-primary" /><h2 className="mt-4 font-serif font-bold">No groups yet</h2><p className="mt-2 text-sm text-muted-foreground">Create a group, then add existing collections to it.</p></div>}
  </div>;
}

function masterCollectionGridClass(layout: LayoutMode) {
  switch (layout) {
    case 'list': return 'flex flex-col gap-5';
    case 'compact': return 'grid grid-cols-2 gap-3 sm:grid-cols-3';
    case 'details': return 'grid grid-cols-1 gap-6 lg:grid-cols-2';
    case 'comfortable': return 'grid gap-4 md:grid-cols-2';
    default: return 'grid gap-4 md:grid-cols-2';
  }
}

function MasterCollectionCard({ master, collections, layout, onRemove, onAttach, onDetach, onDelete }: {
  master: { id: string; name: string; collectionIds: string[] };
  collections: { id: string; name: string; coverThumbUrl: string | null; itemCount: number }[];
  layout: LayoutMode;
  onRemove: (masterId: string, collectionId: string) => void;
  onAttach: (masterId: string, collectionId: string) => void;
  onDetach: (masterId: string, collectionId: string) => void;
  onDelete: (masterId: string) => void;
}) {
  const children = collections.filter((collection) => master.collectionIds.includes(collection.id));
  const unassigned = collections.filter((collection) => !master.collectionIds.includes(collection.id));
  const isCompact = layout === 'compact';
  const isDetails = layout === 'details';
  const isList = layout === 'list';
  const sectionPad = isCompact ? 'p-3' : isDetails ? 'p-6' : isList ? 'p-4' : 'p-5';
  const childrenGap = isCompact ? 'space-y-1.5' : isDetails ? 'space-y-2.5' : 'space-y-2';
  const childPad = isCompact ? 'p-2.5' : isDetails ? 'p-4' : 'p-3';
  const thumbClass = isCompact
    ? 'h-8 w-14 overflow-hidden rounded-lg bg-secondary'
    : isDetails
      ? 'h-12 w-20 overflow-hidden rounded-lg bg-secondary'
      : 'h-9 w-14 overflow-hidden rounded-lg bg-secondary';
  const nameClass = isCompact ? 'truncate text-xs font-bold' : isDetails ? 'truncate text-base font-bold' : 'truncate text-xs font-bold';
  const countClass = 'text-[10px] text-muted-foreground';
  const headerTitleClass = isDetails ? 'text-lg' : 'text-base';

  return (
    <section className={`rounded-2xl border border-border bg-card ${sectionPad}`}>
      <header className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><FolderTree size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className={`font-serif font-bold ${headerTitleClass}`}>{master.name}</h2>
          <p className={`mt-1 ${countClass}`}>{children.length} collections</p>
        </div>
        <button onClick={() => onDelete(master.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${master.name}`}><Trash2 size={15} /></button>
      </header>
      <div className={`mt-4 ${childrenGap}`}>
        {children.map((collection) => (
          <div key={collection.id} className={`flex items-center gap-3 rounded-xl border border-border/70 ${childPad}`}>
            <div className={thumbClass}>{collection.coverThumbUrl ? <img src={collection.coverThumbUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
            <div className="min-w-0 flex-1">
              <p className={`${nameClass}`}>{collection.name}</p>
              <p className={`${countClass}`}>{collection.itemCount} frames</p>
            </div>
            <button onClick={() => onDetach(master.id, collection.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label={`Remove ${collection.name}`}><X size={14} /></button>
          </div>
        ))}
      </div>
      {unassigned.length ? <select value="" onChange={(event) => { if (event.target.value) onAttach(master.id, event.target.value); }} className="mt-4 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs" aria-label={`Add collection to ${master.name}`}><option value="">Add a collection…</option>{unassigned.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select> : null}
    </section>
  );
}
