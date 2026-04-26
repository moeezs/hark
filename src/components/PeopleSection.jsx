function lastSeenLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function PeopleSection({ people = [] }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">
          People
        </h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">
          People and teams pulled from confirmed conversation context.
        </p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto flex flex-col">
        {people.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-[10px] text-hark-muted-light">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="14" r="7" stroke="#C4C0BA" strokeWidth="1.5" />
              <path d="M6 36c0-7 6.3-13 14-13s14 6 14 13" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px]">
              No people detected yet. Confirm some notes and names will appear
              here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 max-w-[640px]">
            {people.map((person) => (
              <div
                key={person.name}
                className="bg-hark-surface border border-hark-border rounded-[9px] px-4 py-[14px] cursor-pointer transition-all duration-[120ms] hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] hover:border-hark-teal-border"
              >
                <div className="w-[34px] h-[34px] rounded-full bg-hark-teal-soft border border-hark-teal-border flex items-center justify-center text-[11.5px] font-semibold text-hark-teal mb-[9px] tracking-[0.02em]">
                  {person.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="text-[13px] font-medium text-hark-text mb-[2px]">
                  {person.name}
                </div>
                <div className="text-[11px] text-hark-muted">
                  {person.mentions} mention{person.mentions !== 1 ? "s" : ""} ·{" "}
                  {lastSeenLabel(person.lastSeen)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
