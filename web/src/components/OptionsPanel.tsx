import type { RenderOptions } from '../lib/pyodide-runtime'

export type Options = Omit<RenderOptions, 'csvText' | 'fromDate' | 'toDate'>

export type PaletteMode = 'dark' | 'light' | 'uniform' | 'custom'

export type RangeMode =
  | 'all'
  | 'next-month'
  | 'next-3-months'
  | 'next-6-months'
  | 'custom'

interface Props {
  options: Options
  paletteMode: PaletteMode
  customPalette: string
  rangeMode: RangeMode
  customFromDate: string
  customToDate: string
  onOptionsChange: (next: Options) => void
  onPaletteModeChange: (mode: PaletteMode) => void
  onCustomPaletteChange: (list: string) => void
  onRangeModeChange: (mode: RangeMode) => void
  onCustomFromDateChange: (iso: string) => void
  onCustomToDateChange: (iso: string) => void
}

export function OptionsPanel({
  options,
  paletteMode,
  customPalette,
  rangeMode,
  customFromDate,
  customToDate,
  onOptionsChange,
  onPaletteModeChange,
  onCustomPaletteChange,
  onRangeModeChange,
  onCustomFromDateChange,
  onCustomToDateChange,
}: Props) {
  const patch = (p: Partial<Options>) => onOptionsChange({ ...options, ...p })

  return (
    <div className="flex flex-wrap gap-4 rounded-md bg-surface p-4 ring-1 ring-border">
      <Field label="Title" className="min-w-48 flex-1">
        <TextInput
          value={options.title}
          onChange={(v) => patch({ title: v })}
        />
      </Field>
      <Field label="Subtitle" className="min-w-48 flex-1">
        <TextInput
          value={options.subtitle}
          placeholder={`${capitalize(options.scale)} view`}
          onChange={(v) => patch({ subtitle: v })}
        />
      </Field>
      <Field label="Scale">
        <SegmentedControl<Options['scale']>
          options={[
            { value: 'week', label: 'Week' },
            { value: 'day', label: 'Day' },
          ]}
          value={options.scale}
          onChange={(v) => patch({ scale: v })}
        />
      </Field>
      <Field label="Text mode">
        <SegmentedControl<Options['textMode']>
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'fixed', label: 'Fixed' },
          ]}
          value={options.textMode}
          onChange={(v) => patch({ textMode: v })}
        />
      </Field>
      <Field label="Palette">
        <SegmentedControl<PaletteMode>
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'uniform', label: 'Uniform' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={paletteMode}
          onChange={onPaletteModeChange}
        />
      </Field>
      {paletteMode === 'custom' && (
        <Field label="Custom colors (comma-separated)" className="min-w-72 flex-1 basis-full">
          <TextInput
            value={customPalette}
            placeholder="#0B1F66,#00A1DE,#D7192D,#8FBBD9"
            onChange={onCustomPaletteChange}
          />
        </Field>
      )}
      <Field label="Range">
        <SegmentedControl<RangeMode>
          options={[
            { value: 'all', label: 'All' },
            { value: 'next-month', label: 'Next month' },
            { value: 'next-3-months', label: 'Next 3 months' },
            { value: 'next-6-months', label: 'Next 6 months' },
            { value: 'custom', label: 'Custom' },
          ]}
          value={rangeMode}
          onChange={onRangeModeChange}
        />
      </Field>
      {rangeMode === 'custom' && (
        <>
          <Field label="From" className="w-40">
            <TextInput
              type="date"
              value={customFromDate}
              onChange={onCustomFromDateChange}
            />
          </Field>
          <Field label="To" className="w-40">
            <TextInput
              type="date"
              value={customToDate}
              onChange={onCustomToDateChange}
            />
          </Field>
        </>
      )}
    </div>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={'flex flex-col gap-1 ' + (className ?? '')}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-bg px-3 py-1.5 text-sm text-text ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent"
    />
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className="inline-flex rounded-md bg-bg p-0.5 ring-1 ring-border">
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={
              'rounded px-3 py-1 text-sm transition-colors ' +
              (selected
                ? 'bg-accent font-semibold text-bg'
                : 'text-text-muted hover:text-text')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
