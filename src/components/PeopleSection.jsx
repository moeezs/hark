const PEOPLE = [
  { initials: 'JK', name: 'Jake',  count: '8 mentions · 3 days' },
  { initials: 'SR', name: 'Sarah', count: '5 mentions · 2 days' },
  { initials: 'AL', name: 'Alex',  count: '4 mentions · today'  },
  { initials: 'TM', name: 'Tom',   count: '3 mentions · yesterday' },
  { initials: 'MK', name: 'Mike',  count: '2 mentions · today'  },
  { initials: 'MA', name: 'Maya',  count: '2 mentions · 2 days' },
]

export default function PeopleSection() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">People</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">Everyone mentioned in your conversations.</p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 max-w-[640px]">
          {PEOPLE.map((p) => (
            <div
              key={p.name}
              className="bg-hark-surface border border-hark-border rounded-[9px] px-4 py-[14px] cursor-pointer transition-all duration-[120ms] hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] hover:border-hark-teal-border"
            >
              <div className="w-[34px] h-[34px] rounded-full bg-hark-teal-soft border border-hark-teal-border flex items-center justify-center text-[11.5px] font-semibold text-hark-teal mb-[9px] tracking-[0.02em]">
                {p.initials}
              </div>
              <div className="text-[13px] font-medium text-hark-text mb-[2px]">{p.name}</div>
              <div className="text-[11px] text-hark-muted">{p.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
