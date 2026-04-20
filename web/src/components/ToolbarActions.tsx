import { useRef, useState } from 'react'

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={handleUploadClick}>Upload CSV</Button>
      <Button onClick={handleDownload}>Download CSV</Button>
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
  )
}

function Button({
  onClick,
  disabled,
  variant = 'solid',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  variant?: 'solid' | 'ghost'
  children: React.ReactNode
}) {
  const base =
    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50'
  const styles =
    variant === 'solid'
      ? 'bg-accent text-bg hover:bg-accent-hover'
      : 'bg-transparent text-text-muted ring-1 ring-border hover:text-text'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
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
