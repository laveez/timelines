import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { csvToRows, rowsToCsv } from '../lib/csv-model'

interface Props {
  csvText: string
  onChange: (next: string) => void
}

type Cell = { r: number; c: number }
type Range = { anchor: Cell; focus: Cell }
type ColumnType = 'name' | 'status' | 'start' | 'end'

const MIN_COLS = 10 // Name + 3 period groups
const MIN_ROWS = 20
const EXTRA_BLANK_ROWS = 2

const NAME_WIDTH = 140
const STATUS_WIDTH = 80
const DATE_WIDTH = 140

function columnType(c: number): ColumnType {
  if (c === 0) return 'name'
  const slot = (c - 1) % 3
  if (slot === 0) return 'status'
  if (slot === 1) return 'start'
  return 'end'
}

function columnLabel(c: number): string {
  if (c === 0) return 'Name'
  const group = Math.floor((c - 1) / 3) + 1
  const slot = (c - 1) % 3
  if (slot === 0) return `Status ${group}`
  if (slot === 1) return `Start ${group}`
  return `End ${group}`
}

function columnWidth(c: number): number {
  switch (columnType(c)) {
    case 'name':
      return NAME_WIDTH
    case 'status':
      return STATUS_WIDTH
    default:
      return DATE_WIDTH
  }
}

function normalizeRange(range: Range) {
  return {
    r0: Math.min(range.anchor.r, range.focus.r),
    r1: Math.max(range.anchor.r, range.focus.r),
    c0: Math.min(range.anchor.c, range.focus.c),
    c1: Math.max(range.anchor.c, range.focus.c),
  }
}

function isInRange({ r, c }: Cell, range: Range | null): boolean {
  if (!range) return false
  const { r0, r1, c0, c1 } = normalizeRange(range)
  return r >= r0 && r <= r1 && c >= c0 && c <= c1
}

function cellsEqual(a: Cell | null, b: Cell | null): boolean {
  if (!a || !b) return a === b
  return a.r === b.r && a.c === b.c
}

function buildGrid(csvText: string) {
  const parsed = csvToRows(csvText)
  const dataCols = parsed.reduce((m, r) => Math.max(m, r.length), 0)
  // Always keep a completed triplet structure plus at least MIN_COLS.
  const paddedDataCols = dataCols <= 1 ? dataCols : 1 + Math.ceil((dataCols - 1) / 3) * 3
  const colCount = Math.max(MIN_COLS, paddedDataCols)
  const rowCount = Math.max(MIN_ROWS, parsed.length + EXTRA_BLANK_ROWS)
  const rows: string[][] = Array.from({ length: rowCount }, (_, i) => {
    const src = parsed[i] ?? []
    return Array.from({ length: colCount }, (_, j) => src[j] ?? '')
  })
  return { rows, colCount, rowCount }
}

function trimTrailing(rows: string[][]): string[][] {
  const cleaned = rows.map((row) => [...row])
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].every((cell) => cell === '')) {
    cleaned.pop()
  }
  return cleaned
}

function rowsToTsv(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n')
}

