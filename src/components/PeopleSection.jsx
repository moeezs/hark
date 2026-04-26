import { useState, useCallback, useEffect } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

const TYPE_ICON = {
  event: (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1v3M10 1v3M1.5 6.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  task: (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  message: (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <path d="M2 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4.5L1.5 14V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  note: (
    <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
      <path d="M3 2.5h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 6h5M5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

function formatExact(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function lastSeenLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function PeopleSection({ people = [], onDeleteNote }) {
  const [selected, setSelected] = useState(null); // {name, mentions, lastSeen}
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());

  const openPerson = useCallback(async (person) => {
    setSelected(person);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/people/${encodeURIComponent(person.name)}/items`);
      const data = await res.json();
      setDetailItems(data);
    } catch (_) {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Reset selection when people list changes (e.g. after deletion refreshes data)
  useEffect(() => {
    if (selected && !people.find((p) => p.name === selected.name)) {
      setSelected(null);
    }
  }, [people, selected]);

  const handleDelete = useCallback(
    (id) => {
      setDeletingIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setDetailItems((prev) => prev.filter((item) => item.id !== id));
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onDeleteNote?.(id);
      }, 220);
    },
    [onDeleteNote],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-8 pt-9 flex-shrink-0">
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">People</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">
          People and teams pulled from confirmed conversation context.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 pt-[18px]">
        {/* Left: person grid */}
        <div
          className={[
            "flex-shrink-0 px-8 pb-10 overflow-y-auto transition-all duration-200",
            selected ? "w-[260px] min-w-[260px]" : "w-full",
          ].join(" ")}
        >
          {people.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-[10px] text-hark-muted-light pt-20">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="14" r="7" stroke="#C4C0BA" strokeWidth="1.5" />
                <path d="M6 36c0-7 6.3-13 14-13s14 6 14 13" stroke="#C4C0BA" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-[13px] text-center max-w-[240px]">
                No people detected yet. Confirm some notes and names will appear here.
              </p>
            </div>
          ) : (
            <div
              className={[
                "grid gap-2",
                selected
                  ? "grid-cols-1"
                  : "grid-cols-[repeat(auto-fill,minmax(160px,1fr))] max-w-[640px]",
              ].join(" ")}
            >
              {people.map((person) => {
                const isActive = selected?.name === person.name;
                return (
                  <div
                    key={person.name}
                    onClick={() => isActive ? setSelected(null) : openPerson(person)}
                    className={[
                      "rounded-[9px] px-4 py-[14px] cursor-pointer transition-all duration-[120ms]",
                      isActive
                        ? "bg-hark-teal-soft border border-hark-teal-border shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                        : "bg-hark-surface border border-hark-border hover:shadow-[0_2px_10px_rgba(0,0,0,0.05)] hover:border-hark-teal-border",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "w-[34px] h-[34px] rounded-full border flex items-center justify-center text-[11.5px] font-semibold mb-[9px] tracking-[0.02em]",
                        isActive
                          ? "bg-hark-teal text-white border-hark-teal"
                          : "bg-hark-teal-soft border-hark-teal-border text-hark-teal",
                      ].join(" ")}
                    >
                      {person.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="text-[13px] font-medium text-hark-text mb-[2px] truncate">
                      {person.name}
                    </div>
                    <div className="text-[11px] text-hark-muted">
                      {person.mentions} mention{person.mentions !== 1 ? "s" : ""} ·{" "}
                      {lastSeenLabel(person.lastSeen)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selected && (
          <div className="flex-1 min-w-0 border-l border-hark-border flex flex-col min-h-0">
            {/* Panel header */}
            <div className="px-6 pt-5 pb-4 border-b border-hark-border-light flex items-center gap-3 flex-shrink-0">
              <div className="w-[36px] h-[36px] rounded-full bg-hark-teal text-white flex items-center justify-center text-[12px] font-semibold tracking-[0.02em] flex-shrink-0">
                {selected.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-hark-text leading-tight truncate">
                  {selected.name}
                </div>
                <div className="text-[11.5px] text-hark-muted mt-[1px]">
                  {detailItems.length} mention{detailItems.length !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-[26px] h-[26px] flex items-center justify-center rounded-full text-hark-muted hover:bg-hark-bg hover:text-hark-text transition-colors duration-100 flex-shrink-0"
                aria-label="Close"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Mention list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading && (
                <p className="text-[12.5px] text-hark-muted-light text-center py-10">Loading…</p>
              )}
              {!detailLoading && detailItems.length === 0 && (
                <p className="text-[12.5px] text-hark-muted-light text-center py-10">No mentions found.</p>
              )}
              {!detailLoading && detailItems.map((item) => {
                const isDeleting = deletingIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={[
                      "group flex items-start gap-3 py-[11px] border-b border-hark-border-light last:border-b-0 transition-opacity duration-200",
                      isDeleting ? "opacity-0" : "opacity-100",
                    ].join(" ")}
                  >
                    {/* Type icon */}
                    <span className="mt-[2px] flex-shrink-0 text-hark-muted opacity-60">
                      {TYPE_ICON[item.type] || TYPE_ICON.note}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-hark-text leading-[1.45] font-medium">
                        {item.title}
                      </p>
                      {item.quote && (
                        <p className="text-[11.5px] text-hark-muted mt-[3px] leading-[1.4] italic truncate">
                          "{item.quote}"
                        </p>
                      )}
                      <p className="text-[11px] text-hark-muted-light mt-[5px]">
                        {formatExact(item.createdAt)}
                      </p>
                    </div>

                    {/* Delete button — visible on hover */}
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={isDeleting}
                      className="flex-shrink-0 mt-[2px] opacity-0 group-hover:opacity-100 w-[26px] h-[26px] flex items-center justify-center rounded-full text-hark-muted hover:bg-red-50 hover:text-red-500 transition-all duration-100"
                      aria-label="Delete mention"
                    >
                      <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                        <path d="M3 3.5h9M6 1.5h3M5.5 3.5v9M9.5 3.5v9M2.5 3.5l.5 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l.5-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
