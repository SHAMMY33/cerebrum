// Cerebrum - app.js (Canon session + Theme toggle + SW register)

const SESSION_SIZE = 10;

// -------------------- SERVICE WORKER --------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

// -------------------- HELPERS --------------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

function pickRandom(items, n) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function normalizeCanonItem(it) {
  return {
    id: it.id || `canon_${Math.random().toString(36).slice(2)}`,
    category: it.category || "History",
    title: it.title || "Untitled",
    author: it.author || "",
    excerpt: it.excerpt || "",
    source: it.source || "Canon",
    fullTextUrl: it.fullTextUrl || null,
    tags: Array.isArray(it.tags) ? it.tags : []
  };
}

async function loadCanon() {
  const res = await fetch("data/canon.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading data/canon.json`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

// -------------------- MAIN (runs after DOM is ready) --------------------
document.addEventListener("DOMContentLoaded", async () => {
  const feed = document.getElementById("feed");
  const hint = document.getElementById("hint");
  const themeBtn = document.getElementById("themeBtn");

  // -------- THEME (robust) --------
  function applyTheme(theme) {
    // set both attribute AND class (belt + suspenders)
    document.documentElement.setAttribute("data-theme", theme);
    document.body.classList.toggle("light", theme === "light");

    localStorage.setItem("cerebrum_theme", theme);
    if (themeBtn) themeBtn.textContent = theme === "light" ? "☀" : "☾";
    if (hint) hint.textContent = `Theme: ${theme} • Set size: ${SESSION_SIZE}`;
  }

  function initTheme() {
    const saved = localStorage.getItem("cerebrum_theme");
    if (saved === "light" || saved === "dark") return applyTheme(saved);

    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    return applyTheme(prefersLight ? "light" : "dark");
  }

  initTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  // -------- FEED RENDER --------
  function renderCard(item) {
    const card = document.createElement("section");
    card.className = "card";
    card.dataset.id = item.id;

    const inner = document.createElement("div");
    inner.className = "card-inner";

    inner.innerHTML = `
      <div class="meta">
        <div class="category">${escapeHtml(item.category)}</div>
        <div class="source">${escapeHtml(item.source || "")}</div>
      </div>
      <h2 class="title">${escapeHtml(item.title)}</h2>
      <p class="author">${escapeHtml(item.author || "")}</p>
      <p class="excerpt">${escapeHtml(item.excerpt)}</p>
      <div class="actions">
        <button class="btn" data-action="like">Like</button>
        <button class="btn" data-action="open" ${item.fullTextUrl ? "" : "disabled"}>Read full</button>
      </div>
    `;

    inner.querySelector('[data-action="open"]')?.addEventListener("click", () => {
      if (item.fullTextUrl) window.open(item.fullTextUrl, "_blank", "noopener,noreferrer");
    });

    card.appendChild(inner);
    return card;
  }

  function renderSet(items) {
    feed.innerHTML = "";
    items.forEach((it) => feed.appendChild(renderCard(it)));
    // hint is already showing theme; keep it informative
  }

  // -------- INIT FEED --------
  try {
    const canon = (await loadCanon()).map(normalizeCanonItem);
    const set = pickRandom(canon, SESSION_SIZE);
    renderSet(set);
  } catch (e) {
    feed.innerHTML = "";
    const err = document.createElement("div");
    err.style.padding = "16px";
    err.style.color = "var(--muted)";
    err.textContent = `Error: ${e.message}`;
    feed.appendChild(err);
    if (hint) hint.textContent = "Error loading canon.json";
  }
});
