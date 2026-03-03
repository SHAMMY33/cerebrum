// Cerebrum - app.js (Canon + Wikipedia mixed session + Theme + Filters + SW)

const SESSION_SIZE = 10;
const WIKI_RATIO = 0.6; // 60% Wikipedia, 40% Canon
const ALLOWED_CATEGORIES = ["History","Philosophy","War","Poetry","Science","Law","Biography","Economics"];

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

function shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(items, n) {
  return shuffle(items).slice(0, Math.min(n, items.length));
}

function normalizeCanonItem(it) {
  return {
    id: it.id || `canon_${Math.random().toString(36).slice(2)}`,
    type: "canon",
    category: ALLOWED_CATEGORIES.includes(it.category) ? it.category : "History",
    title: it.title || "Untitled",
    author: it.author || "",
    excerpt: it.excerpt || "",
    source: it.source || "Canon",
    fullTextUrl: it.fullTextUrl || null,
    tags: Array.isArray(it.tags) ? it.tags : []
  };
}

function normalizeWikiItem(it) {
  return {
    id: it.id || `wiki_${Math.random().toString(36).slice(2)}`,
    type: "wiki",
    category: it.category || "History",
    title: it.title || "Untitled",
    author: "",
    excerpt: it.excerpt || "",
    source: it.source || "Wikipedia",
    fullTextUrl: it.fullTextUrl || null,
    tags: it.tags || []
  };
}

// -------------------- CANON --------------------
async function loadCanon() {
  const res = await fetch("data/canon.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading data/canon.json`);
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map(normalizeCanonItem);
}

// -------------------- WIKIPEDIA --------------------
async function fetchRandomWikiSummary() {
  // REST endpoint for random summary
  const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary", {
    headers: { "accept": "application/json" }
  });
  if (!res.ok) throw new Error(`Wiki HTTP ${res.status}`);
  const data = await res.json();

  const title = data.title || "";
  const excerpt = data.extract || "";
  const fullTextUrl = data?.content_urls?.desktop?.page || null;

  return { title, excerpt, fullTextUrl, raw: data };
}

function isGoodWiki({ title, excerpt, raw }) {
  if (!title || !excerpt) return false;

  const t = title.toLowerCase();
  const e = excerpt.toLowerCase();

  // reject lists/disambiguation/stubs
  if (t.startsWith("list of ")) return false;
  if (e.includes("may refer to:")) return false;
  if (raw?.type === "disambiguation") return false;

  // too short = usually junk
  if (excerpt.length < 240) return false;

  return true;
}

function guessCategory(title, excerpt) {
  const text = `${title} ${excerpt}`.toLowerCase();

  // War
  if (/(war|battle|campaign|siege|invasion|army|navy|air force|military|regiment|division|weapon|conflict)/.test(text))
    return "War";

  // Law / Founding / Government
  if (/(constitution|amendment|court|supreme court|law|legal|treaty|rights|congress|parliament|jurisdiction)/.test(text))
    return "Law";

  // Philosophy
  if (/(philosoph|ethics|stoic|metaphysics|epistemology|logic|plato|aristotle|kant|nietzsche|confucius)/.test(text))
    return "Philosophy";

  // Poetry / Literature
  if (/(poet|poetry|sonnet|novel|playwright|verse|stanza|shakespeare|literary)/.test(text))
    return "Poetry";

  // Science
  if (/(physics|chemistry|biology|astronomy|scientist|experiment|theory|genetics|medicine|engineering|mathematics)/.test(text))
    return "Science";

  // Economics
  if (/(econom|market|trade|inflation|money|bank|finance|industry|capital|labor|gdp)/.test(text))
    return "Economics";

  // Biography (people)
  if (/(was an|is an)\s+(american|british|french|german|italian|spanish|chinese|japanese|russian|politician|general|scientist|writer|poet|composer|philosopher|entrepreneur|engineer|pilot)/.test(text))
    return "Biography";

  // History fallback
  return "History";
}

async function getWikiItems(count, activeCategories) {
  const items = [];
  let attempts = 0;
  const maxAttempts = 40; // prevent infinite loops

  while (items.length < count && attempts < maxAttempts) {
    attempts++;
    try {
      const s = await fetchRandomWikiSummary();
      if (!isGoodWiki(s)) continue;

      const category = guessCategory(s.title, s.excerpt);
      if (!ALLOWED_CATEGORIES.includes(category)) continue;

      if (activeCategories.length && !activeCategories.includes(category)) continue;

      items.push(normalizeWikiItem({
        category,
        title: s.title,
        excerpt: s.excerpt,
        source: "Wikipedia",
        fullTextUrl: s.fullTextUrl
      }));
    } catch {
      // ignore and continue
    }
  }

  return items;
}

// -------------------- UI RENDER --------------------
function getSavedMap() {
  return JSON.parse(localStorage.getItem("cerebrum_saved_map") || "{}");
}

function setSavedMap(map) {
  localStorage.setItem("cerebrum_saved_map", JSON.stringify(map));
}

function isSaved(id) {
  const map = getSavedMap();
  return Boolean(map[id]);
}

function saveItem(item) {
  const map = getSavedMap();
  map[item.id] = item; // store full object (works for wiki + canon)
  setSavedMap(map);
}

function removeItem(id) {
  const map = getSavedMap();
  delete map[id];
  setSavedMap(map);
}

