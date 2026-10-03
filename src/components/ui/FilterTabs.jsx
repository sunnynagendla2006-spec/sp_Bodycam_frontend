// Pill-style single choice filter. Scrolls sideways on narrow screens.
export default function FilterTabs({ options, value, onChange, label = 'Filter' }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value || 'all'}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-95 ${
              active
                ? 'border-brand-600 bg-brand-600 text-white shadow-card'
                : 'border-line-strong bg-surface text-ink-700 hover:border-ink-400'
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-canvas text-ink-500'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
