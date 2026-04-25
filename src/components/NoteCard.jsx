export const NOTE_ICON_CONFIG = {
  event: {
    bg: 'bg-hark-teal-soft',
    svg: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="2.5" width="12" height="10.5" rx="1.5" stroke="#1A6B7A" strokeWidth="1.3" />
        <path d="M1 5.5h12" stroke="#1A6B7A" strokeWidth="1.3" />
        <path d="M4.5 1v3M9.5 1v3" stroke="#1A6B7A" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  task: {
    bg: 'bg-[#FAF3E6]',
    svg: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="#8A6A1A" strokeWidth="1.3" />
        <path d="M4.5 7l2 2 3-3" stroke="#8A6A1A" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  note: {
    bg: 'bg-[#EDF4E8]',
    svg: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2.5 2.5h9v7.5l-2.5 2.5H2.5z" stroke="#3A5A2A" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M4.5 5.5h5M4.5 7.5h3" stroke="#3A5A2A" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
}

export default function NoteCard({ type, title, time, sub }) {
  const icon = NOTE_ICON_CONFIG[type] ?? NOTE_ICON_CONFIG.note
  return (
    <div className="bg-hark-surface border border-hark-border rounded-[9px] px-[14px] py-3 mb-[6px] flex items-start gap-[11px] cursor-pointer transition-all duration-[120ms] hover:shadow-[0_1px_10px_rgba(0,0,0,0.05)] hover:border-hark-teal-border">
      <div className={`w-7 h-7 rounded-[7px] flex items-center justify-center flex-shrink-0 mt-[1px] ${icon.bg}`}>
        {icon.svg}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-normal text-hark-text mb-[3px] leading-[1.4] truncate">{title}</div>
        <div className="text-[11px] text-hark-muted flex items-center gap-[5px]">
          <span className="font-mono text-[10.5px]">{time}</span>
          {sub && (
            <>
              <span className="w-[2px] h-[2px] rounded-full bg-hark-muted-light flex-shrink-0 inline-block" />
              <span>{sub}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
