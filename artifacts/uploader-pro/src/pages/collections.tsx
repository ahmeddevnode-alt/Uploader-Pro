import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListCollectionsQueryKey, getListMediaQueryKey, useAddCollectionItem, useCreateCollection, useDeleteCollection, useListCollections, useListMedia, useRemoveCollectionItem } from '@workspace/api-client-react';
import { ArrowUpRight, FolderHeart, Plus, Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PageHeading } from '@/components/uploader-shell';

export default function CollectionsPage() {
  const collections = useListCollections();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();
  const addItem = useAddCollectionItem();
  const removeItem = useRemoveCollectionItem();
  const allMedia = useListMedia({ view: 'all', limit: 100, includeHidden: true });
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState('');
  const [hideFromMain, setHideFromMain] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; createCollection.mutate({ data: { name: name.trim() } }, { onSuccess: () => { setName(''); queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); } }); };
  const selectedCollection = collections.data?.find((collection) => collection.id === selected);
  const collectionMedia = allMedia.data?.items.filter((item) => selectedCollection?.mediaIds.includes(item.id)) ?? [];
  return <div className="mx-auto max-w-[1180px]"><PageHeading eyebrow="Library" title="Collections with a pulse." description="Give the archive a little shape. Collections are lightweight ways to return to a feeling, a place, or a season." action={<form onSubmit={create} className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection name" className="h-10 w-44 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary sm:w-52" aria-label="New collection name" data-testid="input-collection-name" /><button disabled={createCollection.isPending} className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground hover:-translate-y-0.5 disabled:opacity-60" type="submit" aria-label="Create collection" data-testid="button-create-collection"><Plus size={17} /></button></form>} />
     {selectedCollection ? (
       <section className="mb-7 rounded-2xl border border-primary/25 bg-primary/[.035] p-4 md:p-5">
         <div className="flex items-center gap-3">
           <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary" aria-label="Close collection details" data-testid="button-close-collection-details"><X size={16} /></button>
           <FolderHeart size={17} className="text-primary" />
           <div className="min-w-0 flex-1">
             <p className="text-sm font-bold">{selectedCollection.name}</p>
             <p className="text-xs text-muted-foreground">{selectedCollection.itemCount} items · also available as a tag</p>
           </div>
           <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10" data-testid={`button-delete-collection-${selectedCollection.id}`}><Trash2 size={14} /> Delete</button>
         </div>
         <div className="mt-4 flex flex-col gap-2 sm:flex-row">
           <select value={selectedMedia} onChange={(event) => setSelectedMedia(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-xs" aria-label="Choose media to add">
             <option value="">Choose media to add…</option>
             {(allMedia.data?.items ?? []).filter((item) => !selectedCollection.mediaIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.originalName}</option>)}
           </select>
           <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground"><input type="checkbox" checked={hideFromMain} onChange={(event) => setHideFromMain(event.target.checked)} /> Hide from main gallery</label>
           <button disabled={!selectedMedia || addItem.isPending} onClick={() => addItem.mutate({ id: selectedCollection.id, data: { mediaId: selectedMedia, hideFromMain } }, { onSuccess: () => { setSelectedMedia(''); void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() }); } })} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">Add media</button>
         </div>
         {collectionMedia.length ? (
           <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
             {collectionMedia.map((item) => (
               <div key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
                 <img src={item.thumbUrl} alt={item.originalName} className="aspect-[1.2] w-full object-cover" />
                 <div className="flex items-center gap-2 p-2">
                   <p className="min-w-0 flex-1 truncate text-[10px] font-bold">{item.originalName}</p>
                   <button onClick={() => removeItem.mutate({ id: selectedCollection.id, mediaId: item.id }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() }); } })} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.originalName}`}><X size={13} /></button>
                 </div>
               </div>
             ))}
           </div>
         ) : <p className="mt-5 rounded-xl bg-secondary/50 py-8 text-center text-xs text-muted-foreground">No media in this collection yet.</p>}
       </section>
     ) : null}
     <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
       <AlertDialogContent className="border-border bg-card">
         <AlertDialogHeader>
           <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
           <AlertDialogDescription>This removes “{selectedCollection?.name}” and its links to media. The media files themselves stay in your vault.</AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
           <AlertDialogCancel disabled={deleteCollection.isPending}>Cancel</AlertDialogCancel>
           <AlertDialogAction
             disabled={deleteCollection.isPending}
             className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             onClick={(event) => {
               event.preventDefault();
               if (!selectedCollection) return;
               deleteCollection.mutate({ id: selectedCollection.id }, {
                 onSuccess: () => {
                   setConfirmDelete(false);
                   setSelected(null);
                   void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
                 },
               });
             }}
           >
             {deleteCollection.isPending ? 'Deleting…' : 'Delete collection'}
           </AlertDialogAction>
         </AlertDialogFooter>
       </AlertDialogContent>
     </AlertDialog>
    {collections.isLoading ? <CollectionSkeleton /> : collections.isError ? <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-16 text-center"><p className="font-serif font-bold">Collections are out of reach.</p><button onClick={() => collections.refetch()} className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold" data-testid="button-retry-collections">Try again</button></div> : collections.data?.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{collections.data.map((collection, index) => <button onClick={() => setSelected(collection.id)} key={collection.id} className="vault-in group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-transform hover:-translate-y-1 hover:border-primary/40" style={{ animationDelay: `${index * 50}ms` }} data-testid={`card-collection-${collection.id}`}><div className="relative aspect-[1.7] overflow-hidden bg-secondary">{collection.coverThumbUrl ? <img src={collection.coverThumbUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="vault-grid grid h-full place-items-center"><FolderHeart size={34} className="text-primary/60" /></div>}<div className="absolute inset-0 bg-gradient-to-t from-background/75 to-transparent" /><span className="absolute bottom-3 left-3 rounded-md bg-background/55 px-2 py-1 font-mono text-[10px] text-foreground backdrop-blur">{collection.itemCount} items</span><ArrowUpRight size={17} className="absolute bottom-3 right-3 text-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div><div className="p-4"><h2 className="font-serif text-base font-bold">{collection.name}</h2><p className="mt-1 text-xs text-muted-foreground">Open collection details</p></div></button>)}</div> : <div className="vault-grid rounded-2xl border border-dashed border-border px-6 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><FolderHeart size={24} /></div><h3 className="mt-5 font-serif text-lg font-bold">Start with a feeling</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Create a collection above to give your favourite places and people a home.</p></div>}
  </div>;
}

function CollectionSkeleton() { return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-2xl border border-border bg-card"><div className="shimmer aspect-[1.7]" /><div className="space-y-2 p-4"><div className="shimmer h-4 w-2/3 rounded" /><div className="shimmer h-3 w-1/3 rounded" /></div></div>)}</div>; }