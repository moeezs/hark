import { useState, useEffect, useRef } from 'react'
import NoteCard from './NoteCard'

export default function SearchSection({ searchItems }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await searchItems(query)
        setResults(data)
      } catch (_) {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, searchItems])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Search</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Find anything from your conversations.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto flex flex-col">
        <div className="max-w-[600px] mb-5 relative">
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

        {query.trim() ? (
          <div className="max-w-[600px]">
            {isSearching && <p className="text-[13px] text-hark-muted-light py-8 text-center">Searching…</p>}
            {!isSearching && results.map((note) => (
              <NoteCard
                key={note.id}
                type={note.type}
                title={note.title}
                time={note.createdAt ? new Date(note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                sub={note.context || note.quote || note.people?.join(', ') || note.topics?.join(', ')}
              />
            ))}
            {!isSearching && results.length === 0 && (
              <p className="text-[13px] text-hark-muted-light py-8 text-center">No results for "{query}"</p>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-[10px] text-hark-muted-light">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="17" cy="17" r="11" stroke="#C4C0BA" strokeWidth="1.5" />
              <path d="M26 26l9 9" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px]">Type to search your notes…</p>
          </div>
        )}
      </div>
    </div>
  )
}
