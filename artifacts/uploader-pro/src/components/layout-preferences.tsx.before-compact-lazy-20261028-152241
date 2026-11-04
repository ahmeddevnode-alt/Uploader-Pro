import { useState } from 'react';
import { LayoutGrid, Grid3x3, Rows3, AlignJustify } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type LayoutMode = 'comfortable' | 'compact' | 'list' | 'details';

export const LAYOUT_MODES: LayoutMode[] = ['comfortable', 'compact', 'list', 'details'];

const LAYOUT_META: Record<LayoutMode, { icon: typeof LayoutGrid; label: string }> = {
  comfortable: { icon: LayoutGrid, label: 'Comfortable' },
  compact: { icon: Grid3x3, label: 'Compact' },
  list: { icon: Rows3, label: 'List' },
  details: { icon: AlignJustify, label: 'Details' },
};

/**
 * Persisted per-scope layout preference. Each scope (e.g. "media",
 * "collections", "master") keeps its own choice in localStorage so the
 * user's last layout survives reloads and is remembered per tab type.
 */
export function useLayoutPreference(scope: string): [LayoutMode, (mode: LayoutMode) => void] {
  const key = `uploader-pro-layout:${scope}`;
  const [layout, setLayout] = useState<LayoutMode>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored && LAYOUT_MODES.includes(stored as LayoutMode)) return stored as LayoutMode;
    } catch { /* ignore */ }
    return 'comfortable';
  });
  const update = (mode: LayoutMode) => {
    setLayout(mode);
    try { localStorage.setItem(key, mode); } catch { /* ignore */ }
  };
  return [layout, update];
}

/**
 * Segmented control for switching between layout styles. Icons-only on
 * small screens, with tooltips describing each mode.
 */
export function LayoutSwitcher({
  layout,
  onChange,
  label = 'Layout',
}: {
  layout: LayoutMode;
  onChange: (mode: LayoutMode) => void;
  label?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label={label}
    >
      {LAYOUT_MODES.map((mode) => {
        const Meta = LAYOUT_META[mode];
        const Icon = Meta.icon;
        const active = layout === mode;
        return (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(mode)}
                className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
                aria-pressed={active}
                aria-label={`${Meta.label} layout`}
                data-testid={`button-layout-${mode}`}
              >
                <Icon size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{Meta.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
