// A table on wide screens that turns into a stack of cards on phones, using
// one set of markup (the same cells are restyled with CSS, never duplicated).
//
// columns: [{ key, header, cell(row), primary?, className? }]
//   primary - the cell shown as the card title on phones
export default function DataTable({ columns, rows, rowKey = (r) => r.id, rowClassName }) {
  return (
    <div className="md:card md:overflow-hidden">
      <div className="md:overflow-x-auto md:scrollbar-thin">
        <table className="block w-full text-sm md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-line bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
              {columns.map((c) => (
                <th key={c.key} scope="col" className="px-3 py-3 font-semibold">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block space-y-3 md:table-row-group md:space-y-0">
            {rows.map((row, i) => (
              <tr
                key={rowKey(row)}
                style={{ '--i': Math.min(i, 12) }}
                className={`stagger flex animate-rise-in flex-col rounded-2xl border border-line bg-surface p-4 shadow-card md:table-row md:animate-none md:rounded-none md:border-0 md:border-b md:p-0 md:shadow-none md:transition-colors md:last:border-b-0 md:hover:bg-brand-50/40 ${
                  rowClassName ? rowClassName(row) : ''
                }`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-label={c.header}
                    className={`flex items-center justify-between gap-4 py-1.5 md:table-cell md:px-3 md:py-3.5 md:align-middle ${
                      c.primary ? 'order-first pb-2 text-base font-semibold md:pb-3.5 md:text-sm md:font-medium md:text-ink-900' : "before:text-xs before:font-medium before:text-ink-500 before:content-[attr(data-label)] md:before:content-none"
                    } ${c.className || ''}`}
                  >
                    <span className={c.primary ? '' : 'min-w-0 text-right md:text-left'}>{c.cell(row)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