function renderCard(item) {
  const card = document.createElement("section");
  card.className = "card";
  card.dataset.id = item.id;

  const inner = document.createElement("div");
  inner.className = "card-inner";

  const saved = isSaved(item.id);

  inner.innerHTML = `
    <div class="meta">
      <div class="category">${escapeHtml(item.category)}</div>
      <div class="source">${escapeHtml(item.source || "")}</div>
    </div>
    <h2 class="title">${escapeHtml(item.title)}</h2>
    ${item.author ? `<p class="author">${escapeHtml(item.author)}</p>` : ""}
    <p class="excerpt">${escapeHtml(item.excerpt)}</p>
    <div class="actions">
      <button class="btn" data-action="save">${saved ? "Saved" : "Save"}</button>
      <button class="btn" data-action="open" ${item.fullTextUrl ? "" : "disabled"}>Read full</button>
    </div>
  `;

  const saveBtn = inner.querySelector('[data-action="save"]');

  function updateSaveLabel() {
    saveBtn.textContent = isSaved(item.id) ? "Saved" : "Save";
  }

  function toggleSave() {
    if (isSaved(item.id)) removeItem(item.id);
    else saveItem(item);
    updateSaveLabel();
  }

  // Tap Save button
  saveBtn.addEventListener("click", toggleSave);

  // Double tap anywhere on card (mobile + desktop)
  let lastTap = 0;
  card.addEventListener("touchend", () => {
    const now = Date.now();
    if (now - lastTap < 300) toggleSave();
    lastTap = now;
  });
  card.addEventListener("dblclick", toggleSave);

  // Open full
  inner.querySelector('[data-action="open"]')?.addEventListener("click", () => {
    if (item.fullTextUrl) window.open(item.fullTextUrl, "_blank", "noopener,noreferrer");
  });

  card.appendChild(inner);
  return card;
}

// -------------------- THEME + FILTERS + INIT --------------------
document.addEventListener("DOMContentLoaded", async () => {
  const feedEl = document.getElementById("feed");
  const hintEl = document.getElementById("hint");
  const themeBtn = document.getElementById("themeBtn");
  const filtersBtn = document.getElementById("filtersBtn");

const libraryBtn = document.getElementById("libraryBtn");
let libraryMode = false;

if (libraryBtn) {
  libraryBtn.addEventListener("click", async () => {
    libraryMode = !libraryMode;

    if (libraryMode) {
      libraryBtn.textContent = "Back";
      const savedIds = getSavedIds();
      const canonAll = await loadCanon();
      const wikiItems = []; // future: store full objects

      const allItems = [...canonAll]; // currently canon only persistent
      const savedItems = allItems.filter(i => savedIds.includes(i.id));

      renderSet(feedEl, hintEl, savedItems, []);
      hintEl.textContent = `Library • ${savedItems.length} saved`;
    } else {
      libraryBtn.textContent = "Library";
      await buildSessionAndRender();
    }
  });
}
  // THEME
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cerebrum_theme", theme);
    if (themeBtn) themeBtn.textContent = theme === "light" ? "☀" : "☾";
  }
  function initTheme() {
    const saved = localStorage.getItem("cerebrum_theme");
    if (saved === "light" || saved === "dark") return applyTheme(saved);
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;
    applyTheme(prefersLight ? "light" : "dark");
  }
  initTheme();

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  // FILTERS (stored)
  function getActiveCategories() {
    const raw = localStorage.getItem("cerebrum_filters") || "";
    const list = raw.split(",").map(s => s.trim()).filter(Boolean);
    return list.filter(c => ALLOWED_CATEGORIES.includes(c));
  }
  function setActiveCategories(list) {
    localStorage.setItem("cerebrum_filters", list.join(","));
  }

  if (filtersBtn) {
    filtersBtn.addEventListener("click", async () => {
      const current = getActiveCategories();
      const msg =
        `Type categories separated by commas, or leave blank for Random.\n\nAllowed:\n${ALLOWED_CATEGORIES.join(", ")}\n\nCurrent:\n${current.length ? current.join(", ") : "Random"}`;
      const input = prompt(msg, current.join(", "));
      if (input === null) return;

      const next = input.split(",").map(s => s.trim()).filter(Boolean);
      const filtered = next.filter(c => ALLOWED_CATEGORIES.includes(c));
      setActiveCategories(filtered);

      // rebuild session immediately
      await buildSessionAndRender();
    });
  }

  async function buildSessionAndRender() {
    const activeCategories = getActiveCategories();

    const canonAll = await loadCanon();
    const canonPool = activeCategories.length
      ? canonAll.filter(c => activeCategories.includes(c.category))
      : canonAll;

    const wikiCount = Math.round(SESSION_SIZE * WIKI_RATIO);
    const canonCount = SESSION_SIZE - wikiCount;

    const canonSet = pickRandom(canonPool, canonCount);
    const wikiSet = await getWikiItems(wikiCount, activeCategories);

    // If wiki couldn’t fill (rare), top up with canon
    const short = SESSION_SIZE - (canonSet.length + wikiSet.length);
    const topUp = short > 0 ? pickRandom(canonPool.filter(c => !canonSet.some(x => x.id === c.id)), short) : [];

    const session = shuffle([...canonSet, ...wikiSet, ...topUp]).slice(0, SESSION_SIZE);
    renderSet(feedEl, hintEl, session, activeCategories);
  }

  try {
    await buildSessionAndRender();
  } catch (e) {
    feedEl.innerHTML = "";
    const err = document.createElement("div");
    err.style.padding = "16px";
    err.style.color = "var(--muted)";
    err.textContent = `Error: ${e.message}`;
    feedEl.appendChild(err);
    hintEl.textContent = "Error building session.";
  }
});
