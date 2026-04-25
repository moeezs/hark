import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import PendingSection from './components/PendingSection'
import NotesSection from './components/NotesSection'
import PeopleSection from './components/PeopleSection'
import TopicsSection from './components/TopicsSection'
import SearchSection from './components/SearchSection'

const INITIAL_PENDING = [
  {
    id: 1,
    title: 'Dinner with Jake — Friday at 8pm, Giulia restaurant',
    type: 'event',
    meta: 'Caught at 2:34 pm · Today',
    quote: '"yeah let\'s do Giulia on Friday, maybe 8 o\'clock?"',
    action: 'Add to Calendar',
  },
  {
    id: 2,
    title: 'Call the realtor tomorrow morning',
    type: 'task',
    meta: 'Caught at 2:34 pm · Today',
    quote: '"I keep forgetting to call my realtor, I\'ll do it tomorrow"',
    action: 'Add to Reminders',
  },
  {
    id: 3,
    title: "Alex's new address is 42 Harbord St, second floor",
    type: 'note',
    meta: 'Caught at 11:08 am · Today',
    quote: '"I moved last month, it\'s 42 Harbord, second floor, buzz 04"',
    action: 'Save to Notes',
  },
]

export default function App() {
  const [activeSection, setActiveSection] = useState('notes')
  const [isListening, setIsListening] = useState(true)
  const [pendingCards, setPendingCards] = useState(INITIAL_PENDING)
  const [removingIds, setRemovingIds] = useState(new Set())
  const [confirmedIds, setConfirmedIds] = useState(new Set())

  // Listen for tray toggle events from Rust
  useEffect(() => {
    if (!window.__TAURI__) return
    let unlisten
    window.__TAURI__.event
      .listen('listening-changed', (event) => {
        setIsListening(event.payload)
      })
      .then((fn) => {
        unlisten = fn
      })
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  const handleToggleListening = async () => {
    const next = !isListening
    setIsListening(next)
    if (window.__TAURI__) {
      try {
        await window.__TAURI__.tauri.invoke('set_listening', { listening: next })
      } catch (_) {}
    }
  }

  const dismissCard = (id) => {
    setRemovingIds((prev) => new Set([...prev, id]))
    setTimeout(() => {
      setPendingCards((prev) => prev.filter((c) => c.id !== id))
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 180)
  }

  const confirmCard = (id) => {
    setConfirmedIds((prev) => new Set([...prev, id]))
    setTimeout(() => {
      dismissCard(id)
      setConfirmedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 600)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-hark-bg font-sans text-hark-text text-[13.5px] leading-[1.5]">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        isListening={isListening}
        onToggleListening={handleToggleListening}
        pendingCount={pendingCards.length}
      />
      <main className="flex-1 overflow-y-auto flex flex-col bg-hark-bg">
        {activeSection === 'pending' && (
          <PendingSection
            cards={pendingCards}
            removingIds={removingIds}
            confirmedIds={confirmedIds}
            onDismiss={dismissCard}
            onConfirm={confirmCard}
          />
        )}
        {activeSection === 'notes' && <NotesSection />}
        {activeSection === 'people' && <PeopleSection />}
        {activeSection === 'topics' && <TopicsSection />}
        {activeSection === 'search' && <SearchSection />}
      </main>
    </div>
  )
}
