import { sanitizeCsvForRender } from './csv-model'

export interface PyodideInterface {
  runPython: (code: string) => unknown
  FS: {
    writeFile: (path: string, data: string) => void
    mkdirTree: (path: string) => void
  }
  globals: {
    get: (name: string) => unknown
    set: (name: string, value: unknown) => void
  }
}

declare global {
  interface Window {
    loadPyodide?: (opts?: { indexURL?: string }) => Promise<PyodideInterface>
  }
}

export interface RenderOptions {
  csvText: string
  title: string
  subtitle: string
  scale: 'week' | 'day'
  palette: string
  textMode: 'auto' | 'fixed'
  paddingDays?: number
  fromDate?: string
  toDate?: string
}

export interface RenderResult {
  svg: string
  html: string
}

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/'

let instance: Promise<PyodideInterface> | null = null

async function loadRuntime(): Promise<PyodideInterface> {
  if (!window.loadPyodide) {
    throw new Error('Pyodide script tag not loaded in index.html')
  }
  const pyodide = await window.loadPyodide({ indexURL: PYODIDE_INDEX_URL })
  const pyUrl = `${import.meta.env.BASE_URL}timelines.py`
  const source = await fetch(pyUrl).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${pyUrl}: ${r.status}`)
    return r.text()
  })
  pyodide.FS.mkdirTree('/tmp/app')
  pyodide.FS.writeFile('/tmp/app/timelines.py', source)
  pyodide.runPython(`
import sys
sys.path.insert(0, '/tmp/app')
import timelines as st
`)
  return pyodide
}

export function initPyodide(): Promise<PyodideInterface> {
  if (!instance) instance = loadRuntime()
  return instance
}

export async function fetchBundledCsv(): Promise<string> {
  const url = `${import.meta.env.BASE_URL}timelines.csv`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return res.text()
}

export class EmptyTimelineError extends Error {
  constructor() {
    super('No complete periods to render')
    this.name = 'EmptyTimelineError'
  }
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const pyodide = await initPyodide()
  const sanitized = sanitizeCsvForRender(opts.csvText)
  if (sanitized.trim() === '') throw new EmptyTimelineError()
  pyodide.FS.writeFile('/tmp/input.csv', sanitized)
  pyodide.globals.set('_opts_json', JSON.stringify(opts))
  pyodide.runPython(`
import json
from datetime import date
from pathlib import Path

_opts = json.loads(_opts_json)
_people = st.parse_csv(Path('/tmp/input.csv'))
_from = date.fromisoformat(_opts['fromDate']) if _opts.get('fromDate') else None
_to = date.fromisoformat(_opts['toDate']) if _opts.get('toDate') else None
_start, _end = st.build_timeline_bounds(_people, _opts.get('paddingDays', 2), _from, _to)
_palette = st.resolve_palette(_opts['palette'])
_subtitle = _opts['subtitle'] or f"{_opts['scale'].title()} view"
_svg = st.render_svg(
    _people, _start, _end, _opts['scale'],
    _opts['title'], _subtitle, _palette, _opts['textMode'],
)
_html = st.render_html(_svg, _opts['title'])
`)
  return {
    svg: pyodide.globals.get('_svg') as string,
    html: pyodide.globals.get('_html') as string,
  }
}
