import { useEffect, useMemo, useRef, useState } from 'react'
import {
  findPastPeriods,
  type PastPeriodEntry,
} from '../lib/csv-model'

interface Props {
  csvText: string
  baseFilename: string
  onCsvChange: (next: string) => void
  onReset: () => Promise<string>
}

export function ToolbarActions({
  csvText,
  baseFilename,
  onCsvChange,
  onReset,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [resetting, setResetting] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)

  const pastResult = useMemo(() => findPastPeriods(csvText), [csvText])
  const pastCount = pastResult.entries.length

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    onCsvChange(text)
    e.target.value = '' // allow re-upload of same file
  }

  const handleDownload = () => {
    triggerDownload(
      new Blob([csvText], { type: 'text/csv' }),
      `${baseFilename}.csv`,
    )
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      const text = await onReset()
      onCsvChange(text)
    } finally {
      setResetting(false)
    }
  }

  const handleConfirmRemovePast = () => {
    onCsvChange(pastResult.cleanedCsv)
    setRemoveDialogOpen(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleUploadClick}>Upload CSV</Button>
        <Button onClick={handleDownload}>Download CSV</Button>
        <Button
          onClick={() => setRemoveDialogOpen(true)}
          disabled={pastCount === 0}
          variant="ghost"
          title={
            pastCount === 0
              ? 'No past events to remove'
              : `Remove ${pastCount} past ${pastCount === 1 ? 'event' : 'events'}`
          }
        >
          {pastCount > 0
            ? `Remove past events (${pastCount})`
            : 'Remove past events'}
        </Button>
        <Button onClick={handleReset} disabled={resetting} variant="ghost">
          {resetting ? 'Resetting…' : 'Reset to example'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {removeDialogOpen && (
        <RemovePastDialog
          entries={pastResult.entries}
          onCancel={() => setRemoveDialogOpen(false)}
          onConfirm={handleConfirmRemovePast}
        />
      )}
    </>
  )
}

function Button({
  onClick,
  disabled,
  variant = 'solid',
  title,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  variant?: 'solid' | 'ghost'
  title?: string
  children: React.ReactNode
}) {
  const base =
    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styles =
    variant === 'solid'
      ? 'bg-accent text-bg hover:bg-accent-hover'
      : 'bg-transparent text-text-muted ring-1 ring-border hover:text-text'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
  )
}

function RemovePastDialog({
  entries,
  onCancel,
  onConfirm,
}: {
  entries: PastPeriodEntry[]
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const count = entries.length
  const heading = `Are you sure you want to remove ${count === 1 ? 'this event' : 'these events'}:`

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-past-dialog-title"
      onClick={onCancel}
    >
      <div
        className="z-50 flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-surface ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-6 py-4">
          <h3
            id="remove-past-dialog-title"
            className="text-base font-semibold text-text"
          >
            Remove past events
          </h3>
          <p className="mt-1 text-sm text-text-muted">{heading}</p>
        </div>
        <ul className="flex-1 overflow-y-auto px-6 py-4 text-sm text-text">
          {entries.map((entry, index) => (
            <li
              key={`${entry.name}-${entry.start}-${entry.end}-${index}`}
              className="flex items-baseline gap-2 py-1"
            >
              <span className="font-medium">{entry.name || '(no name)'}</span>
              <span className="text-text-muted">{entry.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                {entry.status === 'C' ? 'Confirmed' : 'Planned'}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border bg-bg/40 px-6 py-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition-colors hover:bg-accent-hover"
          >
            {`Remove ${count} ${count === 1 ? 'event' : 'events'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
