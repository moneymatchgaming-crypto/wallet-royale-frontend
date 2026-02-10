'use client';

export type FilterVariant = 'open' | 'starting' | 'live' | 'finished' | 'all';

export interface FilterButtonProps {
  variant: FilterVariant;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

const variantClass: Record<FilterVariant, string> = {
  open: 'filter-btn--open',
  starting: 'filter-btn--starting',
  live: 'filter-btn--live',
  finished: 'filter-btn--finished',
  all: 'filter-btn--all',
};

export default function FilterButton({
  variant,
  active,
  onClick,
  children,
  className = '',
}: FilterButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`Filter by ${variant}`}
      className={`filter-btn ${variantClass[variant]} ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
