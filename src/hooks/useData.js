import { useState, useEffect, useCallback, useRef } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

// Dispatch a confirmed card to a native macOS app via Tauri.
// Only `note`-type cards have a working native integration today; the other
// types still confirm in Snowflake but skip the native step until their
// integrations are wired in a follow-up.
// In a non-Tauri context (e.g. plain browser dev), every type is a no-op.
async function dispatchToNative(card) {
  if (!window.__TAURI__) return;

  const { invoke } = window.__TAURI__.tauri;

  switch (card.type) {
    case "note":
      return invoke("add_to_notes", {
        entryTitle: card.title,
        entryBody: card.context || card.quote || "",
      });
    case "message":
      return invoke("draft_message", {
        messageBody: card.context || card.quote || card.title,
      });
    case "event":
      return invoke("add_to_calendar", {
        title: card.title,
        startDate: card.datetime || "",
        notes: card.quote || card.context || "",
      });
    case "task":
      return invoke("add_to_reminders", {
        title: card.title,
        dueDate: card.datetime || null,
        notes: card.quote || card.context || "",
      });
    default:
      return;
  }
}

function actionForType(type) {
  switch (type) {
    case "event":
      return "Add to Calendar";
    case "task":
      return "Add to Reminders";
    case "message":
      return "Draft Message";
    default:
      return "Save to Notes";
  }
}

function formatMeta(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const timeStr = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const daysDiff = Math.floor((now - d) / 86400000);
  if (daysDiff === 0) return `Caught at ${timeStr} · Today`;
  if (daysDiff === 1) return `Caught at ${timeStr} · Yesterday`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function toCard(item, overrides = {}) {
  return {
    id: item.id,
    clientKey: item.clientKey || null,
    title: item.title,
    type: item.type,
    meta: formatMeta(item.createdAt),
    quote: item.quote || "",
    context: item.context || "",
    datetime: item.datetime || "",
    people: Array.isArray(item.people) ? item.people : [],
    topics: Array.isArray(item.topics) ? item.topics : [],
    action: actionForType(item.type),
    confirmed: item.confirmed,
    createdAt: item.createdAt,
    isSyncing: overrides.isSyncing ?? Boolean(item.isSyncing),
    syncError: overrides.syncError ?? Boolean(item.syncError),
  };
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );
}

