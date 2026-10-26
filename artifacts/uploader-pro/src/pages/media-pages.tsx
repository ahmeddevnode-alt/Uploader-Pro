import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getListMediaQueryKey, getGetDecryptJobQueryKey, useCreateDecryptJob, useGetDecryptJob, useListMedia, DecryptJobInputFormat } from '@workspace/api-client-react';
import type { ListMediaParams } from '@workspace/api-client-react';
import { ArrowDownToLine, Check, FileImage, FolderOpen, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { MediaGrid, MediaToolbar } from '@/components/media-grid';
import { PageHeading } from '@/components/uploader-shell';

export function MediaPage({ view, title, description }: { view: ListMediaParams['view']; title: string; description: string }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [type, setType] = useState<'all' | 'image' | 'video'>('all');
  const typeParam = type === 'all' ? undefined : type;
  const query = useListMedia({ view, limit: 100, type: typeParam }, { query: { queryKey: getListMediaQueryKey({ view, limit: 100, type: typeParam }), refetchInterval: view === 'new' ? 10000 : false, refetchOnWindowFocus: true } });
  const imageCount = useListMedia({ view, type: 'image', limit: 1 });
  const videoCount = useListMedia({ view, type: 'video', limit: 1 });
  const items = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = [...(query.data?.items || [])].filter((media) => {
      if (media.hideFromMain) return false;
      if (!words.length) return true;
      return words.every(
        (word) =>
          media.tags.some((tag) => tag.toLowerCase().includes(word)) ||
          media.originalName.toLowerCase().includes(word),
      );
    });
    return list.sort((a, b) =>
      sort === 'name'
        ? a.originalName.localeCompare(b.originalName)
        : sort === 'oldest'
        ? +new Date(a.createdAt) - +new Date(b.createdAt)
        : +new Date(b.createdAt) - +new Date(a.createdAt),
    );
  }, [query.data?.items, search, sort]);
  return <div className="mx-auto max-w-[1440px]"><PageHeading eyebrow={view === 'new' ? 'Incoming frames' : view === 'favourites' ? 'Marked moments' : view === 'untagged' ? 'Needs context' : 'The full archive'} title={title} description={description} action={<div className="flex flex-wrap gap-2">{view !== 'new' ? <Link href="/new" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-extrabold hover:border-primary/50 hover:text-primary" data-testid="link-add-from-media"><UploadCloud size={15} /> Add media</Link> : null}<BulkDownloadButton view={view} type={typeParam} search={search} /></div>} /><MediaTypeTabs type={type} setType={setType} images={imageCount.data?.total ?? 0} videos={videoCount.data?.total ?? 0} /><MediaToolbar count={query.data?.total ?? items.length} onSearch={setSearch} filter={sort} setFilter={setSort} />{query.isLoading ? <MediaSkeleton /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : <MediaGrid items={items} emptyTitle={view === 'untagged' ? 'Everything has context' : 'No media found'} emptyCopy={search ? 'Try a different name or clear your filter.' : 'Import a few frames to make this view yours.'} />}</div>;
}

export function NewUploadsPage() {
  const [uploads, setUploads] = useState<{ file: File; progress: number; status: 'uploading' | 'done' | 'duplicate' | 'error'; message?: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [type, setType] = useState<'all' | 'image' | 'video'>('all');
  const typeParam = type === 'all' ? undefined : type;
  const recent = useListMedia({ view: 'new', limit: 100, type: typeParam }, { query: { queryKey: getListMediaQueryKey({ view: 'new', limit: 100, type: typeParam }), refetchInterval: 10000, refetchOnWindowFocus: true } });
  const imageCount = useListMedia({ view: 'new', type: 'image', limit: 1 });
  const videoCount = useListMedia({ view: 'new', type: 'video', limit: 1 });
  const queryClient = useQueryClient();
  const uploadFile = (file: File, allowDuplicate = false) => new Promise<void>((resolve) => {
    const entry = { file, progress: 0, status: 'uploading' as const };
    setUploads((current) => [entry, ...current.filter((item) => item.file.name !== file.name)]);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    const token = sessionStorage.getItem('uploader-pro-token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (allowDuplicate) xhr.setRequestHeader('X-Allow-Duplicate', 'true');
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploads((current) => current.map((item) => item.file === file ? { ...item, progress: Math.round((event.loaded / event.total) * 100) } : item)); };
    xhr.onload = () => {
      let result: { duplicate?: boolean; existingName?: string; ok?: boolean; savedAlias?: boolean; error?: string } | undefined;
      try { result = JSON.parse(xhr.responseText)?.[0]; } catch { /* handled as failed below */ }
      const status = xhr.status >= 200 && xhr.status < 300 ? (result?.savedAlias ? 'done' : result?.duplicate ? 'duplicate' : result?.ok ? 'done' : 'error') : 'error';
      setUploads((current) => current.map((item) => item.file === file ? { ...item, progress: 100, status, message: result?.savedAlias ? `Same encrypted media; added the name “${file.name}”.` : result?.duplicate ? `Already in your vault as ${result.existingName ?? file.name}` : status === 'error' ? result?.error ?? 'Upload failed. Try again.' : undefined } : item));
      if (status === 'done') queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      resolve();
    };
    xhr.onerror = () => { setUploads((current) => current.map((item) => item.file === file ? { ...item, status: 'error', message: 'Upload failed. Try again.' } : item)); resolve(); };
    const data = new FormData();
    data.append('files', file, file.name);
    xhr.send(data);
  });
  const onFiles = (selected: FileList | File[] | null) => { if (!selected) return; Array.from(selected).forEach((file) => void uploadFile(file)); };
  const handleDrop = (event: DragEvent) => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files); };
  return <div className="mx-auto max-w-[1440px]" onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}><PageHeading eyebrow="Incoming frames" title="Bring it all home." description="Add photos and videos directly, or let your watched folder do the work." action={<div className="flex flex-wrap gap-2"><BulkDownloadButton view="new" type={typeParam} search="" /><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground hover:-translate-y-0.5"><UploadCloud size={16} /> Choose files<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.jfif,.heic,.mp4,.mov,.webm" className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="input-upload-files" /></label></div>} /><section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><div className={`vault-grid flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-primary/30 bg-primary/[.025]'}`}><div className="grid h-16 w-16 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><FolderOpen size={28} /></div><h2 className="mt-5 font-serif text-xl font-bold">{dragging ? 'Release to upload' : 'Drop your frames here'}</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Files are encrypted on arrival and kept in your private library.</p><label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold hover:border-primary/50 hover:text-primary">Browse device<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.jfif,.heic,.mp4,.mov,.webm" className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="input-upload-dropzone" /></label><div className="mt-6 flex items-center gap-2 font-mono text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Fernet encryption at rest</div></div><div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Upload queue</p><h2 className="mt-1 font-serif text-xl font-bold">Your incoming frames</h2></div><span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-muted-foreground">{uploads.filter((item) => item.status === 'done').length} secured</span></div>{uploads.length ? <div className="mt-5 space-y-2">{uploads.slice(0, 8).map((item) => <div key={`${item.file.name}-${item.file.lastModified}`} className="rounded-xl border border-border/70 p-3"><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-lg ${item.status === 'duplicate' ? 'bg-amber-400/10 text-amber-300' : item.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'}`}>{item.status === 'uploading' ? <LoaderCircle size={15} className="animate-spin" /> : item.status === 'done' ? <Check size={15} /> : item.status === 'duplicate' ? <CopyIcon /> : <X size={15} />}</span><p className="min-w-0 flex-1 truncate text-xs font-semibold">{item.file.name}</p><span className="font-mono text-[10px] text-muted-foreground">{item.progress}%</span></div>{item.status === 'uploading' ? <div className="mt-2 h-1 overflow-hidden rounded bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${item.progress}%` }} /></div> : null}{item.message ? <div className="mt-2 flex items-center justify-between gap-2"><p className="text-[10px] text-amber-200">{item.message}</p>{item.status === 'duplicate' ? <button onClick={() => void uploadFile(item.file, true)} className="shrink-0 rounded-md border border-amber-300/25 px-2 py-1 text-[10px] font-bold text-amber-100">Keep anyway</button> : null}</div> : null}</div>)}</div> : <div className="mt-6 rounded-xl bg-secondary/45 px-5 py-10 text-center"><FileImage size={22} className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Nothing in the queue</p><p className="mt-1 text-xs text-muted-foreground">Dropped or selected files will appear here with progress.</p></div>}</div></section><section className="mt-9"><div className="mb-4 flex items-end justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">Gallery view</p><h2 className="mt-1 font-serif text-2xl font-bold tracking-[-.035em]">Latest in the vault</h2></div><span className="font-mono text-[10px] text-muted-foreground">{recent.data?.total ?? '—'} recent</span></div><MediaTypeTabs type={type} setType={setType} images={imageCount.data?.total ?? 0} videos={videoCount.data?.total ?? 0} />{recent.isLoading ? <MediaGrid items={[]} emptyTitle="Loading your latest frames" emptyCopy="The archive is arranging your newest imports." /> : recent.isError ? <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-5 py-10 text-center text-sm text-muted-foreground">The gallery could not load. Refresh to try again.</div> : <MediaGrid items={(recent.data?.items || []).filter((item) => !item.hideFromMain)} emptyTitle="Your gallery starts here" emptyCopy="Import your first photo or video above." />}</section></div>;
}

function CopyIcon() { return <span className="text-[10px] font-black">DUP</span>; }

function MediaTypeTabs({ type, setType, images, videos }: { type: 'all' | 'image' | 'video'; setType: (value: 'all' | 'image' | 'video') => void; images: number; videos: number }) {
  const options = [
    { value: 'all' as const, label: 'All', count: images + videos },
    { value: 'image' as const, label: 'Images', count: images },
    { value: 'video' as const, label: 'Videos', count: videos },
  ];
  return <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1" aria-label="Filter media type">{options.map((option) => <button key={option.value} onClick={() => setType(option.value)} className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${type === option.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} aria-pressed={type === option.value} data-testid={`button-filter-${option.value}`}>{option.label}<span className="ml-1.5 font-mono text-[10px] opacity-75">{option.count}</span></button>)}</div>;
}

function BulkDownloadButton({ view, type, search }: { view: ListMediaParams['view']; type?: ListMediaParams['type']; search: string }) {
  const createJob = useCreateDecryptJob();
  const storageKey = `uploader-pro-decrypt-job-${view}-${type ?? 'all'}`;
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  useEffect(() => setJobId(sessionStorage.getItem(storageKey) ?? ''), [storageKey]);
  const job = useGetDecryptJob(jobId || 'none', { query: { enabled: !!jobId, queryKey: getGetDecryptJobQueryKey(jobId || 'none'), refetchInterval: jobId ? 1200 : false } });
  const start = () => createJob.mutate({ data: { filter: { view, ...(type ? { type } : {}), ...(search.trim() ? { search: search.trim() } : {}) }, format: DecryptJobInputFormat.zip } }, { onSuccess: (result) => { setJobId(result.id); sessionStorage.setItem(storageKey, result.id); } });
  const download = async () => {
    const response = await fetch(`/api/decrypt/jobs/${jobId}/download`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('uploader-pro-token') ?? ''}` } });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'uploader-pro-export.zip'; anchor.click();
    URL.revokeObjectURL(url);
  };
  return <div className="flex items-center gap-2">{jobId && job.data?.status === 'processing' ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[10px] text-muted-foreground"><LoaderCircle size={12} className="animate-spin" /> {job.data.progress.done}/{job.data.progress.total}</span> : null}{job.data?.status === 'error' ? <span className="text-[10px] text-destructive">Export failed</span> : null}{job.data?.status === 'done' ? <button onClick={() => void download()} className="inline-flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-extrabold text-accent-foreground"><ArrowDownToLine size={14} /> Download ZIP</button> : <button onClick={start} disabled={createJob.isPending || job.data?.status === 'processing'} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-extrabold hover:border-primary/50 disabled:opacity-50"><ArrowDownToLine size={14} /> {createJob.isPending ? 'Preparing…' : job.data?.status === 'processing' ? 'Preparing ZIP…' : 'Download all'}</button>}</div>;
}
function MediaSkeleton() { return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="overflow-hidden rounded-xl border border-border bg-card"><div className="shimmer aspect-[1.15]" /><div className="space-y-2 p-3"><div className="shimmer h-3 w-3/4 rounded" /><div className="shimmer h-2 w-1/2 rounded" /></div></div>)}</div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center"><X size={22} className="mx-auto text-destructive" /><h3 className="mt-4 font-serif text-lg font-bold">The archive took a breath</h3><p className="mt-2 text-sm text-muted-foreground">We couldn't load this view right now.</p><button onClick={onRetry} className="mt-5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/50" data-testid="button-retry-media">Try again</button></div>; }