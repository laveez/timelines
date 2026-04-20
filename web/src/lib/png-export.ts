export async function svgToPngBlob(
  svgString: string,
  scale = 2,
): Promise<Blob> {
  const { width, height } = svgIntrinsicSize(svgString)
  const svgUrl = URL.createObjectURL(
    new Blob([svgString], { type: 'image/svg+xml' }),
  )
  try {
    const img = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

function svgIntrinsicSize(svgString: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const root = doc.documentElement
  const w = parseFloat(root.getAttribute('width') ?? '')
  const h = parseFloat(root.getAttribute('height') ?? '')
  if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h }
  const viewBox = root.getAttribute('viewBox')?.split(/\s+/) ?? []
  const vw = parseFloat(viewBox[2] ?? '')
  const vh = parseFloat(viewBox[3] ?? '')
  if (Number.isFinite(vw) && Number.isFinite(vh)) {
    return { width: vw, height: vh }
  }
  return { width: 800, height: 600 }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to rasterize SVG'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob returned null'))
    }, 'image/png')
  })
}
