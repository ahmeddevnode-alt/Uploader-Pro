import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return <main className="vault-grid flex min-h-[100dvh] items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl"><AlertCircle className="mx-auto h-8 w-8 text-primary" /><p className="mt-5 font-mono text-[10px] uppercase tracking-[.2em] text-primary">Signal lost</p><h1 className="mt-2 font-serif text-2xl font-bold">This page is outside the vault.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The memory you’re looking for does not have a shelf here.</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground" data-testid="link-return-vault">Return to vault</Link></div></main>;
}
