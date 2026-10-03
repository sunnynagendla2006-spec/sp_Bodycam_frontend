import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button.jsx'

// Offset-based paging shown as "Page N". Hidden when everything fits on one page.
export default function Pagination({ offset, pageSize, count, onChange }) {
  const page = Math.floor(offset / pageSize) + 1
  const hasPrev = offset > 0
  const hasNext = count >= pageSize
  if (!hasPrev && !hasNext) return null
  return (
    <div className="mt-5 flex items-center justify-between">
      <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={!hasPrev} onClick={() => onChange(Math.max(0, offset - pageSize))}>
        Previous
      </Button>
      <span className="text-sm text-ink-500">Page {page}</span>
      <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => onChange(offset + pageSize)}>
        Next
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
