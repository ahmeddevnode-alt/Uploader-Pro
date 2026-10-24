import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { getGetStatsQueryKey, getGetWatcherStatusQueryKey, getListMediaQueryKey, useEncryptAllMedia, useGetWatcherStatus } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, Camera, CircleHelp, Copy, FolderHeart, FolderTree, Images, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Search, ShieldCheck, Star, Tag, UploadCloud, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const primaryNav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/new', label: 'New uploads', icon: UploadCloud },
  { href: '/all', label: 'All media', icon: Images },
  { href: '/favourites', label: 'Favourites', icon: Star },
  { href: '/untagged', label: 'Untagged', icon: Tag },
];

const libraryNav = [
  { href: '/collections', label: 'Collections', icon: FolderHeart },
  { href: '/master-collections', label: 'Master collections', icon: FolderTree },
  { href: '/duplicates', label: 'Duplicates', icon: Copy },
  { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
];

export function UploaderShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const watcher = useGetWatcherStatus({ query: { queryKey: getGetWatcherStatusQueryKey(), refetchInterval: 5000 } });
  const encryptAll = useEncryptAllMedia();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const runEncryptionSweep = () => encryptAll.mutate(undefined, {
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetWatcherStatusQueryKey() });
      toast({ title: 'Encrypt All Media complete', description: `${result.encrypted} file${result.encrypted === 1 ? '' : 's'} secured.` });
    },
    onError: () => toast({ title: 'Could not encrypt media', description: 'Check the watched folder and encryption settings, then try again.', variant: 'destructive' }),
  });

  useEffect(() => {
    if (location !== '/all' && search) setSearch('');
  }, [location]);

  const isActive = useMemo(() => (href: string) => location === href, [location]);
  const goSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (search.trim()) setLocation(`/all?search=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_hsl(var(--primary)/.2)]"><Camera size={18} strokeWidth={2.4} /></span>
            <span className="font-serif text-[17px] font-bold tracking-[-.03em] text-sidebar-accent-foreground">Uploader <span className="text-primary">Pro</span></span>
          </Link>
          <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
        </div>

        <div className="mt-8">
          <Link href="/new" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_8px_22px_hsl(var(--primary)/.13)] hover:-translate-y-0.5 hover:brightness-105" data-testid="link-new-upload"><Plus size={17} /> Add media</Link>
        </div>

        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground/70">Workspace</p>
          {primaryNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold ${isActive(href) ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon size={17} strokeWidth={isActive(href) ? 2.3 : 1.8} className={isActive(href) ? 'text-primary' : ''} /><span>{label}</span>
              {label === 'New uploads' && watcher.data?.pending ? <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">{watcher.data.pending}</span> : null}
            </Link>
          ))}
        </nav>

        <nav className="mt-7 space-y-1" aria-label="Library navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground/70">Library</p>
          {libraryNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold ${isActive(href) ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground'}`} data-testid={`link-nav-${label.toLowerCase()}`}>
              <Icon size={17} strokeWidth={isActive(href) ? 2.3 : 1.8} className={isActive(href) ? 'text-primary' : ''} /><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-4">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-3.5">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${watcher.data?.watching ? 'bg-accent shadow-[0_0_10px_hsl(var(--accent)/.6)]' : 'bg-muted-foreground'}`} />
              <span className="text-xs font-bold text-sidebar-accent-foreground">{watcher.data?.watching ? 'Watcher is live' : 'Watcher is idle'}</span>
            </div>
            <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{watcher.data?.dir || 'Encrypted library'}</p>
            {watcher.data?.pending ? <p className="mt-2 text-[11px] text-primary">{watcher.data.pending} waiting to import</p> : null}
            {watcher.data?.failed ? <p className="mt-2 text-[11px] text-destructive">{watcher.data.failed} import{watcher.data.failed === 1 ? '' : 's'} failed</p> : null}
          </div>
          <button onClick={runEncryptionSweep} disabled={encryptAll.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/55 px-3 py-2.5 text-xs font-bold text-sidebar-accent-foreground hover:border-primary/40 hover:text-primary disabled:opacity-60" data-testid="button-encrypt-all-media">
            {encryptAll.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            {encryptAll.isPending ? 'Securing media…' : 'Encrypt all media'}
          </button>
          <div className="flex items-center gap-3 border-t border-sidebar-border pt-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary font-serif text-xs font-bold text-primary">ME</span>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-sidebar-accent-foreground">Private vault</p><p className="text-[10px] text-muted-foreground">Owner access only</p></div>
            <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" onClick={() => { sessionStorage.removeItem('uploader-pro-token'); setLocation('/'); }} aria-label="Sign out" data-testid="button-sign-out"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      {mobileOpen ? <button className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-menu-backdrop" /> : null}

      <main className="min-h-[100dvh] transition-[padding] duration-300 lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center gap-3 border-b border-border/80 bg-background/90 px-5 backdrop-blur-xl md:px-8">
          <button className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><ShieldCheck size={15} className="text-accent" /> Local-first encrypted vault</div>
          <form onSubmit={goSearch} className="relative ml-auto w-full max-w-[320px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your vault" className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/70 focus:ring-2 focus:ring-primary/10" aria-label="Search your vault" data-testid="input-global-search" />
          </form>
          <div className="relative hidden sm:block"><button onClick={() => setHelpOpen((open) => !open)} className="rounded-xl border border-border p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Help" data-testid="button-help"><CircleHelp size={17} /></button>{helpOpen ? <div className="absolute right-0 top-12 z-30 w-64 rounded-xl border border-border bg-popover p-4 shadow-xl"><p className="text-xs font-bold">A quiet place for your archive</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">Use search to find a frame by name. Favourites and tags are yours to shape. Everything stays behind your owner access.</p><button onClick={() => setHelpOpen(false)} className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-primary" data-testid="button-close-help">Got it</button></div> : null}</div>
        </header>
        <div className="px-5 py-7 md:px-8 md:py-9">{children}</div>
      </main>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-primary">{eyebrow || 'Private vault'}<span className="h-px w-6 bg-primary/50" /></div><h1 className="font-serif text-3xl font-bold tracking-[-.045em] text-foreground md:text-[38px]">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}</div>{action}</div>;
}