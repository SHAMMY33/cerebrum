// ---- Canon loading + 10-card session ----

const SESSION_SIZE = 10;

async function loadCanon() {
  const res = await fetch("data/canon.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load canon.json");
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

function pickRandom(items, n) {
  const copy = items.slice();
  // Fisher–Yates shuffle
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function normalizeCanonItem(it) {
  return {
    id: it.id,
    category: it.category || "History",
    title: it.title || "Untitled",
    author: it.author || "",
    excerpt: it.excerpt || "",
    source: it.source || "Canon",
    fullTextUrl: it.fullTextUrl || null,
    tags: it.tags || []
  };
}

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

  // open link
  inner.querySelector('[data-action="open"]')?.addEventListener("click", () => {
    if (item.fullTextUrl) window.open(item.fullTextUrl, "_blank", "noopener,noreferrer");
  });

  card.appendChild(inner);
  return card;
}

function renderSet(items) {
  feed.innerHTML = "";
  items.forEach((it) => feed.appendChild(renderCard(it)));
  hint.textContent = `Set size: ${items.length}. Close + reopen to refresh.`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

async function initFeed() {
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
    hint.textContent = "Fix canon.json path/content and refresh.";
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

initFeed();