function rowsToHtmlTable(rows: string[][]): string {
  const body = rows
    .map((r) => '<tr>' + r.map((c) => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>')
    .join('')
  return `<table>${body}</table>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseClipboard(data: DataTransfer): string[][] {
  const html = data.getData('text/html')
  if (html) {
    const parsed = parseHtmlTable(html)
    if (parsed.length > 0) return parsed
  }
  const text = data.getData('text/plain')
  if (!text) return []
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'))
}

function parseHtmlTable(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return []
  return Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent ?? ''),
  )
}

export function CsvGridEditor({ csvText, onChange }: Props) {
  const { rows, colCount } = useMemo(() => buildGrid(csvText), [csvText])

  const [selection, setSelection] = useState<Range | null>(null)
  const [editing, setEditing] = useState<Cell | null>(null)
  const [dragMode, setDragMode] = useState<'select' | 'fill' | null>(null)
  const [fillTarget, setFillTarget] = useState<Range | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const focusContainer = () => containerRef.current?.focus()

  const commit = useCallback(
    (nextRows: string[][]) => {
      onChange(rowsToCsv(trimTrailing(nextRows)))
    },
    [onChange],
  )

  const setCellValue = useCallback(
    (r: number, c: number, value: string) => {
      if (rows[r]?.[c] === value) return
      const next = rows.map((row) => [...row])
      next[r][c] = value
      commit(next)
    },
    [rows, commit],
  )

  const clearRange = useCallback(
    (range: Range) => {
      const { r0, r1, c0, c1 } = normalizeRange(range)
      const next = rows.map((row) => [...row])
      let changed = false
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (next[r][c] !== '') {
            next[r][c] = ''
            changed = true
          }
        }
      }
      if (changed) commit(next)
    },
    [rows, commit],
  )

  const writeRangeValues = useCallback(
    (range: Range, values: string[][]) => {
      if (values.length === 0) return
      const { r0, c0 } = normalizeRange(range)
      const next = rows.map((row) => [...row])
      let maxR = next.length
      let maxC = next[0]?.length ?? 0
      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < values[i].length; j++) {
          const rr = r0 + i
          const cc = c0 + j
          while (rr >= maxR) {
            next.push(new Array(maxC).fill(''))
            maxR++
          }
          while (cc >= maxC) {
            for (const row of next) row.push('')
            maxC++
          }
          next[rr][cc] = values[i][j]
        }
      }
      commit(next)
      setSelection({
        anchor: { r: r0, c: c0 },
        focus: {
          r: Math.min(r0 + values.length - 1, next.length - 1),
          c: Math.min(c0 + (values[0]?.length ?? 1) - 1, (next[0]?.length ?? 1) - 1),
        },
      })
    },
    [rows, commit],
  )

  const fillRange = useCallback(
    (source: Range, target: Range) => {
      const src = normalizeRange(source)
      const dst = normalizeRange(target)
      const sourceRows = rows
        .slice(src.r0, src.r1 + 1)
        .map((row) => row.slice(src.c0, src.c1 + 1))
      const srcH = sourceRows.length
      const srcW = sourceRows[0]?.length ?? 0
      if (srcH === 0 || srcW === 0) return
      const next = rows.map((row) => [...row])
      for (let r = dst.r0; r <= dst.r1; r++) {
        for (let c = dst.c0; c <= dst.c1; c++) {
          const tileR = ((r - src.r0) % srcH + srcH) % srcH
          const tileC = ((c - src.c0) % srcW + srcW) % srcW
          next[r][c] = sourceRows[tileR][tileC]
        }
      }
      commit(next)
      setSelection({
        anchor: { r: dst.r0, c: dst.c0 },
        focus: { r: dst.r1, c: dst.c1 },
      })
    },
    [rows, commit],
  )

  const addRow = () => {
    const next = [...rows, new Array(colCount).fill('')]
    commit(next)
  }

  const addPeriodGroup = () => {
    const next = rows.map((row) => [...row, '', '', ''])
    commit(next)
  }

  const deleteSelectedRows = () => {
    if (!selection) return
    const { r0, r1 } = normalizeRange(selection)
    const next = rows.filter((_, i) => i < r0 || i > r1)
    commit(next.length === 0 ? [new Array(colCount).fill('')] : next)
    setSelection(null)
  }

  const deleteSelectedPeriodGroups = () => {
    if (!selection) return
    const { c0, c1 } = normalizeRange(selection)
    // Skip if selection is only in the Name column.
    const firstPeriodCol = Math.max(c0, 1)
    if (firstPeriodCol > c1) return
    const startGroup = Math.floor((firstPeriodCol - 1) / 3)
    const endGroup = Math.floor((c1 - 1) / 3)
    const firstCol = 1 + startGroup * 3
    const lastCol = 1 + endGroup * 3 + 2
    const next = rows.map((row) => [
      ...row.slice(0, firstCol),
      ...row.slice(lastCol + 1),
    ])
    // Ensure at least one period group survives.
    if ((next[0]?.length ?? 0) < 4) {
      for (const row of next) row.push('', '', '')
    }
    commit(next)
    setSelection(null)
  }

  const canDeletePeriodGroup = (() => {
    if (!selection) return false
    const { c1 } = normalizeRange(selection)
    return c1 >= 1
  })()

  // Mouse interaction
  const onCellMouseDown = (e: ReactMouseEvent, cell: Cell) => {
    if (e.button !== 0) return
    if (editing && cellsEqual(editing, cell)) return
    e.preventDefault()
    setEditing(null)
    if (e.shiftKey && selection) {
      setSelection({ anchor: selection.anchor, focus: cell })
    } else {
      setSelection({ anchor: cell, focus: cell })
    }
    setDragMode('select')
    focusContainer()
  }

  const onCellMouseEnter = (cell: Cell) => {
    if (dragMode === 'select' && selection) {
      setSelection({ anchor: selection.anchor, focus: cell })
    } else if (dragMode === 'fill' && selection) {
      const base = normalizeRange(selection)
      // Constrain fill to horizontal OR vertical (like Excel): favor the larger delta.
      const dR = cell.r < base.r0 ? cell.r - base.r0 : cell.r > base.r1 ? cell.r - base.r1 : 0
      const dC = cell.c < base.c0 ? cell.c - base.c0 : cell.c > base.c1 ? cell.c - base.c1 : 0
      if (dR === 0 && dC === 0) {
        setFillTarget(selection)
        return
      }
      const useVertical = Math.abs(dR) >= Math.abs(dC)
      if (useVertical) {
        setFillTarget({
          anchor: { r: Math.min(base.r0, cell.r), c: base.c0 },
          focus: { r: Math.max(base.r1, cell.r), c: base.c1 },
        })
      } else {
        setFillTarget({
          anchor: { r: base.r0, c: Math.min(base.c0, cell.c) },
          focus: { r: base.r1, c: Math.max(base.c1, cell.c) },
        })
      }
    }
  }

  useEffect(() => {
    const onUp = () => {
      if (dragMode === 'fill' && selection && fillTarget) {
        fillRange(selection, fillTarget)
      }
      setDragMode(null)
      setFillTarget(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragMode, selection, fillTarget, fillRange])

  const onFillHandleMouseDown = (e: ReactMouseEvent) => {
    if (!selection) return
    e.preventDefault()
    e.stopPropagation()
    setDragMode('fill')
    setFillTarget(selection)
  }

  // Keyboard
  const moveFocus = (dr: number, dc: number, extend: boolean) => {
    if (!selection) return
    const anchor = extend ? selection.anchor : selection.focus
    const base = selection.focus
    const r = Math.max(0, Math.min(rows.length - 1, base.r + dr))
    const c = Math.max(0, Math.min(colCount - 1, base.c + dc))
    setSelection({ anchor: extend ? anchor : { r, c }, focus: { r, c } })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (editing) return
    const ext = e.shiftKey
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveFocus(-1, 0, ext)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveFocus(1, 0, ext)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      moveFocus(0, -1, ext)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      moveFocus(0, 1, ext)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      moveFocus(0, e.shiftKey ? -1 : 1, false)
    } else if (e.key === 'Enter') {
      if (selection) {
        e.preventDefault()
        setEditing(selection.focus)
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selection) {
        e.preventDefault()
        clearRange(selection)
      }
    } else if (e.key === 'F2') {
      if (selection) {
        e.preventDefault()
        setEditing(selection.focus)
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && selection) {
      e.preventDefault()
      setCellValue(selection.focus.r, selection.focus.c, e.key)
      setEditing(selection.focus)
    }
  }

  const onCopy = (e: ReactClipboardEvent) => {
    if (!selection) return
    const { r0, r1, c0, c1 } = normalizeRange(selection)
    const slice = rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1))
    e.preventDefault()
    e.clipboardData.setData('text/plain', rowsToTsv(slice))
    e.clipboardData.setData('text/html', rowsToHtmlTable(slice))
  }

  const onPaste = (e: ReactClipboardEvent) => {
    if (!selection) return
    const parsed = parseClipboard(e.clipboardData)
    if (parsed.length === 0) return
    e.preventDefault()
    writeRangeValues(selection, parsed)
  }

  // Fill-handle position relative to the table
  const [handlePos, setHandlePos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!selection || !tableRef.current) {
      setHandlePos(null)
      return
    }
    const { r1, c1 } = normalizeRange(selection)
    const td = tableRef.current.querySelector<HTMLTableCellElement>(
      `td[data-r="${r1}"][data-c="${c1}"]`,
    )
    const container = tableRef.current
    if (!td) {
      setHandlePos(null)
      return
    }
    const tdRect = td.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setHandlePos({
      left: tdRect.right - containerRect.left - 5,
      top: tdRect.bottom - containerRect.top - 5,
    })
  }, [selection, rows, colCount])

  return (
    <div className="flex flex-col gap-2">
      <Toolbar
        onAddRow={addRow}
        onAddPeriodGroup={addPeriodGroup}
        onDeleteRows={deleteSelectedRows}
        onDeletePeriodGroups={deleteSelectedPeriodGroups}
        selection={selection}
        canDeletePeriodGroup={canDeletePeriodGroup}
      />
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        className="relative max-h-[480px] overflow-auto rounded-md bg-surface ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <table
          ref={tableRef}
          className="relative border-separate border-spacing-0 font-mono text-xs"
          style={{ minWidth: '100%' }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {Array.from({ length: colCount }, (_, c) => (
              <col key={c} style={{ width: columnWidth(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 z-20 h-8 bg-surface-raised" />
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 h-8 border-b border-border bg-surface-raised px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {columnLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 h-7 border-b border-border bg-surface-raised px-2 text-right text-[10px] font-medium text-text-muted"
                >
                  {r + 1}
                </th>
                {row.map((value, c) => (
                  <GridCell
                    key={c}
                    r={r}
                    c={c}
                    value={value}
                    type={columnType(c)}
                    selected={isInRange({ r, c }, selection)}
                    fillTarget={isInRange({ r, c }, fillTarget)}
                    isFocus={
                      !!selection && selection.focus.r === r && selection.focus.c === c
                    }
                    editing={!!editing && editing.r === r && editing.c === c}
                    onMouseDown={(e) => onCellMouseDown(e, { r, c })}
                    onMouseEnter={() => onCellMouseEnter({ r, c })}
                    onDoubleClick={() => {
                      setSelection({ anchor: { r, c }, focus: { r, c } })
                      setEditing({ r, c })
                    }}
                    onCommit={(next) => {
                      setCellValue(r, c, next)
                      setEditing(null)
                      focusContainer()
                    }}
                    onCancel={() => {
                      setEditing(null)
                      focusContainer()
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {handlePos && selection && (
          <div
            aria-label="Fill handle"
            onMouseDown={onFillHandleMouseDown}
            style={{
              position: 'absolute',
              left: handlePos.left,
              top: handlePos.top,
              width: 10,
              height: 10,
              cursor: 'crosshair',
            }}
            className="z-30 border border-bg bg-accent"
          />
        )}
      </div>
    </div>
  )
}

interface ToolbarProps {
  onAddRow: () => void
  onAddPeriodGroup: () => void
  onDeleteRows: () => void
  onDeletePeriodGroups: () => void
  selection: Range | null
  canDeletePeriodGroup: boolean
}

function Toolbar({
  onAddRow,
  onAddPeriodGroup,
  onDeleteRows,
  onDeletePeriodGroups,
  selection,
  canDeletePeriodGroup,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <ToolbarButton onClick={onAddRow}>+ Row</ToolbarButton>
      <ToolbarButton onClick={onAddPeriodGroup}>+ Period group</ToolbarButton>
      <ToolbarButton
        onClick={onDeleteRows}
        disabled={!selection}
        variant="danger"
      >
        Delete row
      </ToolbarButton>
      <ToolbarButton
        onClick={onDeletePeriodGroups}
        disabled={!canDeletePeriodGroup}
        variant="danger"
      >
        Delete period group
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  variant = 'default',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger'
  children: React.ReactNode
}) {
  const base =
    'rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40'
  const styles =
    variant === 'danger'
      ? 'bg-transparent text-text-muted ring-1 ring-border hover:text-red-400 hover:ring-red-400/60'
      : 'bg-transparent text-accent ring-1 ring-border hover:bg-surface-raised'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

interface GridCellProps {
  r: number
  c: number
  value: string
  type: ColumnType
  selected: boolean
  fillTarget: boolean
  isFocus: boolean
  editing: boolean
  onMouseDown: (e: ReactMouseEvent) => void
  onMouseEnter: () => void
  onDoubleClick: () => void
  onCommit: (next: string) => void
  onCancel: () => void
}

function GridCell({
  r,
  c,
  value,
  type,
  selected,
  fillTarget,
  isFocus,
  editing,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onCommit,
  onCancel,
}: GridCellProps) {
  const baseClass =
    'h-7 border-b border-r border-border px-2 align-middle whitespace-nowrap overflow-hidden text-ellipsis'
  const bg = isFocus
    ? 'bg-accent/25'
    : selected
      ? 'bg-accent/10'
      : fillTarget
        ? 'bg-accent/5'
        : 'bg-surface'
  const focusRing = isFocus ? 'outline outline-1 -outline-offset-1 outline-accent' : ''
  const fillOutline = fillTarget && !selected
    ? 'outline outline-1 -outline-offset-1 outline-dashed outline-accent/60'
    : ''
  return (
    <td
      data-r={r}
      data-c={c}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
      className={`${baseClass} ${bg} ${focusRing} ${fillOutline}`}
    >
      {editing ? (
        <CellEditor type={type} value={value} onCommit={onCommit} onCancel={onCancel} />
      ) : (
        <CellDisplay type={type} value={value} />
      )}
    </td>
  )
}

function CellDisplay({ type, value }: { type: ColumnType; value: string }) {
  if (type === 'status') {
    return <span className="font-semibold text-text">{value}</span>
  }
  return <span className="text-text">{value}</span>
}

function CellEditor({
  type,
  value,
  onCommit,
  onCancel,
}: {
  type: ColumnType
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  if (type === 'status') {
    return (
      <select
        autoFocus
        defaultValue={value}
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            onCommit(e.currentTarget.value)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        className="h-full w-full bg-transparent text-text outline-none"
      >
        <option value=""></option>
        <option value="C">C</option>
        <option value="P">P</option>
      </select>
    )
  }
  const inputType = type === 'start' || type === 'end' ? 'date' : 'text'
  return (
    <input
      autoFocus
      type={inputType}
      defaultValue={value}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          onCommit(e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="h-full w-full bg-transparent text-text outline-none"
    />
  )
}
