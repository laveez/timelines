import { useEffect, useMemo, useState } from 'react'
import { svgToPngBlob } from '../lib/png-export'

type Tab = 'html' | 'svg' | 'png'

interface Props {
  svg: string
  html: string
  baseFilename: string
}

export function OutputTabs({ svg, html, baseFilename }: Props) {
  const [tab, setTab] = useState<Tab>('svg')
  return (
    <div>
      <nav className="mb-3 flex items-center justify-between border-b border-border">
        <div className="flex gap-1" role="tablist">
          <TabButton active={tab === 'html'} onClick={() => setTab('html')}>
            HTML
          </TabButton>
          <TabButton active={tab === 'svg'} onClick={() => setTab('svg')}>
            SVG
          </TabButton>
          <TabButton active={tab === 'png'} onClick={() => setTab('png')}>
            PNG
          </TabButton>
        </div>
        <div className="pb-2">
          <ActiveDownload tab={tab} svg={svg} html={html} baseFilename={baseFilename} />
        </div>
      </nav>
      {tab === 'html' && <HtmlPreview html={html} />}
      {tab === 'svg' && <SvgPreview svg={svg} />}
      {tab === 'png' && <PngPreview svg={svg} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'border-b-2 border-accent text-accent'
          : 'text-text-muted hover:text-text')
      }
    >
      {children}
    </button>
  )
}

function HtmlPreview({ html }: { html: string }) {
  return (
    <iframe
      title="Rendered HTML timeline"
      srcDoc={html}
      className="h-[640px] w-full rounded-md bg-white ring-1 ring-border"
    />
  )
}

function SvgPreview({ svg }: { svg: string }) {
  return (
    <div
      className="overflow-x-auto rounded-md bg-white p-4 text-black ring-1 ring-border"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function PngPreview({ svg }: { svg: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let createdUrl = ''
    svgToPngBlob(svg)
      .then((blob) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setUrl(createdUrl)
        setError('')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [svg])

  if (error) {
    return (
      <p className="text-red-400">
        PNG rasterization failed: <code>{error}</code>
      </p>
    )
  }
  if (!url) {
    return <p className="text-text-muted">Rasterizing…</p>
  }
  return (
    <div className="overflow-x-auto rounded-md bg-white p-4 ring-1 ring-border">
      <img src={url} alt="Rendered timeline PNG" className="max-w-full" />
    </div>
  )
}

interface DownloadProps {
  tab: Tab
  svg: string
  html: string
  baseFilename: string
}

function ActiveDownload({ tab, svg, html, baseFilename }: DownloadProps) {
  if (!svg || !html) return null
  if (tab === 'html') {
    return (
      <DownloadLink
        content={html}
        mimeType="text/html"
        filename={`${baseFilename}.html`}
        label="Download HTML"
      />
    )
  }
  if (tab === 'svg') {
    return (
      <div className="flex gap-2">
        <CopySvgButton svg={svg} />
        <DownloadLink
          content={svg}
          mimeType="image/svg+xml"
          filename={`${baseFilename}.svg`}
          label="Download SVG"
        />
      </div>
    )
  }
  return <PngDownload svg={svg} baseFilename={baseFilename} />
}

function CopySvgButton({ svg }: { svg: string }) {
  const [copied, setCopied] = useState(false)
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(svg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable (http, etc.)
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md bg-transparent px-3 py-1 text-sm font-semibold text-text-muted ring-1 ring-border hover:text-text"
    >
      {copied ? 'Copied!' : 'Copy SVG'}
    </button>
  )
}

function PngDownload({
  svg,
  baseFilename,
}: {
  svg: string
  baseFilename: string
}) {
  const [busy, setBusy] = useState(false)
  const handleClick = async () => {
    setBusy(true)
    try {
      const blob = await svgToPngBlob(svg)
      triggerDownload(blob, `${baseFilename}.png`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-bg hover:bg-accent-hover disabled:opacity-50"
    >
      {busy ? 'Rendering…' : 'Download PNG'}
    </button>
  )
}

function DownloadLink({
  content,
  mimeType,
  filename,
  label,
}: {
  content: string
  mimeType: string
  filename: string
  label: string
}) {
  const url = useMemo(
    () => URL.createObjectURL(new Blob([content], { type: mimeType })),
    [content, mimeType],
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <a
      href={url}
      download={filename}
      className="rounded-md bg-accent px-3 py-1 text-sm font-semibold text-bg hover:bg-accent-hover"
    >
      {label}
    </a>
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