export function useData() {
  const [notes, setNotes] = useState([]);
  const [pending, setPending] = useState([]);
  const [people, setPeople] = useState([]);
  const [topics, setTopics] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const didInitRef = useRef(false);

  // Keep a ref mirror of pending so we can read it synchronously
  const pendingRef = useRef([]);
  const updatePending = useCallback((updater) => {
    setPending((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      pendingRef.current = next;
      return next;
    });
  }, []);

  // Track clientKeys that were confirmed/dismissed while still local
  const confirmedClientKeysRef = useRef(new Set());
  const dismissedClientKeysRef = useRef(new Set());

  const fetchNotes = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/items`);
    if (!res.ok) throw new Error(`/items ${res.status}`);
    const data = await res.json();
    setNotes(data.map((item) => toCard(item)));
  }, []);

  const fetchPending = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/items/pending`);
    if (!res.ok) throw new Error(`/items/pending ${res.status}`);
    const data = await res.json();

    updatePending((prev) => {
      const dbCards = data.map((item) => toCard(item));
      const dbClientKeys = new Set(
        dbCards.map((card) => card.clientKey).filter(Boolean),
      );
      const localOnly = prev.filter(
        (card) =>
          (card.isSyncing || card.syncError) &&
          (!card.clientKey || !dbClientKeys.has(card.clientKey)),
      );
      return sortByCreatedAtDesc([...localOnly, ...dbCards]);
    });
  }, [updatePending]);

  const fetchPeople = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/people`);
    if (!res.ok) throw new Error(`/people ${res.status}`);
    setPeople(await res.json());
  }, []);

  const fetchTopics = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/topics`);
    if (!res.ok) throw new Error(`/topics ${res.status}`);
    setTopics(await res.json());
  }, []);

  const fetchTranscripts = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/transcripts`);
    if (!res.ok) throw new Error(`/transcripts ${res.status}`);
    setTranscripts(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        fetchNotes(),
        fetchPending(),
        fetchPeople(),
        fetchTopics(),
        fetchTranscripts(),
      ]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [fetchNotes, fetchPending, fetchPeople, fetchTopics, fetchTranscripts]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    setIsLoading(true);
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  // Confirm a pending card. Removes from pending, adds to notes feed, fires
  // native dispatch in the background, and confirms on Snowflake in the
  // background. Returns immediately so callers can drive the fade animation
  // without waiting on osascript or the network.
  const confirmItem = useCallback(
    (id) => {
      const card = pendingRef.current.find((c) => c.id === id);
      if (!card) {
        console.warn("[hark] confirmItem: card not found for id", id);
        return;
      }

      // Move card from pending to notes immediately
      updatePending((prev) => prev.filter((c) => c.id !== id));
      setNotes((prev) =>
        sortByCreatedAtDesc([{ ...card, confirmed: true }, ...prev]),
      );

      // Native dispatch — fire and forget. If it fails, surface the error
      // but don't put the card back; the user already moved on.
      dispatchToNative(card).catch((err) => {
        console.warn("[hark] native dispatch failed:", err);
        setError(
          typeof err === "string"
            ? err
            : err?.message || "Native dispatch failed",
        );
      });

      // Snowflake confirm — also background.
      if (id.startsWith("local-")) {
        if (card.clientKey) {
          confirmedClientKeysRef.current.add(card.clientKey);
        }
        return;
      }

      fetch(`${SERVER_URL}/items/${id}/confirm`, { method: "POST" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return Promise.all([fetchPeople(), fetchTopics()]);
        })
        .catch((err) => {
          console.warn("[hark] confirm failed:", err.message);
          refresh().catch(() => {});
        });
    },
    [updatePending, fetchPeople, fetchTopics, refresh],
  );

  const dismissItem = useCallback(
    async (id) => {
      const currentPending = pendingRef.current;
      const card = currentPending.find((c) => c.id === id);

      // Remove from pending immediately
      updatePending((prev) => prev.filter((c) => c.id !== id));

      if (!card) return;

      if (id.startsWith("local-")) {
        // Save hasn't finished — track for deferred delete
        if (card.clientKey) {
          dismissedClientKeysRef.current.add(card.clientKey);
          console.log("[hark] deferred dismiss for clientKey", card.clientKey);
        }
      } else {
        // Real Snowflake ID — delete on server
        try {
          console.log("[hark] dismissing on server:", id);
          await fetch(`${SERVER_URL}/items/${id}`, { method: "DELETE" });
        } catch (err) {
          console.warn("[hark] dismiss failed:", err.message);
        }
      }
    },
    [updatePending],
  );

  const searchItems = useCallback(async (q) => {
    if (!q.trim()) return [];
    const res = await fetch(
      `${SERVER_URL}/items/search?q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) throw new Error(`/items/search ${res.status}`);
    const data = await res.json();
    return data.map((item) => toCard(item));
  }, []);

  const addPendingItems = useCallback(
    (items) => {
      const nowIso = new Date().toISOString();
      const newCards = items.map((item, i) =>
        toCard(
          {
            id: `local-${item.clientKey || `${Date.now()}-${i}`}`,
            clientKey: item.clientKey || null,
            title: item.title,
            type: item.type || "note",
            quote: item.quote || "",
            context: item.context || "",
            datetime: item.datetime || "",
            people: item.people || [],
            topics: item.topics || [],
            confirmed: false,
            createdAt: nowIso,
            isSyncing: true,
          },
          { isSyncing: true },
        ),
      );

      updatePending((prev) => sortByCreatedAtDesc([...newCards, ...prev]));
    },
    [updatePending],
  );

  const reconcilePendingItems = useCallback(
    (savedItems) => {
      if (!Array.isArray(savedItems) || savedItems.length === 0) return;
      const savedCards = savedItems.map((item) => toCard(item));

      updatePending((prev) => {
        const next = [...prev];

        for (const savedCard of savedCards) {
          const idx = next.findIndex(
            (card) => card.clientKey && card.clientKey === savedCard.clientKey,
          );
          if (idx >= 0) next[idx] = savedCard;
          else next.unshift(savedCard);
        }

        return sortByCreatedAtDesc(next);
      });

      // Process any deferred confirm/dismiss actions
      const confirmedKeys = confirmedClientKeysRef.current;
      const dismissedKeys = dismissedClientKeysRef.current;

      for (const savedCard of savedCards) {
        const ck = savedCard.clientKey;
        if (!ck) continue;

        if (confirmedKeys.has(ck)) {
          confirmedKeys.delete(ck);
          console.log("[hark] auto-confirming deferred item:", savedCard.id);
          // Remove from pending, add to notes
          updatePending((prev) => prev.filter((c) => c.clientKey !== ck));
          setNotes((prev) =>
            sortByCreatedAtDesc([{ ...savedCard, confirmed: true }, ...prev]),
          );
          // Confirm on server
          fetch(`${SERVER_URL}/items/${savedCard.id}/confirm`, {
            method: "POST",
          })
            .then(() => {
              fetchPeople().catch(() => {});
              fetchTopics().catch(() => {});
            })
            .catch((e) =>
              console.warn("[hark] deferred confirm failed:", e.message),
            );
        } else if (dismissedKeys.has(ck)) {
          dismissedKeys.delete(ck);
          console.log("[hark] auto-dismissing deferred item:", savedCard.id);
          updatePending((prev) => prev.filter((c) => c.clientKey !== ck));
          fetch(`${SERVER_URL}/items/${savedCard.id}`, {
            method: "DELETE",
          }).catch((e) =>
            console.warn("[hark] deferred dismiss failed:", e.message),
          );
        }
      }
    },
    [updatePending, fetchPeople, fetchTopics],
  );

  const markPendingItemsSaveFailed = useCallback(
    (clientKeys) => {
      const failed = new Set(clientKeys || []);
      if (failed.size === 0) return;

      updatePending((prev) =>
        prev.map((card) =>
          card.clientKey && failed.has(card.clientKey)
            ? { ...card, isSyncing: false, syncError: true }
            : card,
        ),
      );
    },
    [updatePending],
  );

  const deleteNote = useCallback(
    async (id) => {
      // Optimistic: remove from notes immediately
      setNotes((prev) => prev.filter((n) => n.id !== id));

      try {
        await fetch(`${SERVER_URL}/items/${id}`, { method: "DELETE" });
        // Refresh people & topics counts after deletion
        await Promise.all([fetchPeople(), fetchTopics()]);
      } catch (err) {
        console.warn("[hark] deleteNote failed:", err.message);
        // Restore on failure
        refresh().catch(() => {});
      }
    },
    [fetchPeople, fetchTopics, refresh],
  );

  return {
    notes,
    pending,
    people,
    topics,
    transcripts,
    isLoading,
    error,
    confirmItem,
    dismissItem,
    searchItems,
    addPendingItems,
    reconcilePendingItems,
    markPendingItemsSaveFailed,
    deleteNote,
    refresh,
  };
}
