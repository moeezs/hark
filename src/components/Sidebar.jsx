const NAV_GROUPS = [
  {
    label: 'Library',
    items: [
      {
        id: 'pending',
        label: 'Pending',
        icon: (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M4.5 7.5h6M4.5 5h4M4.5 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: 'notes',
        label: 'Notes',
        icon: (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 3.5h11M2 7.5h11M2 11.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Explore',
    items: [
      {
        id: 'people',
        label: 'People',
        icon: (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M2 13c0-2.76 2.46-5 5.5-5s5.5 2.24 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        id: 'topics',
        label: 'Topics',
        icon: (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M2 2h4v4H2zM9 2h4v4H9zM2 9h4v4H2zM9 9h4v4H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        id: 'search',
        label: 'Search',
        icon: (
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
]

export default function Sidebar({ activeSection, setActiveSection, isListening, onToggleListening, pendingCount }) {
  return (
    <aside className="w-[212px] min-w-[212px] h-screen bg-hark-surface border-r border-hark-border flex flex-col overflow-hidden">

      {/* Logo — pt-11 = 44px for macOS titlebar overlay */}
      <div className="flex items-center gap-2 px-[18px] pb-4 pt-11">
        <img src="/icon.png" width="26" height="26" alt="Hark" className="rounded-[6px] object-contain" />
        <span className="text-[17px] font-semibold tracking-[-0.4px] text-hark-teal">hark</span>
      </div>

      {/* Status pill */}
      <div className="mx-3 mb-1 px-[11px] py-2 bg-hark-teal-soft border border-hark-teal-border rounded-[9px] flex items-center gap-[7px]">
        <span
          className={[
            'w-[6px] h-[6px] rounded-full flex-shrink-0',
            isListening ? 'bg-hark-teal animate-pulse-status' : 'bg-hark-muted-light',
          ].join(' ')}
        />
        <span className={['text-xs font-medium flex-1', isListening ? 'text-hark-teal-dark' : 'text-hark-muted'].join(' ')}>
          {isListening ? 'Listening' : 'Paused'}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pt-2 pb-1 flex flex-col gap-[1px] overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            <span className="block text-[10px] font-semibold tracking-[0.07em] uppercase text-hark-muted-light px-[10px] pt-[10px] pb-1">
              {group.label}
            </span>
            {group.items.map((item) => {
              const isActive = activeSection === item.id
              return (
                <a
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={[
                    'flex items-center gap-2 px-[10px] py-[7px] rounded-[6px] text-[13px] cursor-pointer transition-colors duration-100 select-none',
                    isActive
                      ? 'bg-hark-teal-soft text-hark-teal-dark font-medium'
                      : 'text-hark-text-2 font-normal hover:bg-hark-bg hover:text-hark-text',
                  ].join(' ')}
                >
                  <span className={['flex-shrink-0', isActive ? 'opacity-100 text-hark-teal' : 'opacity-50'].join(' ')}>
                    {item.icon}
                  </span>
                  {item.label}
                  {item.id === 'pending' && pendingCount > 0 && (
                    <span className="ml-auto bg-hark-teal text-white text-[10px] font-semibold font-mono px-[6px] py-[1px] rounded-full leading-[1.6]">
                      {pendingCount}
                    </span>
                  )}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Toggle button */}
      <div className="p-3 border-t border-hark-border-light">
        <button
          onClick={onToggleListening}
          className={[
            'w-full px-3 py-2 rounded-[9px] border-[1.5px] text-[12.5px] font-medium flex items-center justify-center gap-[6px] transition-all duration-[120ms] cursor-pointer',
            isListening
              ? 'border-hark-teal bg-hark-teal text-white hover:bg-hark-teal-dark hover:border-hark-teal-dark'
              : 'border-hark-border bg-transparent text-hark-muted hover:border-hark-teal-border hover:text-hark-teal',
          ].join(' ')}
        >
          {isListening ? (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
                <rect x="4.5" y="4.5" width="4" height="4" rx="1" fill="currentColor" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 4.5l4 2-4 2z" fill="currentColor" />
              </svg>
              Start
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
