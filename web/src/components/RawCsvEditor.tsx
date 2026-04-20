interface Props {
  value: string
  onChange: (next: string) => void
}

export function RawCsvEditor({ value, onChange }: Props) {
  return (
    <textarea
      className="h-[420px] w-full rounded-md bg-surface p-3 font-mono text-sm text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      aria-label="Raw CSV editor"
    />
  )
}
