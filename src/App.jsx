import { useState, useEffect, useCallback, useRef } from 'react'
import { useRecording } from './hooks/useRecording'
import { useData } from './hooks/useData'
import Sidebar from './components/Sidebar'
import PendingSection from './components/PendingSection'
import NotesSection from './components/NotesSection'
import PeopleSection from './components/PeopleSection'
import TopicsSection from './components/TopicsSection'
import SearchSection from './components/SearchSection'

export default function App() {
  const [activeSection, setActiveSection] = useState('notes')
  const [isListening, setIsListening] = useState(false)
  const [removingIds, setRemovingIds] = useState(new Set())
  const [confirmedIds, setConfirmedIds] = useState(new Set())

  const {
    notes,
    pending,
    people,
    topics,
    transcripts,
    isLoading,
    confirmItem,
    dismissItem,
    searchItems,
    addPendingItems,
    reconcilePendingItems,
    markPendingItemsSaveFailed,
  } = useData()

  // Recording hook — starts/stops mic, sends audio to sidecar, surfaces items
  const { startRecording, stopRecording, isProcessing, error: recordingError } = useRecording({
    onItemsExtracted: useCallback((items) => {
      addPendingItems(items)
      setActiveSection('pending')
    }, [addPendingItems]),
    onItemsSaved: useCallback((items) => {
      reconcilePendingItems(items)
    }, [reconcilePendingItems]),
    onItemsSaveFailed: useCallback((clientKeys) => {
      markPendingItemsSaveFailed(clientKeys)
      setActiveSection('pending')
    }, [markPendingItemsSaveFailed]),
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
      dismissItem(id)
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
      confirmItem(id)
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
        pendingCount={pending.length}
        isProcessing={isProcessing}
        recordingError={recordingError}
      />
      <main className="flex-1 flex flex-col min-h-0 bg-hark-bg">
        {activeSection === 'pending' && (
          <PendingSection
            cards={pending}
            removingIds={removingIds}
            confirmedIds={confirmedIds}
            onDismiss={dismissCard}
            onConfirm={confirmCard}
          />
        )}
        {activeSection === 'notes'   && <NotesSection notes={notes} transcripts={transcripts} isLoading={isLoading} />}
        {activeSection === 'people'  && <PeopleSection people={people} />}
        {activeSection === 'topics'  && <TopicsSection topics={topics} />}
        {activeSection === 'search'  && <SearchSection searchItems={searchItems} />}
      </main>
    </div>
  )
}
