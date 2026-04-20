import { useState } from 'react'
import { CsvGridEditor } from './CsvGridEditor'
import { PersonCardEditor } from './PersonCardEditor'
import { RawCsvEditor } from './RawCsvEditor'

type Tab = 'grid' | 'raw' | 'cards'

interface Props {
  csvText: string
  onChange: (next: string) => void
}

export function EditorTabs({ csvText, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('grid')
  return (
    <div>
      <nav className="mb-2 flex gap-1 border-b border-border" role="tablist">
        <TabButton active={tab === 'grid'} onClick={() => setTab('grid')}>
          Grid
        </TabButton>
        <TabButton active={tab === 'raw'} onClick={() => setTab('raw')}>
          Raw CSV
        </TabButton>
        <TabButton active={tab === 'cards'} onClick={() => setTab('cards')}>
          Cards
        </TabButton>
      </nav>
      {tab === 'grid' && <CsvGridEditor csvText={csvText} onChange={onChange} />}
      {tab === 'raw' && <RawCsvEditor value={csvText} onChange={onChange} />}
      {tab === 'cards' && (
        <PersonCardEditor csvText={csvText} onChange={onChange} />
      )}
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
