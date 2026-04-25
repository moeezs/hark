const TYPE_BADGE = {
  event:   'text-hark-teal-dark bg-hark-teal-soft border-hark-teal-border',
  task:    'text-[#5C4810] bg-[#FAF3E6] border-[#E5D098]',
  note:    'text-[#2E4A20] bg-[#EDF4E8] border-[#B8D4A8]',
  message: 'text-[#32245A] bg-[#F0EBF8] border-[#C8B8E8]',
}

export default function PendingSection({ cards, removingIds, confirmedIds, onDismiss, onConfirm }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Pending</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Review what Hark caught. Confirm to save, or dismiss.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[10px] max-w-[600px]">

          {cards.length === 0 && (
            <div className="text-center py-14 px-5 text-hark-muted-light">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mx-auto mb-[10px]">
                <circle cx="20" cy="20" r="18" stroke="#C4C0BA" strokeWidth="1.5" />
                <path d="M14 20h12M20 14v12" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-[13px]">All caught up</p>
            </div>
          )}

          {cards.map((card) => {
            const isRemoving  = removingIds.has(card.id)
            const isConfirmed = confirmedIds.has(card.id)
            return (
              <div
                key={card.id}
                className={[
                  'bg-hark-surface border border-hark-border rounded-[9px] p-[18px]',
                  'transition-all duration-[180ms] hover:shadow-[0_2px_14px_rgba(0,0,0,0.06)]',
                  isRemoving ? 'opacity-0 -translate-x-2' : 'opacity-100 translate-x-0',
                ].join(' ')}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 mb-[5px]">
                  <span className="text-[13.5px] font-medium text-hark-text leading-[1.45]">{card.title}</span>
                  <span className={`flex-shrink-0 text-[10px] font-semibold tracking-[0.05em] uppercase px-2 py-[3px] rounded-full border leading-[1.5] ${TYPE_BADGE[card.type] ?? ''}`}>
                    {card.type}
                  </span>
                </div>

                {/* Meta */}
                <div className="text-[11px] text-hark-muted font-mono mb-[9px]">{card.meta}</div>

                {/* Quote */}
                <div className="text-xs text-hark-muted italic px-[11px] py-[7px] bg-hark-bg border-l-2 border-hark-teal-border rounded-r-[4px] mb-[13px] leading-[1.55]">
                  {card.quote}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => !isConfirmed && onConfirm(card.id)}
                    disabled={isConfirmed}
                    className="px-[14px] py-[6.5px] bg-hark-teal text-white border-none rounded-[6px] text-xs font-medium cursor-pointer transition-colors duration-[120ms] hover:bg-hark-teal-dark disabled:bg-[#2A8A60] disabled:cursor-default font-sans"
                  >
                    {isConfirmed ? '✓ Done' : card.action}
                  </button>
                  <button
                    onClick={() => onDismiss(card.id)}
                    className="px-[10px] py-[6.5px] bg-transparent text-hark-muted border-none text-xs cursor-pointer rounded-[6px] transition-colors duration-100 hover:text-hark-text-2 hover:bg-hark-bg font-sans"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
