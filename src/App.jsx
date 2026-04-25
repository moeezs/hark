import { useState, useEffect, useCallback, useRef } from 'react'
import { useRecording } from './hooks/useRecording'
import Sidebar from './components/Sidebar'
import PendingSection from './components/PendingSection'
import NotesSection from './components/NotesSection'
import PeopleSection from './components/PeopleSection'
import TopicsSection from './components/TopicsSection'
import SearchSection from './components/SearchSection'

function actionForType(type) {
  switch (type) {
    case 'event':   return 'Add to Calendar'
    case 'task':    return 'Add to Reminders'
    case 'message': return 'Draft Message'
    default:        return 'Save to Notes'
  }
}

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
  const [isListening, setIsListening] = useState(false)
  const [pendingCards, setPendingCards] = useState(INITIAL_PENDING)
  const [removingIds, setRemovingIds] = useState(new Set())
  const [confirmedIds, setConfirmedIds] = useState(new Set())

  // Recording hook — starts/stops mic, sends audio to sidecar, surfaces items
  const { startRecording, stopRecording, isProcessing, error: recordingError } = useRecording({
    onItemsExtracted: useCallback((items, _transcript) => {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const newCards = items.map((item, i) => ({
        id:     Date.now() + i,
        title:  item.title,
        type:   item.type || 'note',
        meta:   `Caught at ${timeStr} · Today`,
        quote:  item.quote || '',
        action: actionForType(item.type),
      }))
      setPendingCards((prev) => [...newCards, ...prev])
      setActiveSection('pending')
    }, []),
  })

  // Sync isListening state → actual mic recording
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (isListening) {
      startRecording().catch((err) => {
        console.error('[hark] mic error:', err.message)
        setIsListening(false)
        if (window.__TAURI__) {
          window.__TAURI__.tauri.invoke('set_listening', { listening: false }).catch(() => {})
        }
      })
    } else {
      stopRecording()
    }
  }, [isListening])

  // Listen for tray toggle events from Rust
  useEffect(() => {
    if (!window.__TAURI__) return
    let unlisten
    window.__TAURI__.event
      .listen('listening-changed', (event) => {
        setIsListening(event.payload)
      })
      .then((fn) => { unlisten = fn })
    return () => { if (unlisten) unlisten() }
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
      {/* Invisible drag region for the main content title-bar zone */}
      <div className="fixed top-0 right-0 h-9 z-50" style={{ left: '212px' }} data-tauri-drag-region />
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        isListening={isListening}
        onToggleListening={handleToggleListening}
        pendingCount={pendingCards.length}
        isProcessing={isProcessing}
        recordingError={recordingError}
      />
      <main className="flex-1 flex flex-col min-h-0 bg-hark-bg">
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
