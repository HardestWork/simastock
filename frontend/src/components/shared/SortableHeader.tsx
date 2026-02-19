/** Clickable table header cell with sort indicator. */
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import type { SortDirection } from '@/hooks/use-sort';

interface SortableHeaderProps {
  field: string;
  label: string;
  sortField: string | null;
  sortDirection: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export default function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  align = 'left',
  className = '',
}: SortableHeaderProps) {
  const isActive = sortField === field;
  const alignClass =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100 transition-colors text-${align} ${className}`}
      onClick={() => onSort(field)}
    >
      <span className={`inline-flex items-center gap-1 ${alignClass}`}>
        {label}
        {isActive ? (
          sortDirection === 'asc' ? (
            <ChevronUp size={14} className="text-primary" />
          ) : (
            <ChevronDown size={14} className="text-primary" />
          )
        ) : (
          <ChevronsUpDown size={14} className="text-gray-300" />
        )}
      </span>
    </th>
  );
}
