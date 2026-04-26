import { useState } from 'react'
import NoteCard from './NoteCard'

function groupByDate(notes) {
  const groups = {}
  for (const note of notes) {
    const d = note.createdAt ? new Date(note.createdAt) : new Date()
    const now = new Date()
    const daysDiff = Math.floor((now - d) / 86400000)
    let label
    if (daysDiff === 0) {
      label = `Today · ${d.toLocaleDateString([], { month: 'long', day: 'numeric' })}`
    } else if (daysDiff === 1) {
      label = `Yesterday · ${d.toLocaleDateString([], { month: 'long', day: 'numeric' })}`
    } else {
      label = d.toLocaleDateString([], { month: 'long', day: 'numeric' })
    }
    if (!groups[label]) groups[label] = []
    groups[label].push(note)
  }
  return Object.entries(groups)
}

function DateGroup({ label, children }) {
  return (
    <div className="mb-[26px]">
      <div className="text-[10.5px] font-semibold tracking-[0.07em] uppercase text-hark-muted mb-2 flex items-center gap-[10px] after:content-[''] after:flex-1 after:h-px after:bg-hark-border-light">
        {label}
      </div>
      {children}
    </div>
  )
}

function TranscriptCard({ transcript }) {
  const [expanded, setExpanded] = useState(false)
  const d = transcript.createdAt ? new Date(transcript.createdAt) : new Date()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const text = transcript.transcript || ''
  const brief = text.length > 180 ? text.slice(0, 180) + '…' : text
  const durationMin = transcript.duration ? Math.round(transcript.duration / 60) : 0
  const durationLabel = durationMin >= 1 ? `${durationMin} min` : `${Math.round(transcript.duration || 0)}s`

  return (
    <div className="bg-hark-surface border border-hark-border rounded-[9px] px-[14px] py-3 mb-[6px] transition-all duration-[120ms] hover:shadow-[0_1px_10px_rgba(0,0,0,0.05)] hover:border-hark-teal-border">
      <div className="flex items-start gap-[11px]">
        <div className="w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0 mt-[1px] bg-[#F0EBF8]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="#6B4FA6" strokeWidth="1.3" />
            <path d="M5 5v4l3.5-2L5 5z" fill="#6B4FA6" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-normal text-hark-text mb-[3px] leading-[1.4]">
            Conversation · {durationLabel}
          </div>
          <div className="text-[11px] text-hark-muted flex items-center gap-[5px]">
            <span className="font-mono text-[10.5px]">{time}</span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 mt-[2px] text-hark-muted hover:text-hark-teal transition-colors duration-100 bg-transparent border-none cursor-pointer p-1 rounded-[4px] hover:bg-hark-bg"
        >
          <svg
            width="13" height="13" viewBox="0 0 13 13" fill="none"
            className={`transition-transform duration-[150ms] ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M3 5l3.5 3L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="mt-[8px] ml-[38px]">
        <p className="text-[12px] text-hark-text-2 leading-[1.55] italic">
          {expanded ? `"${text}"` : `"${brief}"`}
        </p>
        {!expanded && text.length > 180 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] text-hark-teal mt-1 bg-transparent border-none cursor-pointer p-0 hover:underline font-sans"
          >
            Show full transcript
          </button>
        )}
      </div>
    </div>
  )
}

export default function NotesSection({ notes = [], transcripts = [], isLoading }) {
  const [tab, setTab] = useState('items') // 'items' | 'transcripts'

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Notes</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Everything Hark has captured, confirmed and saved.</p>

        {/* Sub-tabs */}
        <div className="flex gap-[2px] mt-3 bg-hark-bg rounded-[8px] p-[3px] w-fit">
          <button
            onClick={() => setTab('items')}
            className={[
              'px-3 py-[5px] rounded-[6px] text-[12px] font-medium border-none cursor-pointer transition-all duration-100 font-sans',
              tab === 'items'
                ? 'bg-hark-surface text-hark-text shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'bg-transparent text-hark-muted hover:text-hark-text-2',
            ].join(' ')}
          >
            Items
          </button>
          <button
            onClick={() => setTab('transcripts')}
            className={[
              'px-3 py-[5px] rounded-[6px] text-[12px] font-medium border-none cursor-pointer transition-all duration-100 font-sans',
              tab === 'transcripts'
                ? 'bg-hark-surface text-hark-text shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                : 'bg-transparent text-hark-muted hover:text-hark-text-2',
            ].join(' ')}
          >
            Transcripts
          </button>
        </div>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto flex flex-col">
        <div className="max-w-[600px]">
          {isLoading && (
            <p className="text-[13px] text-hark-muted-light py-8 text-center">Loading…</p>
          )}

          {/* Items tab */}
          {!isLoading && tab === 'items' && (
            <>
              {notes.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-[10px] text-hark-muted-light py-16">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path d="M8 6h24v24l-8 8H8z" stroke="#C4C0BA" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M14 16h12M14 22h8" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-[13px]">No saved notes yet. Start listening and confirm items to see them here.</p>
                </div>
              )}
              {groupByDate(notes).map(([label, group]) => (
                <DateGroup key={label} label={label}>
                  {group.map((note) => (
                    <NoteCard
                      key={note.id}
                      type={note.type}
                      title={note.title}
                      time={note.createdAt ? new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      sub={note.context || note.quote}
                    />
                  ))}
                </DateGroup>
              ))}
            </>
          )}

          {/* Transcripts tab */}
          {!isLoading && tab === 'transcripts' && (
            <>
              {transcripts.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-[10px] text-hark-muted-light py-16">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="14" stroke="#C4C0BA" strokeWidth="1.5" />
                    <path d="M14 16v8l6-4-6-4z" fill="#C4C0BA" />
                    <path d="M23 17v6" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M26 17v6" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-[13px]">No transcripts yet. Start listening to capture conversations.</p>
                </div>
              )}
              {transcripts.map((t) => (
                <TranscriptCard key={t.id} transcript={t} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
