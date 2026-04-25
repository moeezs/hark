const TOPICS = [
  { name: 'Work · Q2 report',       sub: '4 notes across 2 days',  count: 4 },
  { name: 'Weekend plans',           sub: '3 notes · today',         count: 3 },
  { name: 'Apartment hunt',          sub: '3 notes across 4 days',   count: 3 },
  { name: 'Health · Appointments',  sub: '2 notes · this week',      count: 2 },
  { name: 'Finance',                 sub: '2 notes · yesterday',      count: 2 },
  { name: 'Travel · Summer',         sub: '1 note · April 23',        count: 1 },
]

export default function TopicsSection() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Topics</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Themes and subjects from your conversations.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[5px] max-w-[500px]">
          {TOPICS.map((t) => (
            <div
              key={t.name}
              className="bg-hark-surface border border-hark-border rounded-[9px] px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-[120ms] hover:shadow-[0_1px_8px_rgba(0,0,0,0.05)] hover:border-hark-teal-border"
            >
              <div>
                <div className="text-[13px] font-medium text-hark-text mb-[2px]">{t.name}</div>
                <div className="text-[11px] text-hark-muted">{t.sub}</div>
              </div>
              <span className="text-xs font-mono text-hark-muted flex-shrink-0">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
