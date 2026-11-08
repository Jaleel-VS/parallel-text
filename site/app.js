"use strict";

const BOOK = window.BOOK;
const app = document.getElementById("app");
const STORE = "pt-settings";
const PROGRESS = "pt-progress";

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") }; }
  catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const settings = load(STORE, {
  show: { es: true, en: true },
  layout: matchMedia("(min-width: 760px)").matches ? "side" : "lines",
  fontSize: 19,
  speed: 1,
  theme: "",
});
const progress = load(PROGRESS, {}); // slug -> { done: bool, scroll: number }

const OTHER = { es: "en", en: "es" };
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
};
const SVG = "http://www.w3.org/2000/svg";
const icon = (name) => {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
};

document.getElementById("copyright").textContent =
  `${BOOK.title} · ${BOOK.publisher}. ${BOOK.copyright}`;

/* ---------- theme ---------- */
document.getElementById("theme-btn").addEventListener("click", () => {
  const dark = settings.theme
    ? settings.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  settings.theme = dark ? "light" : "dark";
  document.documentElement.dataset.theme = settings.theme;
  save(STORE, settings);
});

/* ---------- routing ---------- */
function route() {
  teardown();
  teardown = () => {};
  const m = location.hash.match(/^#\/story\/([\w-]+)/);
  const idx = m ? BOOK.stories.findIndex((s) => s.slug === m[1]) : -1;
  if (idx >= 0) renderReader(idx);
  else renderHome();
}
addEventListener("hashchange", route);

/* ---------- home ---------- */
function renderHome() {
  document.title = BOOK.title;
  app.replaceChildren(document.getElementById("home-tpl").content.cloneNode(true));
  const list = document.getElementById("story-list");
  BOOK.stories.forEach((s, i) => {
    const sentences = s.paragraphs.reduce((n, p) => n + p.length, 0);
    const done = progress[s.slug]?.done;
    list.append(el("li", {},
      el("a", { href: `#/story/${s.slug}`, className: "story-row" + (done ? " done" : "") },
        el("span", { className: "num", textContent: i + 1 }),
        el("span", {},
          el("span", { className: "es", lang: "es", textContent: s.titleEs }),
          el("span", { className: "en", lang: "en", textContent: s.titleEn })),
        done
          ? el("span", { className: "meta" }, icon("bookmark-check"), "Read")
          : el("span", { className: "meta", textContent: `${sentences} sentences` }))));
  });
  scrollTo(0, 0);
}

/* ---------- reader ---------- */
let teardown = () => {};

function renderReader(idx) {
  const story = BOOK.stories[idx];
  document.title = `${story.titleEs} – ${BOOK.title}`;
  app.replaceChildren(document.getElementById("reader-tpl").content.cloneNode(true));
  const $ = (sel) => app.querySelector(sel);

  $(".story-no").textContent = `Story ${idx + 1} of ${BOOK.stories.length}`;
  $(".title-es").textContent = story.titleEs;
  $(".title-en").textContent = story.titleEn;

  // Audio
  const audio = $("audio");
  audio.src = story.audio;
  $(".download").href = story.audio;
  const speed = $("#speed");
  speed.value = String(settings.speed);
  const applySpeed = () => { audio.playbackRate = settings.speed; };
  audio.addEventListener("play", applySpeed);
  speed.addEventListener("change", () => {
    settings.speed = Number(speed.value);
    applySpeed();
    save(STORE, settings);
  });

  // Toolbar
  const langBtns = app.querySelectorAll(".lang-toggle");
  const layoutBtns = app.querySelectorAll(".seg");
  langBtns.forEach((b) => b.addEventListener("click", () => toggleLang(b.dataset.lang)));
  layoutBtns.forEach((b) => b.addEventListener("click", () => setLayout(b.dataset.layout)));
  $("#font-down").addEventListener("click", () => setFont(settings.fontSize - 1));
  $("#font-up").addEventListener("click", () => setFont(settings.fontSize + 1));

  function toggleLang(lang) {
    // Hiding the only visible language would leave nothing to read:
    // switch to the other language instead.
    if (settings.show[lang] && !settings.show[OTHER[lang]]) {
      settings.show = { [lang]: false, [OTHER[lang]]: true };
    } else {
      settings.show[lang] = !settings.show[lang];
    }
    save(STORE, settings);
    paint();
  }
  function setLayout(layout) {
    settings.layout = layout;
    save(STORE, settings);
    paint();
  }
  function setFont(px) {
    settings.fontSize = Math.min(28, Math.max(14, px));
    document.documentElement.style.setProperty("--reader-size", settings.fontSize + "px");
    save(STORE, settings);
  }

  // Text
  const text = $(".text");
  const hint = $(".hint");

  function paint() {
    const { es, en } = settings.show;
    const both = es && en;
    langBtns.forEach((b) => b.setAttribute("aria-pressed", settings.show[b.dataset.lang]));
    layoutBtns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.layout === settings.layout));
    $("#layout-group").hidden = !both;

    const solo = both ? null : es ? "es" : "en";
    hint.hidden = both;
    hint.textContent = solo === "es"
      ? "English is hidden. Tap a sentence to see its translation"
      : "Spanish is hidden. Tap a sentence to see the original";

    text.className = "text " + (both ? `layout-${settings.layout}` : "layout-solo");
    text.replaceChildren(...story.paragraphs.map((para, p) => {
      const node = !both ? soloParagraph(para, p, solo)
        : settings.layout === "side" ? sideParagraph(para, p)
          : linesParagraph(para, p);
      node.dataset.n = p + 1;
      return node;
    }));
  }

  const sentence = (pair, lang, id) => {
    const s = el("span", { className: `s ${lang}`, lang, textContent: pair[lang] + " ", tabIndex: 0 });
    s.dataset.id = id;
    return s;
  };

  function sideParagraph(para, p) {
    return el("div", { className: "para" },
      ...["es", "en"].map((lang) =>
        el("p", { className: `col ${lang}`, lang }, ...para.map((pair, i) => sentence(pair, lang, `${p}.${i}`)))));
  }
  function linesParagraph(para, p) {
    return el("div", { className: "para" },
      ...para.map((pair, i) => el("div", { className: "pair" },
        sentence(pair, "es", `${p}.${i}`), sentence(pair, "en", `${p}.${i}`))));
  }
  function soloParagraph(para, p, lang) {
    return el("p", { className: `para ${lang}`, lang },
      ...para.map((pair, i) => {
        const s = sentence(pair, lang, `${p}.${i}`);
        s.classList.add("peekable");
        s.setAttribute("role", "button");
        s.setAttribute("aria-expanded", "false");
        s.title = lang === "es" ? "Show English" : "Show Spanish";
        return s;
      }));
  }

  // Interaction: highlight a sentence pair; in solo mode toggle the peek.
  function activate(target) {
    const s = target.closest(".s");
    if (!s) return;
    if (s.classList.contains("peekable")) {
      const open = s.nextElementSibling?.classList.contains("peek");
      if (open) s.nextElementSibling.remove();
      else {
        const [p, i] = s.dataset.id.split(".").map(Number);
        const other = OTHER[s.lang];
        s.after(el("span", { className: `peek ${other}`, lang: other, textContent: story.paragraphs[p][i][other] + " " }));
      }
      s.setAttribute("aria-expanded", String(!open));
      return;
    }
    const was = s.classList.contains("active");
    text.querySelectorAll(".s.active").forEach((n) => n.classList.remove("active"));
    if (!was) text.querySelectorAll(`.s[data-id="${s.dataset.id}"]`).forEach((n) => n.classList.add("active"));
  }
  text.addEventListener("click", (e) => activate(e.target));
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(e.target); }
  });
  const hover = (on) => (e) => {
    const s = e.target.closest?.(".s:not(.peekable)");
    if (s) text.querySelectorAll(`.s[data-id="${s.dataset.id}"]`).forEach((n) => n.classList.toggle("hover", on));
  };
  text.addEventListener("mouseover", hover(true));
  text.addEventListener("mouseout", hover(false));

  // Footnotes
  if (story.notes.length) {
    $(".notes").hidden = false;
    $(".notes ol").append(...story.notes.map((n) =>
      el("li", { value: n.n }, el("span", { className: "es", lang: "es", textContent: n.es }), el("span", { className: "en", lang: "en", textContent: n.en }))));
  }

  // Prev / next / done
  const prev = BOOK.stories[idx - 1];
  const next = BOOK.stories[idx + 1];
  const prevA = $(".prev"), nextA = $(".next"), doneBtn = $(".done-btn");
  const navLink = (a, s, label) => {
    a.href = `#/story/${s.slug}`;
    a.append(el("small", { textContent: label }), s.titleEs);
  };
  if (prev) navLink(prevA, prev, "Previous"); else prevA.hidden = true;
  if (next) navLink(nextA, next, "Next"); else nextA.hidden = true;
  const entry = (progress[story.slug] ||= { done: false, scroll: 0 });
  const paintDone = () => {
    doneBtn.replaceChildren(icon("bookmark-check"), entry.done ? "Read" : "Mark as read");
    doneBtn.setAttribute("aria-pressed", entry.done);
  };
  doneBtn.addEventListener("click", () => { entry.done = !entry.done; save(PROGRESS, progress); paintDone(); });
  paintDone();

  // Keyboard shortcuts
  const onKey = (e) => {
    if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") toggleLang("es");
    else if (k === "e") toggleLang("en");
    else if (k === "l" && settings.show.es && settings.show.en) setLayout(settings.layout === "side" ? "lines" : "side");
  };
  // Remember reading position
  let t;
  const onScroll = () => {
    clearTimeout(t);
    t = setTimeout(() => { entry.scroll = scrollY; save(PROGRESS, progress); }, 250);
  };
  addEventListener("keydown", onKey);
  addEventListener("scroll", onScroll, { passive: true });
  teardown = () => {
    removeEventListener("keydown", onKey);
    removeEventListener("scroll", onScroll);
    clearTimeout(t);
    audio.pause();
  };

  paint();
  scrollTo(0, entry.scroll || 0);
}

route();
