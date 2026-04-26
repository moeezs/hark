import { useState, useEffect, useCallback, useRef } from "react";

const SERVER_URL = "http://127.0.0.1:3847";

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

  const confirmItem = useCallback(
    async (id) => {
      // Read from pendingRef synchronously — no closure issues
      const currentPending = pendingRef.current;
      const card = currentPending.find((c) => c.id === id);
      if (!card) {
        console.warn("[hark] confirmItem: card not found for id", id);
        return;
      }

      // Remove from pending, add to notes — do this immediately
      updatePending((prev) => prev.filter((c) => c.id !== id));
      setNotes((prev) =>
        sortByCreatedAtDesc([{ ...card, confirmed: true }, ...prev]),
      );

      if (id.startsWith("local-")) {
        // Save hasn't finished yet — track the clientKey for deferred confirm
        if (card.clientKey) {
          confirmedClientKeysRef.current.add(card.clientKey);
          console.log("[hark] deferred confirm for clientKey", card.clientKey);
        }
      } else {
        // Real Snowflake ID — confirm on server right now
        try {
          console.log("[hark] confirming on server:", id);
          const res = await fetch(`${SERVER_URL}/items/${id}/confirm`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          console.log("[hark] confirmed on server:", id);
          // Refresh people and topics after confirming
          await Promise.all([fetchPeople(), fetchTopics()]);
        } catch (err) {
          console.warn("[hark] confirm failed:", err.message);
          refresh().catch(() => {});
        }
      }
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
            sortByCreatedAtDesc([
              { ...savedCard, confirmed: true },
              ...prev,
            ]),
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
    refresh,
  };
}
