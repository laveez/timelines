# timelines web companion

Browser companion for [`timelines.py`](../timelines.py) — the same CLI, running client-side via [Pyodide](https://pyodide.org/). Edit CSVs in an Excel-like grid or raw text, tweak options live, and export HTML / SVG / PNG without installing anything.

Live at **[laveez.github.io/timelines](https://laveez.github.io/timelines/)**.

## How it works

- `index.html` loads Pyodide from the jsDelivr CDN.
- [`src/lib/pyodide-runtime.ts`](src/lib/pyodide-runtime.ts) fetches `timelines.py` from the site root and imports it inside Pyodide.
- The React app gathers CSV + options and calls `st.render_svg(...)` / `st.render_html(...)` — no rendering logic is duplicated in TypeScript.
- `public/timelines.py` and `public/timelines.csv` are **symlinks** to the repo root, so the browser version cannot drift from the CLI.

## Develop

```bash
npm install
npm run dev       # Vite dev server on http://localhost:5173
npm run build     # Type-check + production build into dist/
npm run preview   # Serve the production build locally
npm run lint      # ESLint
```

## Deploy

`.github/workflows/pages.yml` in the repo root builds this directory and publishes `web/dist/` to GitHub Pages on every push to `main`. The Vite `base` is set to `/timelines/` in [`vite.config.ts`](vite.config.ts) to match the Pages path.

## Structure

```
src/
  App.tsx                   top-level layout + persistence to localStorage
  components/
    OptionsPanel.tsx        title / scale / palette / text-mode controls
    EditorTabs.tsx          grid vs raw CSV editor
    CsvGridEditor.tsx       react-data-grid
    RawCsvEditor.tsx        plain textarea
    ToolbarActions.tsx      upload / download / reset buttons
    OutputTabs.tsx          HTML / SVG / PNG preview + download
  lib/
    pyodide-runtime.ts      loads Pyodide, imports timelines, renders
    csv-model.ts            CSV <-> rows helpers for the grid editor
    png-export.ts           rasterize SVG to PNG via canvas
public/
  favicon.svg
  timelines.py        -> ../../timelines.py (symlink)
  timelines.csv       -> ../../timelines.csv (symlink)
```
