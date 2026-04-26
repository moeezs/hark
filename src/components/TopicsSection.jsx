export default function TopicsSection({ topics = [] }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">
          Topics
        </h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">
          Themes Hark can actually pull back from confirmed items.
        </p>
      </div>

      <div className="px-8 pt-[18px] pb-10 flex-1 overflow-y-auto flex flex-col">
        {topics.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-[10px] text-hark-muted-light">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect x="4" y="4" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
              <rect x="23" y="4" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
              <rect x="4" y="23" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
              <rect x="23" y="23" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
            </svg>
            <p className="text-[13px]">No topics yet. Confirm some notes to see breakdowns here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-[5px] max-w-[500px]">
            {topics.map((topic) => (
              <div
                key={topic.label}
                className="bg-hark-surface border border-hark-border rounded-[9px] px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-[120ms] hover:shadow-[0_1px_8px_rgba(0,0,0,0.05)] hover:border-hark-teal-border"
              >
                <div>
                  <div className="text-[13px] font-medium text-hark-text mb-[2px] capitalize">
                    {topic.label}
                  </div>
                  <div className="text-[11px] text-hark-muted">
                    {topic.count} item{topic.count !== 1 ? "s" : ""} confirmed
                  </div>
                </div>
                <span className="text-xs font-mono text-hark-muted flex-shrink-0">
                  {topic.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
