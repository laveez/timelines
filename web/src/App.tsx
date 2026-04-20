import { useEffect, useRef, useState } from 'react'
import { EditorTabs } from './components/EditorTabs'
import {
  OptionsPanel,
  type Options,
  type PaletteMode,
  type RangeMode,
} from './components/OptionsPanel'
import { OutputTabs } from './components/OutputTabs'
import { ToolbarActions } from './components/ToolbarActions'
import {
  EmptyTimelineError,
  fetchBundledCsv,
  initPyodide,
  render,
} from './lib/pyodide-runtime'

const CSV_STORAGE_KEY = 'timelines:csv'
const OPTIONS_STORAGE_KEY = 'timelines:options'

function defaultOptions(): Options {
  return {
    title: `Timeline ${new Date().getFullYear()}`,
    subtitle: '',
    scale: 'week',
    palette: 'uniform',
    textMode: 'fixed',
  }
}

interface StoredOptions {
  options: Options
  paletteMode: PaletteMode
  customPalette: string
  rangeMode: RangeMode
  customFromDate: string
  customToDate: string
}

function loadStoredOptions(): StoredOptions {
  const base: StoredOptions = {
    options: defaultOptions(),
    paletteMode: 'uniform',
    customPalette: '#0B1F66,#00A1DE,#D7192D,#8FBBD9',
    rangeMode: 'all',
    customFromDate: '',
    customToDate: '',
  }
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<StoredOptions>
    return {
      options: { ...base.options, ...(parsed.options ?? {}) },
      paletteMode: parsed.paletteMode ?? base.paletteMode,
      customPalette: parsed.customPalette ?? base.customPalette,
      rangeMode: parsed.rangeMode ?? base.rangeMode,
      customFromDate: parsed.customFromDate ?? base.customFromDate,
      customToDate: parsed.customToDate ?? base.customToDate,
    }
  } catch {
    return base
  }
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(base: Date, days: number): Date {
  const r = new Date(base)
  r.setDate(r.getDate() + days)
  return r
}

function resolveRange(
  mode: RangeMode,
  customFrom: string,
  customTo: string,
): { fromDate?: string; toDate?: string } {
  if (mode === 'all') return {}
  if (mode === 'custom') {
    return {
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
    }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = mode === 'next-month' ? 30 : mode === 'next-3-months' ? 90 : 180
  return { fromDate: toIso(today), toDate: toIso(addDays(today, days)) }
}

type Phase = 'booting' | 'ready' | 'empty' | 'error'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function App() {
  const [bootstrap] = useState(loadStoredOptions)
  const [csvText, setCsvText] = useState('')
  const [options, setOptions] = useState<Options>(bootstrap.options)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(
    bootstrap.paletteMode,
  )
  const [customPalette, setCustomPalette] = useState(bootstrap.customPalette)
  const [rangeMode, setRangeMode] = useState<RangeMode>(bootstrap.rangeMode)
  const [customFromDate, setCustomFromDate] = useState(bootstrap.customFromDate)
  const [customToDate, setCustomToDate] = useState(bootstrap.customToDate)
  const [svg, setSvg] = useState('')
  const [html, setHtml] = useState('')
  const [phase, setPhase] = useState<Phase>('booting')
  const [error, setError] = useState('')
  const [pyReady, setPyReady] = useState(false)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      try {
        const stored = localStorage.getItem(CSV_STORAGE_KEY)
        const initialCsv = stored ?? (await fetchBundledCsv())
        setCsvText(initialCsv)
        await initPyodide()
        setPyReady(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    })()
  }, [])

  useEffect(() => {
    if (!pyReady || !csvText) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const effectivePalette =
          paletteMode === 'custom' ? customPalette : paletteMode
        const { fromDate, toDate } = resolveRange(
          rangeMode,
          customFromDate,
          customToDate,
        )
        const result = await render({
          csvText,
          ...options,
          palette: effectivePalette,
          fromDate,
          toDate,
        })
        if (cancelled) return
        setSvg(result.svg)
        setHtml(result.html)
        setPhase('ready')
        setError('')
        localStorage.setItem(CSV_STORAGE_KEY, csvText)
        localStorage.setItem(
          OPTIONS_STORAGE_KEY,
          JSON.stringify({
            options,
            paletteMode,
            customPalette,
            rangeMode,
            customFromDate,
            customToDate,
          }),
        )
      } catch (err) {
        if (cancelled) return
        if (err instanceof EmptyTimelineError) {
          setPhase('empty')
          setError('')
        } else {
          setError(err instanceof Error ? err.message : String(err))
          setPhase('error')
        }
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pyReady, csvText, options, paletteMode, customPalette, rangeMode, customFromDate, customToDate])

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-10 text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-accent">
            Timelines
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Render CSVs as HTML, SVG, and PNG timelines, right in the browser.
          </p>
        </div>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl space-y-6 px-6 py-8">
          <OptionsPanel
            options={options}
            paletteMode={paletteMode}
            customPalette={customPalette}
            rangeMode={rangeMode}
            customFromDate={customFromDate}
            customToDate={customToDate}
            onOptionsChange={setOptions}
            onPaletteModeChange={setPaletteMode}
            onCustomPaletteChange={setCustomPalette}
            onRangeModeChange={setRangeMode}
            onCustomFromDateChange={setCustomFromDate}
            onCustomToDateChange={setCustomToDate}
          />
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Input
              </h2>
              <ToolbarActions
                csvText={csvText}
                baseFilename={slugify(options.title) || 'timeline'}
                onCsvChange={setCsvText}
                onReset={fetchBundledCsv}
              />
            </div>
            <EditorTabs csvText={csvText} onChange={setCsvText} />
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Output
            </h2>
            {phase === 'booting' && (
              <p className="text-text-muted">Loading Python runtime…</p>
            )}
            {phase === 'empty' && (
              <p className="text-text-muted">
                Fill in at least one complete period (status, start, end) to see a timeline.
              </p>
            )}
            {phase === 'error' && (
              <p className="text-red-400">
                Failed to render: <code>{error}</code>
              </p>
            )}
            {phase === 'ready' && svg && (
              <OutputTabs
                svg={svg}
                html={html}
                baseFilename={slugify(options.title) || 'timeline'}
              />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-6 py-6 text-sm text-text-muted">
        <a
          href="https://github.com/laveez/timelines"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          className="inline-flex items-center gap-2 transition-colors hover:text-accent"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>GitHub</span>
        </a>
        <span aria-hidden="true" className="opacity-50">·</span>
        <span>© {new Date().getFullYear()} laveez</span>
      </div>
    </footer>
  )
}
