import { useState, useRef, useEffect, useCallback } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

const SUGGESTIONS = [
  "What were all my tasks for today?",
  "What was I talking about an hour ago?",
  "Whose birthday party is coming up soon?",
  "Who have I been mentioning the most?",
  "Any follow-ups I need to take care of?",
  "What meetings do I have scheduled?",
];

// ── Inline markdown: **bold**, bullet lists ───────────────────────────────────
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      p
    ),
  );
}

function renderMarkdown(text) {
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} className="list-disc pl-4 space-y-[3px] my-[5px]">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const isBullet =
      trimmed.startsWith("- ") ||
      trimmed.startsWith("• ") ||
      /^\d+\.\s/.test(trimmed);

    if (isBullet) {
      listBuffer.push(
        trimmed.replace(/^[-•]\s/, "").replace(/^\d+\.\s/, ""),
      );
    } else {
      flushList(idx);
      if (trimmed) {
        elements.push(
          <p key={`p-${idx}`} className="mb-[3px] last:mb-0">
            {renderInline(trimmed)}
          </p>,
        );
      }
    }
  });
  flushList("end");
  return elements;
}

// ── Typing dots indicator ─────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-[5px] h-[18px] px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-hark-muted-light"
          style={{
            animation: "typing-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function ChatSection() {
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', content}]
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  const send = useCallback(
    async (text) => {
      const content = (text || input).trim();
      if (!content || isLoading) return;

      setInput("");
      setError(null);

      const newMessages = [...messages, { role: "user", content }];
      setMessages(newMessages);
      setIsLoading(true);

      try {
        const res = await fetch(`${SERVER_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map(({ role, content }) => ({
              role,
              content,
            })),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server error (${res.status})`);
        }

        const { reply } = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: reply },
        ]);
      } catch (err) {
        setError(err.message);
        // Remove the user message so they can retry
        setMessages(messages);
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [input, messages, isLoading],
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-8 pt-9 pb-5 flex items-end justify-between flex-shrink-0 border-b border-hark-border-light">
        <div>
          <h1 className="text-[19px] font-semibold tracking-[-0.3px] text-hark-text">
            Ask Hark
          </h1>
          <p className="text-[12.5px] text-hark-muted mt-[3px]">
            Ask anything about your captured notes and conversations.
          </p>
        </div>
        {!isEmpty && (
          <button
            onClick={handleNewChat}
            className="flex items-center gap-[6px] text-[12px] text-hark-muted hover:text-hark-text border border-hark-border hover:border-hark-teal-border bg-hark-surface hover:bg-hark-teal-soft px-3 py-[6px] rounded-[7px] transition-all duration-100 font-medium select-none"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="flex-shrink-0"
            >
              <path
                d="M10 2a5 5 0 1 0 .9 5.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M10 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            New chat
          </button>
        )}
      </div>

      {/* ── Messages / Empty state ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6">
        {isEmpty ? (
          /* Empty state */
          <div className="flex flex-col items-center pt-10 max-w-[520px] mx-auto">
            <div className="w-[44px] h-[44px] rounded-[12px] bg-hark-teal-soft border border-hark-teal-border flex items-center justify-center mb-5">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path
                  d="M3 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6.5L2 19V5.5a1 1 0 0 1 1-1Z"
                  stroke="#2EC4B6"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M7 9h8M7 12h5"
                  stroke="#2EC4B6"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-[15.5px] font-semibold text-hark-text tracking-[-0.2px] mb-[6px]">
              What do you want to know?
            </p>
            <p className="text-[12.5px] text-hark-muted text-center mb-7 leading-[1.5]">
              Ask about your tasks, notes, people, events — anything Hark has
              captured.
            </p>
            <div className="grid grid-cols-2 gap-[7px] w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-[12.5px] text-hark-text-2 bg-hark-surface border border-hark-border rounded-[9px] px-4 py-3 hover:border-hark-teal-border hover:bg-hark-teal-soft hover:text-hark-teal-dark transition-all duration-100 leading-[1.45] font-normal"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="flex flex-col gap-4 max-w-[680px] mx-auto">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                /* User bubble */
                <div key={i} className="flex justify-end">
                  <div className="max-w-[75%] bg-hark-teal text-white text-[13px] leading-[1.5] px-4 py-[10px] rounded-[14px] rounded-tr-[4px]">
                    {msg.content}
                  </div>
                </div>
              ) : (
                /* Assistant bubble */
                <div key={i} className="flex justify-start gap-[10px]">
                  <div className="w-[28px] h-[28px] rounded-full bg-hark-teal-soft border border-hark-teal-border flex items-center justify-center flex-shrink-0 mt-[1px]">
                    <svg width="13" height="13" viewBox="0 0 22 22" fill="none">
                      <path
                        d="M3 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6.5L2 19V5.5a1 1 0 0 1 1-1Z"
                        stroke="#2EC4B6"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="max-w-[82%] bg-hark-surface border border-hark-border text-hark-text text-[13px] leading-[1.55] px-4 py-[10px] rounded-[14px] rounded-tl-[4px]">
                    {renderMarkdown(msg.content)}
                  </div>
                </div>
              ),
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start gap-[10px]">
                <div className="w-[28px] h-[28px] rounded-full bg-hark-teal-soft border border-hark-teal-border flex items-center justify-center flex-shrink-0 mt-[1px]">
                  <svg width="13" height="13" viewBox="0 0 22 22" fill="none">
                    <path
                      d="M3 4.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6.5L2 19V5.5a1 1 0 0 1 1-1Z"
                      stroke="#2EC4B6"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="bg-hark-surface border border-hark-border px-4 py-[11px] rounded-[14px] rounded-tl-[4px]">
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-center">
                <p className="inline-block text-[12px] text-red-500 bg-red-50 border border-red-200 px-4 py-[7px] rounded-[8px]">
                  {error} —{" "}
                  <button
                    onClick={() => setError(null)}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    dismiss
                  </button>
                </p>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-hark-border-light px-8 py-4">
        <div className="max-w-[680px] mx-auto flex items-end gap-3 bg-hark-surface border border-hark-border rounded-[12px] px-4 py-[10px] focus-within:border-hark-teal-border transition-colors duration-100">
          <textarea
            ref={(el) => {
              textareaRef.current = el;
              inputRef.current = el;
            }}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your notes…"
            disabled={isLoading}
            className="flex-1 bg-transparent resize-none outline-none text-[13.5px] text-hark-text placeholder:text-hark-muted-light leading-[1.5] min-h-[22px] max-h-[120px] font-sans disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-[32px] h-[32px] rounded-[8px] flex items-center justify-center transition-all duration-100 disabled:opacity-30 bg-hark-teal text-white hover:bg-hark-teal-dark disabled:bg-hark-muted-light disabled:text-white mb-[1px]"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 12V2M2 7l5-5 5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-hark-muted-light text-center mt-[7px]">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* Typing animation keyframes injected once */}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
