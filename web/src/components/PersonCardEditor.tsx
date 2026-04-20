import { useMemo } from 'react'
import {
  csvToPeople,
  peopleToCsv,
  type PeriodEntry,
  type PersonEntry,
} from '../lib/csv-model'

interface Props {
  csvText: string
  onChange: (next: string) => void
}

export function PersonCardEditor({ csvText, onChange }: Props) {
  const people = useMemo(() => csvToPeople(csvText), [csvText])

  const mutate = (recipe: (draft: PersonEntry[]) => void) => {
    const draft = people.map((p) => ({
      ...p,
      periods: p.periods.map((period) => ({ ...period })),
    }))
    recipe(draft)
    onChange(peopleToCsv(draft))
  }

  return (
    <div className="space-y-3">
      {people.map((person, personIndex) => (
        <PersonCard
          key={personIndex}
          person={person}
          onNameChange={(name) =>
            mutate((d) => {
              d[personIndex].name = name
            })
          }
          onRemove={() =>
            mutate((d) => {
              d.splice(personIndex, 1)
            })
          }
          onAddPeriod={() =>
            mutate((d) => {
              d[personIndex].periods.push({ status: 'C', start: '', end: '' })
            })
          }
          onRemovePeriod={(periodIndex) =>
            mutate((d) => {
              d[personIndex].periods.splice(periodIndex, 1)
            })
          }
          onUpdatePeriod={(periodIndex, patch) =>
            mutate((d) => {
              d[personIndex].periods[periodIndex] = {
                ...d[personIndex].periods[periodIndex],
                ...patch,
              }
            })
          }
        />
      ))}
      <button
        type="button"
        onClick={() =>
          mutate((d) => {
            d.push({ name: '', periods: [] })
          })
        }
        className="w-full rounded-md bg-surface px-4 py-2 text-sm font-semibold text-accent ring-1 ring-border transition-colors hover:bg-surface-raised"
      >
        + Add person
      </button>
    </div>
  )
}

interface PersonCardProps {
  person: PersonEntry
  onNameChange: (next: string) => void
  onRemove: () => void
  onAddPeriod: () => void
  onRemovePeriod: (index: number) => void
  onUpdatePeriod: (index: number, patch: Partial<PeriodEntry>) => void
}

function PersonCard({
  person,
  onNameChange,
  onRemove,
  onAddPeriod,
  onRemovePeriod,
  onUpdatePeriod,
}: PersonCardProps) {
  return (
    <div className="rounded-md bg-surface p-4 ring-1 ring-border">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={person.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Name"
          className="flex-1 rounded-md bg-bg px-3 py-1.5 text-sm font-semibold text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-text-muted ring-1 ring-border transition-colors hover:text-red-400"
        >
          Remove
        </button>
      </div>
      <div className="space-y-2">
        {person.periods.map((period, index) => (
          <PeriodRow
            key={index}
            period={period}
            onUpdate={(patch) => onUpdatePeriod(index, patch)}
            onRemove={() => onRemovePeriod(index)}
          />
        ))}
        <button
          type="button"
          onClick={onAddPeriod}
          className="rounded-md bg-transparent px-3 py-1 text-xs font-semibold text-accent ring-1 ring-border transition-colors hover:bg-surface-raised"
        >
          + Add period
        </button>
      </div>
    </div>
  )
}

interface PeriodRowProps {
  period: PeriodEntry
  onUpdate: (patch: Partial<PeriodEntry>) => void
  onRemove: () => void
}

function PeriodRow({ period, onUpdate, onRemove }: PeriodRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={period.status || 'C'}
        onChange={(e) =>
          onUpdate({ status: e.target.value as 'C' | 'P' })
        }
        className="rounded-md bg-bg px-2 py-1 text-sm text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="C">Confirmed</option>
        <option value="P">Planned</option>
      </select>
      <input
        type="date"
        value={period.start}
        onChange={(e) => onUpdate({ start: e.target.value })}
        className="rounded-md bg-bg px-2 py-1 text-sm text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <span className="text-xs text-text-muted">to</span>
      <input
        type="date"
        value={period.end}
        onChange={(e) => onUpdate({ end: e.target.value })}
        className="rounded-md bg-bg px-2 py-1 text-sm text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove period"
        className="rounded-md px-2 py-1 text-sm text-text-muted ring-1 ring-border transition-colors hover:text-red-400"
      >
        ×
      </button>
    </div>
  )
}
