import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListCollectionsQueryKey,
  getListMediaQueryKey,
  useAddCollectionItem,
  useDeleteCollection,
  useListCollections,
  useListMedia,
  useRemoveCollectionItem,
} from '@workspace/api-client-react';
import {
  AlertTriangle,
  ArrowLeft,
  FolderHeart,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MediaGrid } from '@/components/media-grid';
import { PageHeading } from '@/components/uploader-shell';
import { useLayoutPreference, LayoutSwitcher } from '@/components/layout-preferences';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const collections = useListCollections();
  const deleteCollection = useDeleteCollection();
  const addItem = useAddCollectionItem();
  const removeItem = useRemoveCollectionItem();
  const allMedia = useListMedia({ view: 'all', limit: 1000, includeHidden: true });
  const queryClient = useQueryClient();

  const [selectedMedia, setSelectedMedia] = useState('');
  const [hideFromMain, setHideFromMain] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [layout, setLayout] = useLayoutPreference('collection-detail');

  const collection = collections.data?.find((c) => c.id === id);
  const collectionMedia = (allMedia.data?.items ?? []).filter((item) =>
    collection?.mediaIds.includes(item.id),
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getListCollectionsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
  };

  if (collections.isLoading) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 h-10 w-48 animate-pulse rounded-xl bg-secondary" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="shimmer aspect-[1.15]" />
              <div className="space-y-2 p-3">
                <div className="shimmer h-3 w-3/4 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-20 text-center">
          <AlertTriangle className="mx-auto text-destructive" size={28} />
          <h2 className="mt-4 font-serif text-xl font-bold">Collection not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This collection may have been deleted.
          </p>
          <Link
            href="/collections"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-extrabold hover:border-primary/50 hover:text-primary"
          >
            <ArrowLeft size={14} /> Back to collections
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeading
        eyebrow="Collection"
        title={collection.name}
        description={`${collection.itemCount} item${collection.itemCount === 1 ? '' : 's'} in this collection`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/collections"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-extrabold hover:border-primary/50 hover:text-primary"
            >
              <ArrowLeft size={14} /> All collections
            </Link>
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs font-extrabold text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> Delete collection
            </button>
          </div>
        }
      />

      {/* Add media panel */}
      <div className="mb-7 rounded-2xl border border-primary/20 bg-primary/[.03] p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={15} className="text-primary" />
          <p className="text-sm font-bold">Add media to this collection</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedMedia}
            onChange={(e) => setSelectedMedia(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-xs"
            aria-label="Choose media to add"
          >
            <option value="">Choose media to add...</option>
            {(allMedia.data?.items ?? [])
              .filter((item) => !collection.mediaIds.includes(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.originalName}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideFromMain}
              onChange={(e) => setHideFromMain(e.target.checked)}
            />
            Hide from main gallery
          </label>
          <button
            disabled={!selectedMedia || addItem.isPending}
            onClick={() =>
              addItem.mutate(
                { id: collection.id, data: { mediaId: selectedMedia, hideFromMain } },
                {
                  onSuccess: () => {
                    setSelectedMedia('');
                    refresh();
                  },
                },
              )
            }
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {addItem.isPending ? 'Adding...' : 'Add media'}
          </button>
        </div>
      </div>

      {/* Media grid */}
      {collectionMedia.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-20 text-center">
          <FolderHeart className="mx-auto text-primary/50" size={32} />
          <h3 className="mt-5 font-serif text-lg font-bold">This collection is empty</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Use the picker above to add photos or videos.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[.12em] text-muted-foreground">
              <span className="text-foreground">{collectionMedia.length}</span> items in collection
            </p>
            <LayoutSwitcher layout={layout} onChange={setLayout} />
          </div>

          {/* Compact thumbnail grid with remove buttons */}
          <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {collectionMedia.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-border bg-card"
              >
                <img
                  src={item.thumbUrl || item.fileUrl}
                  alt={item.originalName}
                  className="aspect-[1.2] w-full object-cover"
                />
                <button
                  onClick={() =>
                    removeItem.mutate(
                      { id: collection.id, mediaId: item.id },
                      { onSuccess: refresh },
                    )
                  }
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 hover:text-destructive"
                  aria-label={`Remove ${item.originalName} from collection`}
                >
                  <X size={12} />
                </button>
                <div className="p-2">
                  <p className="truncate text-[10px] font-bold">{item.originalName}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-4 font-mono text-[11px] uppercase tracking-[.12em] text-muted-foreground">
            Full view
          </p>
          <MediaGrid items={collectionMedia} layout={layout} />
        </>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the collection and its links to media. The media files themselves stay
              in your vault.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCollection.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteCollection.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteCollection.mutate(
                  { id: collection.id },
                  {
                    onSuccess: () => {
                      setConfirmDelete(false);
                      void queryClient.invalidateQueries({
                        queryKey: getListCollectionsQueryKey(),
                      });
                      window.location.href = '/collections';
                    },
                  },
                );
              }}
            >
              {deleteCollection.isPending ? 'Deleting...' : 'Delete collection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
