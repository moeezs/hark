document.addEventListener("DOMContentLoaded", () => {
  // ── Navigation ──────────────────────────────────────────────────
  const navItems = document.querySelectorAll(".nav-item[data-section]");
  const sections = document.querySelectorAll(".section");

  function navigate(sectionId) {
    sections.forEach((s) => s.classList.remove("active"));
    navItems.forEach((n) => n.classList.remove("active"));
    const target = document.getElementById(sectionId);
    const nav = document.querySelector(
      `.nav-item[data-section="${sectionId}"]`,
    );
    if (target) target.classList.add("active");
    if (nav) nav.classList.add("active");
  }

  navItems.forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.section));
  });

  // ── Listen toggle ────────────────────────────────────────────────
  const toggleBtn = document.getElementById("toggleBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const statusTime = document.getElementById("statusTime");
  let isListening = true;

  function applyListeningState(listening) {
    isListening = listening;
    toggleBtn.innerHTML = listening
      ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/><rect x="4.5" y="4.5" width="4" height="4" rx="1" fill="currentColor"/></svg> Pause`
      : `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M5 4.5l4 2-4 2z" fill="currentColor"/></svg> Start`;
    toggleBtn.classList.toggle("listening", listening);
    statusDot.classList.toggle("paused", !listening);
    statusText.classList.toggle("paused", !listening);
    statusText.textContent = listening ? "Listening" : "Paused";
  }

  toggleBtn.addEventListener("click", () => {
    const next = !isListening;
    applyListeningState(next);
    // Sync the tray menu item label via Tauri command
    if (window.__TAURI__) {
      window.__TAURI__.tauri.invoke("set_listening", { listening: next });
    }
  });

  // Keep the sidebar button in sync when the tray toggle is clicked
  if (window.__TAURI__) {
    window.__TAURI__.event.listen("listening-changed", (event) => {
      applyListeningState(event.payload);
    });
  }

  // ── Dismiss pending cards ────────────────────────────────────────
  document.querySelectorAll(".btn-dismiss").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".pending-card");
      card.style.transition = "opacity 0.18s, transform 0.18s";
      card.style.opacity = "0";
      card.style.transform = "translateX(-8px)";
      setTimeout(() => {
        card.remove();
        updateBadge();
      }, 180);
    });
  });

  // ── Confirm pending cards ────────────────────────────────────────
  document.querySelectorAll(".btn-confirm").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".pending-card");
      btn.textContent = "✓ Done";
      btn.disabled = true;
      setTimeout(() => {
        card.style.transition = "opacity 0.18s, transform 0.18s";
        card.style.opacity = "0";
        card.style.transform = "translateX(-8px)";
        setTimeout(() => {
          card.remove();
          updateBadge();
        }, 180);
      }, 600);
    });
  });

  function updateBadge() {
    const remaining = document.querySelectorAll(".pending-card").length;
    const badge = document.querySelector(".nav-badge");
    if (remaining === 0) {
      if (badge) badge.remove();
      const empty = document.getElementById("pendingEmpty");
      if (empty) empty.style.display = "block";
    } else if (badge) {
      badge.textContent = remaining;
    }
  }

  // ── Search ───────────────────────────────────────────────────────
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll("#searchResults .note-card").forEach((card) => {
        card.style.display =
          !q || card.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }
});
