// Cerebrum - app.js (Light-only, Canon + Wikipedia, strict topics, saves, filters, SW, optional "This Day" US Military History)

const SESSION_SIZE = 10;
const WIKI_RATIO = 0.6; // 60% Wikipedia, 40% Canon

const ALLOWED_CATEGORIES = [
  "History","Philosophy","War","Poetry","Science","Law","Biography","Economics","US Military History"
];

// Only allow fiction/literature items if they match these classic names/works.
const CLASSIC_FICTION_ALLOWLIST = [
  "shakespeare",
  "hemingway",
  "ray bradbury",
  "dostoevsky",
  "tolstoy",
  "austen",
  "orwell",
  "homer",
  "virgil",
  "dante",
  "milton",
  "cervantes",
  "moby-dick",
  "frankenstein",
  "dracula",
  "the odyssey",
  "the iliad"
];

// Reject obvious pop culture / entertainment pages.
const POP_CULTURE_BLOCKLIST = [
  "film","movie","television","tv series","video game","game","album","single","song",
  "rapper","actor","actress","singer","band","soundtrack","anime","manga","comic",
  "superhero","wrestler","youtuber","tiktok","instagram"
];

// -------------------- SERVICE WORKER --------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js");
}

// -------------------- DOM --------------------
document.addEventListener("DOMContentLoaded", async () => {
  const feedEl = document.getElementById("feed");
  const hintEl = document.getElementById("hint");
  const filtersBtn = document.getElementById("filtersBtn");
  const libraryBtn = document.getElementById("libraryBtn");
  let libraryMode = false;

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

  function textHasAny(text, words) {
    const t = (text || "").toLowerCase();
    return words.some(w => t.includes(w));
  }

  // -------------------- SAVES --------------------
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
    map[item.id] = item; // store full object (wiki + canon)
    setSavedMap(map);
  }

  function removeItem(id) {
    const map = getSavedMap();
    delete map[id];
    setSavedMap(map);
  }

  // -------------------- NORMALIZERS --------------------
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
    return items
      .map(normalizeCanonItem)
      .filter(it => ALLOWED_CATEGORIES.includes(it.category) && it.category !== "US Military History");
  }

  // -------------------- WIKIPEDIA (RANDOM SUMMARY) --------------------
  async function fetchRandomWikiSummary() {
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

    if (t.startsWith("list of ")) return false;
    if (e.includes("may refer to:")) return false;
    if (raw?.type === "disambiguation") return false;

    if (excerpt.length < 240) return false;

    if (textHasAny(title, POP_CULTURE_BLOCKLIST) || textHasAny(excerpt, POP_CULTURE_BLOCKLIST)) {
      const allow = textHasAny(title, CLASSIC_FICTION_ALLOWLIST) || textHasAny(excerpt, CLASSIC_FICTION_ALLOWLIST);
      if (!allow) return false;
    }

    return true;
  }

  function guessCategory(title, excerpt) {
    const text = `${title} ${excerpt}`.toLowerCase();

    if (/(war|battle|campaign|siege|invasion|army|navy|air force|military|regiment|division|weapon|conflict)/.test(text))
      return "War";

    if (/(constitution|amendment|court|supreme court|law|legal|treaty|rights|congress|parliament|jurisdiction)/.test(text))
      return "Law";

    if (/(philosoph|ethics|stoic|metaphysics|epistemology|logic|plato|aristotle|kant|nietzsche|confucius)/.test(text))
      return "Philosophy";

    if (/(poet|poetry|sonnet|novel|playwright|verse|stanza|literary|shakespeare|hemingway|bradbury)/.test(text))
      return "Poetry";

    if (/(physics|chemistry|biology|astronomy|scientist|experiment|theory|genetics|medicine|engineering|mathematics)/.test(text))
      return "Science";

    if (/(econom|market|trade|inflation|money|bank|finance|industry|capital|labor|gdp)/.test(text))
      return "Economics";

    if (/(was an|is an)\s+(american|british|french|german|italian|spanish|chinese|japanese|russian|politician|general|scientist|writer|poet|composer|philosopher|entrepreneur|engineer|pilot)/.test(text))
      return "Biography";

    return "History";
  }

  async function getWikiItems(count, activeCategories) {
    const items = [];
    let attempts = 0;
    const maxAttempts = 80;

    // Disallow US Military History from random wiki feed (we only do it via OnThisDay)
    const effectiveActive = activeCategories.filter(c => c !== "US Military History");

    while (items.length < count && attempts < maxAttempts) {
      attempts++;
      try {
        const s = await fetchRandomWikiSummary();
        if (!isGoodWiki(s)) continue;

        const category = guessCategory(s.title, s.excerpt);
        if (!ALLOWED_CATEGORIES.includes(category)) continue;
        if (category === "US Military History") continue;

        if (effectiveActive.length && !effectiveActive.includes(category)) continue;

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

  // -------------------- "THIS DAY" US MILITARY HISTORY --------------------
  async function fetchOnThisDayEvents(mm, dd) {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, {
      headers: { "accept": "application/json" }
    });
    if (!res.ok) throw new Error(`OnThisDay HTTP ${res.status}`);
    return res.json();
  }

  function isMilitaryRelevant(text) {
    const t = (text || "").toLowerCase();
    const hasUS = /(united states|u\.s\.|us )/.test(t);
    const hasBranch = /(army|navy|marine corps|air force|coast guard|space force)/.test(t);
    const hasWarTerms = /(battle|war|campaign|siege|invasion|landing|offensive|raid|fleet|regiment|division|brigade|platoon|carrier|destroyer|submarine|aircraft|bombing|armistice)/.test(t);
    return (hasBranch && hasWarTerms) || (hasUS && hasWarTerms);
  }

  function buildOnThisDayItem(event) {
    const year = event.year ? String(event.year) : "";
    const text = event.text || "";

    const pages = Array.isArray(event.pages) ? event.pages : [];
    const best =
      pages.find(p => /battle|war|campaign|siege|invasion|landing|offensive|raid/i.test(p?.title || "")) ||
      pages[0];

    const title = best?.title ? best.title : "This day in US military history";
    const url = best?.content_urls?.desktop?.page || null;

    return normalizeWikiItem({
      category: "US Military History",
      title: `${title}${year ? ` (${year})` : ""}`,
      excerpt: text,
      source: "Wikipedia • On this day",
      fullTextUrl: url
    });
  }

  async function getOnThisDayMilitaryItem(activeCategories) {
    if (activeCategories.length && !activeCategories.includes("US Military History")) return null;

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    try {
      const data = await fetchOnThisDayEvents(mm, dd);
      const events = Array.isArray(data?.events) ? data.events : [];

      const candidates = events
        .filter(e => (e?.text || "").length >= 180)
        .filter(e => isMilitaryRelevant(e?.text || ""));

      if (!candidates.length) return null;

      const withPages = candidates.filter(e => Array.isArray(e?.pages) && e.pages.length);
      const pickFrom = withPages.length ? withPages : candidates;

      const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      return buildOnThisDayItem(chosen);
    } catch {
      return null;
    }
  }

  // -------------------- UI --------------------
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

    saveBtn.addEventListener("click", toggleSave);

    let lastTap = 0;
    card.addEventListener("touchend", () => {
      const now = Date.now();
      if (now - lastTap < 300) toggleSave();
      lastTap = now;
    });
    card.addEventListener("dblclick", toggleSave);

    inner.querySelector('[data-action="open"]')?.addEventListener("click", () => {
      if (item.fullTextUrl) window.open(item.fullTextUrl, "_blank", "noopener,noreferrer");
    });

    card.appendChild(inner);
    return card;
  }

  function renderSet(items, activeCategories) {
    feedEl.innerHTML = "";
    items.forEach((it) => feedEl.appendChild(renderCard(it)));

    const filterLabel = activeCategories.length ? activeCategories.join(", ") : "Random";
    hintEl.textContent = `Set: ${items.length} • Mode: ${filterLabel} • Close + reopen to refresh`;
  }

  // -------------------- FILTERS --------------------
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

      await buildSessionAndRender();
    });
  }

  // -------------------- LIBRARY MODE --------------------
  if (libraryBtn) {
    libraryBtn.addEventListener("click", async () => {
      libraryMode = !libraryMode;

      if (libraryMode) {
        libraryBtn.textContent = "Back";

        const savedMap = getSavedMap();
        const savedItems = Object.values(savedMap);

        if (!savedItems.length) {
          feedEl.innerHTML = "";
          const msg = document.createElement("div");
          msg.style.padding = "16px";
          msg.style.color = "var(--muted)";
          msg.textContent = "No saved items.";
          feedEl.appendChild(msg);
          hintEl.textContent = "Library • 0 items";
          return;
        }

        feedEl.innerHTML = "";
        savedItems.forEach(item => feedEl.appendChild(renderCard(item)));
        hintEl.textContent = `Library • ${savedItems.length} saved`;
      } else {
        libraryBtn.textContent = "Library";
        await buildSessionAndRender();
      }
    });
  }

  // -------------------- SESSION BUILD --------------------
  async function buildSessionAndRender() {
    const activeCategories = getActiveCategories();

    const canonAll = await loadCanon();
    const canonPool = activeCategories.length
      ? canonAll.filter(c => activeCategories.includes(c.category))
      : canonAll;

    const onThisDay = await getOnThisDayMilitaryItem(activeCategories);

    const baseWikiTarget = Math.round(SESSION_SIZE * WIKI_RATIO);
    const wikiCountTarget = onThisDay ? Math.max(0, baseWikiTarget - 1) : baseWikiTarget;
    const canonCountTarget = SESSION_SIZE - (wikiCountTarget + (onThisDay ? 1 : 0));

    const canonSet = pickRandom(canonPool, canonCountTarget);
    const wikiSet = await getWikiItems(wikiCountTarget, activeCategories);

    const short = SESSION_SIZE - (canonSet.length + wikiSet.length + (onThisDay ? 1 : 0));
    const topUp = short > 0
      ? pickRandom(canonPool.filter(c => !canonSet.some(x => x.id === c.id)), short)
      : [];

    const session = shuffle([
      ...canonSet,
      ...(onThisDay ? [onThisDay] : []),
      ...wikiSet,
      ...topUp
    ]).slice(0, SESSION_SIZE);

    if (!session.length) {
      feedEl.innerHTML = "";
      const msg = document.createElement("div");
      msg.style.padding = "16px";
      msg.style.color = "var(--muted)";
      msg.textContent = "No items found. Try clearing filters or expanding canon.json.";
      feedEl.appendChild(msg);
      hintEl.textContent = "No items rendered.";
      return;
    }

    renderSet(session, activeCategories);
  }

  // INIT
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
