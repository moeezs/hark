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

const TOPIC_ICON = {
  event: (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
      <rect x="1.5" y="2.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1v3M10 1v3M1.5 6.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  task: (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  message: (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
      <path d="M2 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4.5L1.5 14V3.5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  note: (
    <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
      <path d="M3 2.5h9a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 6h5M5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

function formatExact(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return (
    d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

export default function TopicsSection({ topics = [], onDeleteNote }) {
  const [selected, setSelected] = useState(null); // topic object {label, count}
  const [detailItems, setDetailItems] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());

  const openTopic = useCallback(async (topic) => {
    setSelected(topic);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/topics/${encodeURIComponent(topic.label)}/items`);
      const data = await res.json();
      setDetailItems(data);
    } catch (_) {
      setDetailItems([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Reset selection when topic disappears (all items deleted)
  useEffect(() => {
    if (selected && !topics.find((t) => t.label === selected.label)) {
      setSelected(null);
    }
  }, [topics, selected]);

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
        <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">Topics</h1>
        <p className="text-[12.5px] text-hark-muted mt-[3px]">
          Themes Hark can actually pull back from confirmed items.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 pt-[18px]">
        {/* Left: topic list */}
        <div
          className={[
            "flex-shrink-0 px-8 pb-10 overflow-y-auto transition-all duration-200",
            selected ? "w-[280px] min-w-[280px]" : "w-full",
          ].join(" ")}
        >
          {topics.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-[10px] text-hark-muted-light pt-20">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="4" y="4" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
                <rect x="23" y="4" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
                <rect x="4" y="23" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
                <rect x="23" y="23" width="13" height="13" rx="3" stroke="#C4C0BA" strokeWidth="1.5" />
              </svg>
              <p className="text-[13px] text-center max-w-[240px]">
                No topics yet. Confirm some notes to see breakdowns here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-[5px] max-w-[500px]">
              {topics.map((topic) => {
                const isActive = selected?.label === topic.label;
                return (
                  <div
                    key={topic.label}
                    onClick={() => isActive ? setSelected(null) : openTopic(topic)}
                    className={[
                      "rounded-[9px] px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-[120ms]",
                      isActive
                        ? "bg-hark-teal-soft border border-hark-teal-border shadow-[0_1px_8px_rgba(0,0,0,0.05)]"
                        : "bg-hark-surface border border-hark-border hover:shadow-[0_1px_8px_rgba(0,0,0,0.05)] hover:border-hark-teal-border",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex-shrink-0",
                        isActive ? "text-hark-teal" : "text-hark-muted opacity-60",
                      ].join(" ")}
                    >
                      {TOPIC_ICON[topic.label] || TOPIC_ICON.note}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-hark-text mb-[2px] capitalize">
                        {topic.label}
                      </div>
                      <div className="text-[11px] text-hark-muted">
                        {topic.count} item{topic.count !== 1 ? "s" : ""} confirmed
                      </div>
                    </div>
                    <span
                      className={[
                        "text-xs font-mono flex-shrink-0",
                        isActive ? "text-hark-teal-dark font-semibold" : "text-hark-muted",
                      ].join(" ")}
                    >
                      {topic.count}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className={["flex-shrink-0 text-hark-muted-light transition-transform duration-150", isActive ? "rotate-90" : ""].join(" ")}
                    >
                      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
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
              <span className="text-hark-teal flex-shrink-0">
                {TOPIC_ICON[selected.label] || TOPIC_ICON.note}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-hark-text leading-tight capitalize truncate">
                  {selected.label}
                </div>
                <div className="text-[11.5px] text-hark-muted mt-[1px]">
                  {detailItems.length} item{detailItems.length !== 1 ? "s" : ""}
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

            {/* Item list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading && (
                <p className="text-[12.5px] text-hark-muted-light text-center py-10">Loading…</p>
              )}
              {!detailLoading && detailItems.length === 0 && (
                <p className="text-[12.5px] text-hark-muted-light text-center py-10">No items found.</p>
              )}
              {!detailLoading &&
                detailItems.map((item) => {
                  const isDeleting = deletingIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={[
                        "group flex items-start gap-3 py-[11px] border-b border-hark-border-light last:border-b-0 transition-opacity duration-200",
                        isDeleting ? "opacity-0" : "opacity-100",
                      ].join(" ")}
                    >
                      <span className="mt-[2px] flex-shrink-0 text-hark-muted opacity-60">
                        {TYPE_ICON[item.type] || TYPE_ICON.note}
                      </span>

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

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isDeleting}
                        className="flex-shrink-0 mt-[2px] opacity-0 group-hover:opacity-100 w-[26px] h-[26px] flex items-center justify-center rounded-full text-hark-muted hover:bg-red-50 hover:text-red-500 transition-all duration-100"
                        aria-label="Delete item"
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
