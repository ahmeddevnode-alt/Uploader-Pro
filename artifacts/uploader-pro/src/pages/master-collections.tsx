import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListCollectionsQueryKey, getListMasterCollectionsQueryKey, useAddCollectionToMaster, useCreateMasterCollection, useDeleteMasterCollection, useListCollections, useListMasterCollections, useRemoveCollectionFromMaster } from '@workspace/api-client-react';
import { FolderTree, Plus, Trash2, X } from 'lucide-react';
import { PageHeading } from '@/components/uploader-shell';

export default function MasterCollectionsPage() {
  const masters = useListMasterCollections();
  const collections = useListCollections();
  const create = useCreateMasterCollection();
  const remove = useDeleteMasterCollection();
  const attach = useAddCollectionToMaster();
  const detach = useRemoveCollectionFromMaster();
  const cache = useQueryClient();
  const [name, setName] = useState('');
  const refresh = () => { void cache.invalidateQueries({ queryKey: getListMasterCollectionsQueryKey() }); void cache.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); };
  const onCreate = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; create.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(''); refresh(); } }); };
  return <div className="mx-auto max-w-[1180px]">
    <PageHeading eyebrow="Library" title="Collections, together." description="Group related collections into larger themes without moving or duplicating your media." action={<form onSubmit={onCreate} className="flex gap-2"><input value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-44 rounded-xl border border-input bg-card px-3 text-xs" placeholder="New group name" aria-label="New master collection name" /><button className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground" aria-label="Create group"><Plus size={17} /></button></form>} />
    {masters.isLoading ? <p className="p-8 text-sm text-muted-foreground">Loading groups…</p> : masters.isError ? <button onClick={() => void masters.refetch()} className="rounded-lg border border-border px-4 py-2 text-xs">Retry</button> : masters.data?.length ? <div className="grid gap-4 md:grid-cols-2">{masters.data.map((master) => {
      const children = collections.data?.filter((collection) => master.collectionIds.includes(collection.id)) ?? [];
      const unassigned = collections.data?.filter((collection) => !master.collectionIds.includes(collection.id)) ?? [];
      return <section key={master.id} className="rounded-2xl border border-border bg-card p-5">
        <header className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><FolderTree size={18} /></span><div className="min-w-0 flex-1"><h2 className="font-serif text-lg font-bold">{master.name}</h2><p className="mt-1 text-xs text-muted-foreground">{children.length} collections</p></div><button onClick={() => remove.mutate({ id: master.id }, { onSuccess: refresh })} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${master.name}`}><Trash2 size={15} /></button></header>
        <div className="mt-4 space-y-2">{children.map((collection) => <div key={collection.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><div className="h-9 w-12 overflow-hidden rounded-lg bg-secondary">{collection.coverThumbUrl ? <img src={collection.coverThumbUrl} alt="" className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{collection.name}</p><p className="text-[10px] text-muted-foreground">{collection.itemCount} frames</p></div><button onClick={() => detach.mutate({ id: master.id, collectionId: collection.id }, { onSuccess: refresh })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label={`Remove ${collection.name}`}><X size={14} /></button></div>)}</div>
        {unassigned.length ? <select value="" onChange={(event) => { if (event.target.value) attach.mutate({ id: master.id, collectionId: event.target.value }, { onSuccess: refresh }); }} className="mt-4 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs" aria-label={`Add collection to ${master.name}`}><option value="">Add a collection…</option>{unassigned.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select> : null}
      </section>;
    })}</div> : <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center"><FolderTree size={24} className="mx-auto text-primary" /><h2 className="mt-4 font-serif font-bold">No groups yet</h2><p className="mt-2 text-sm text-muted-foreground">Create a group, then add existing collections to it.</p></div>}
  </div>;
}
