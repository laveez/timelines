export function csvToRows(text: string): string[][] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  if (!normalized) return []
  return normalized.split('\n').map((line) => line.split(','))
}

export function rowsToCsv(rows: string[][]): string {
  const trimmed = trimTrailingEmptyRows(rows).map(trimTrailingEmptyCells)
  return trimmed.map((row) => row.join(',')).join('\n') + '\n'
}

/**
 * Trims trailing empty cells while preserving the Name + (Status,Start,End)... triplet structure.
 * Fully-empty trailing triplets are dropped; partial triplets are kept verbatim so that
 * editing in-progress state (e.g. typed status but not yet typed dates) round-trips cleanly.
 */
function trimTrailingEmptyCells(row: string[]): string[] {
  if (row.length <= 1) return [...row]
  const name = row[0]
  const periodCells = row.slice(1)
  // Complete any fractional trailing triplet with empty strings so we can reason in whole groups.
  while (periodCells.length % 3 !== 0) periodCells.push('')
  // Drop fully-empty trailing triplets. Stop as soon as we hit a triplet with any value,
  // whether it's full or partial; that triplet must be preserved so downstream sees the same shape.
  while (periodCells.length >= 3) {
    const end = periodCells.length
    if (
      periodCells[end - 3] === '' &&
      periodCells[end - 2] === '' &&
      periodCells[end - 1] === ''
    ) {
      periodCells.length -= 3
    } else {
      break
    }
  }
  return [name, ...periodCells]
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const out = [...rows]
  while (out.length > 0 && out[out.length - 1].every((cell) => cell === '')) out.pop()
  return out
}

/**
 * Returns CSV text with partial triplets (status missing a date, dates missing a status,
 * any slot blank inside a triplet) dropped per row. Complete triplets are preserved.
 * Rows that lose every period but still have a name are kept as name-only rows.
 * Rows that end up entirely empty are dropped.
 *
 * Use this at the render boundary so an in-progress edit in the Cards or Grid tab never
 * trips the strict CSV parser. The source CSV in component state is left untouched.
 */
export function sanitizeCsvForRender(csvText: string): string {
  const out: string[][] = []
  let hasAnyPeriod = false
  for (const row of csvToRows(csvText)) {
    const name = (row[0] ?? '').trim()
    const periods = row.slice(1)
    const kept: string[] = [name]
    for (let i = 0; i + 2 < periods.length; i += 3) {
      const s = (periods[i] ?? '').trim()
      const st = (periods[i + 1] ?? '').trim()
      const e = (periods[i + 2] ?? '').trim()
      if (s !== '' && st !== '' && e !== '') {
        kept.push(s, st, e)
        hasAnyPeriod = true
      }
    }
    if (kept.length === 1 && name === '') continue
    out.push(kept)
  }
  // Python's build_timeline_bounds crashes if no periods exist anywhere.
  // Signal an empty state instead of passing a name-only CSV through.
  if (!hasAnyPeriod) return ''
  return out.map((r) => r.join(',')).join('\n') + '\n'
}

export type PeriodStatus = 'C' | 'P' | ''

export interface PeriodEntry {
  status: PeriodStatus
  start: string
  end: string
}

export interface PersonEntry {
  name: string
  periods: PeriodEntry[]
}

export function csvToPeople(text: string): PersonEntry[] {
  return csvToRows(text)
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => {
      const name = (row[0] ?? '').trim()
      const periods: PeriodEntry[] = []
      for (let i = 1; i + 2 < row.length; i += 3) {
        const status = (row[i] ?? '').trim().toUpperCase()
        const start = (row[i + 1] ?? '').trim()
        const end = (row[i + 2] ?? '').trim()
        if (!status && !start && !end) continue
        periods.push({
          status: status === 'C' || status === 'P' ? status : '',
          start,
          end,
        })
      }
      return { name, periods }
    })
}

export function peopleToCsv(people: PersonEntry[]): string {
  const rows = people
    .filter((p) => p.name || p.periods.length > 0)
    .map((p) => {
      const cells = [p.name]
      for (const period of p.periods) {
        cells.push(period.status, period.start, period.end)
      }
      return cells
    })
  return rowsToCsv(rows)
}
