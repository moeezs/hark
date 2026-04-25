import { useState } from 'react'
import NoteCard from './NoteCard'

const ALL_NOTES = [
  { type: 'event', title: "Mike's birthday party — Saturday May 3rd, 9pm, rooftop on Queen St", time: 'Apr 25' },
  { type: 'task',  title: 'Submit the Q2 report before end of day Friday',                      time: 'Apr 25' },
  { type: 'note',  title: 'Sarah is allergic to shellfish',                                      time: 'Apr 25' },
  { type: 'event', title: 'Dentist — Thursday May 8th, 3pm, Dr. Patel',                         time: 'Apr 24' },
  { type: 'note',  title: "Jake starts at Shopify on May 12th",                                  time: 'Apr 24' },
  { type: 'task',  title: 'Email Tom the updated contract draft',                                time: 'Apr 24' },
]

export default function SearchSection() {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? ALL_NOTES.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
    : ALL_NOTES

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Search</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Find anything from your conversations.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto">
        {/* Search bar */}
        <div className="max-w-[500px] mb-5 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-hark-muted-light pointer-events-none"
            width="15" height="15" viewBox="0 0 15 15" fill="none"
          >
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search notes, people, topics…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input w-full pl-[38px] pr-[14px] py-[10px] bg-hark-surface border border-hark-border rounded-[9px] text-[13.5px] text-hark-text transition-colors duration-[120ms] placeholder:text-hark-muted-light font-sans"
          />
        </div>

        {/* Results */}
        <div className="max-w-[600px]">
          {filtered.map((note, i) => (
            <NoteCard key={i} type={note.type} title={note.title} time={note.time} />
          ))}
          {filtered.length === 0 && (
            <p className="text-[13px] text-hark-muted-light py-8 text-center">No results</p>
          )}
        </div>
      </div>
    </div>
  )
}
