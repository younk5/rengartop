import { db, collection, getDocs, doc, getDoc, query, orderBy } from "./firebase-init-public.js";
import { escapeHtml, safeUrl } from "./sanitize.js";
import { guessTierFromText, emblemUrl, computeWinrate } from "./rank.js";

const TIER_LABEL = { facil: "Match Fácil", normal: "Match Médio", medio: "Match Difícil", dificil: "Match Impossível" };
const TIER_CLASS = { facil: "facil", normal: "normal", medio: "medio", dificil: "dificil" };

let allMatchups = [];
let activeTier = "todos";
let searchTerm = "";
// Fica true só depois que os matchups terminam de carregar do Firestore.
// Evita que busca/filtro mostrem "nenhum matchup encontrado" por engano
// se o usuário digitar/clicar enquanto os cards ainda são skeleton.
let dataLoaded = false;

// normalizeText() vem de data.js (script clássico carregado antes deste módulo).

// Corta qualquer promise que esteja demorando demais (ex: Firestore travado
// numa conexão que nunca fecha) pra nunca deixar o "Carregando..." preso pra sempre.
const LOAD_TIMEOUT_MS = 10000;
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Tempo esgotado esperando: ${label}`)), ms)),
  ]);
}

async function loadCredibility() {
  const section = document.getElementById("credibility");
  const row = document.getElementById("credibility-row");
  const accountsRow = document.getElementById("accounts-row");
  try {
    const snap = await getDoc(doc(db, "profileContent", "main"));
    if (!snap.exists()) return;
    const data = snap.data();
    const stats = [
      { label: "Horas de Rengar", value: data.statHours },
      { label: "Seguidores", value: data.statFollowers },
    ].filter(s => s.value && s.value.trim());

    const accounts = Array.isArray(data.accounts) ? data.accounts : [];

    if (!stats.length && !accounts.length) return;

    row.innerHTML = stats.map(s => `
      <div class="credibility-stat">
        <span class="value">${escapeHtml(s.value)}</span>
        <span class="label">${escapeHtml(s.label)}</span>
      </div>`).join("");

    accountsRow.innerHTML = accounts.map(a => {
      const wr = computeWinrate(a.wins, a.losses);
      const wrText = wr === null ? "" : `<span class="account-wr">${wr}% <small>vitórias</small></span>`;
      const recordText = (a.wins || a.losses)
        ? `<span class="account-record">${Number(a.wins) || 0}V <span class="account-record-sep">·</span> ${Number(a.losses) || 0}D</span>`
        : "";

      const tierKey = guessTierFromText(a.elo);
      const emblem = emblemUrl(tierKey);
      // Sem onerror inline de propósito: o CSP do site não libera script-src
      // inline, então o fallback é ligado via addEventListener depois do render.
      const emblemHtml = emblem
        ? `<span class="account-emblem-wrap"><img class="account-emblem" src="${emblem}" alt="" /></span>`
        : `<span class="account-emblem-fallback"></span>`;

      const lpBox = (a.lp !== null && a.lp !== undefined && a.lp !== "")
        ? `<div class="account-lp-box">
            <span class="account-lp-value">${escapeHtml(String(a.lp))}</span>
            <span class="account-lp-label">PDL</span>
          </div>`
        : "<div></div>";

      const safeHref = a.opggUrl ? safeUrl(a.opggUrl) : "";
      const nameTag = safeHref
        ? `<a class="account-name" href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>`
        : `<span class="account-name">${escapeHtml(a.name)}</span>`;

      return `
        <div class="account-card">
          ${emblemHtml}
          <div class="account-text">
            ${nameTag}
            ${a.elo ? `<span class="account-elo">${escapeHtml(a.elo)}</span>` : ""}
            <span class="account-meta">${wrText}${recordText}</span>
          </div>
          ${lpBox}
        </div>`;
    }).join("");

    accountsRow.querySelectorAll(".account-emblem").forEach(img => {
      img.addEventListener("error", () => {
        const target = img.closest(".account-emblem-wrap") || img;
        target.replaceWith(Object.assign(document.createElement("span"), { className: "account-emblem-fallback" }));
      }, { once: true });
    });

    section.style.display = "";
  } catch (e) {
    console.error(e);
  }
}

async function loadMatchups() {
  const grid = document.getElementById("trophy-grid");
  try {
    // Versão do Data Dragon e busca no Firestore não dependem uma da outra,
    // então rodam em paralelo em vez de uma esperar a outra (carregava mais devagar antes).
    const [version, snap] = await Promise.all([
      withTimeout(getDDragonVersion(), LOAD_TIMEOUT_MS, "versão do Data Dragon"),
      withTimeout(getDocs(query(collection(db, "matchups"), orderBy("championName"))), LOAD_TIMEOUT_MS, "busca dos matchups no Firestore"),
    ]);
    allMatchups = snap.docs.map(d => ({ id: d.id, version, ...d.data() }));
    await withTimeout(attachRunePreviews(allMatchups), LOAD_TIMEOUT_MS, "ícones de runa");
  } catch (e) {
    console.error("[matchups] falhou:", e);
    grid.innerHTML = `<p class="empty-note">Não deu pra carregar os matchups agora (${escapeHtml(e.message || "erro desconhecido")}). Tenta recarregar a página — se continuar assim, dá uma olhada no console (F12).</p>`;
    return;
  }
  dataLoaded = true;
  renderGrid();
}

// Resolve, pra cada matchup, o ícone da runa principal (keystone) e das runas
// secundárias/pequenas, pra dar um preview rápido de build direto no card da
// listagem, sem precisar abrir o matchup.
async function attachRunePreviews(matchups) {
  await Promise.all(matchups.map(async (m) => {
    const primaryNames = splitList(m.runesPrimary);
    const secondaryNames = splitList(m.runesSecondary);
    const [keystone, smallRunes] = await Promise.all([
      resolveRunesByName(primaryNames.slice(0, 1)),
      resolveRunesByName(secondaryNames.slice(0, 2))
    ]);
    m.keystoneRune = keystone[0]?.iconUrl ? keystone[0] : null;
    m.smallRunes = smallRunes.filter(r => r.iconUrl);
  }));
}

function renderCardRunes(m) {
  const icons = [];
  if (m.keystoneRune) {
    icons.push(`<span class="card-rune keystone" title="${escapeHtml(m.keystoneRune.name)}"><img src="${escapeHtml(m.keystoneRune.iconUrl)}" alt="" /></span>`);
  }
  (m.smallRunes || []).forEach(r => {
    icons.push(`<span class="card-rune small" title="${escapeHtml(r.name)}"><img src="${escapeHtml(r.iconUrl)}" alt="" /></span>`);
  });
  return icons.length ? `<div class="card-runes">${icons.join("")}</div>` : "";
}

function renderGrid() {
  if (!dataLoaded) return; // ainda carregando: mantém os cards de skeleton na tela
  const grid = document.getElementById("trophy-grid");
  let list = activeTier === "todos" ? allMatchups : allMatchups.filter(m => m.tier === activeTier);
  if (searchTerm) {
    list = list.filter(m => normalizeText(m.championName).includes(searchTerm));
  }
  if (list.length === 0) {
    const rawSearch = document.getElementById("matchup-search")?.value.trim() || "";
    const msg = rawSearch
      ? `Nenhum matchup encontrado pra "${escapeHtml(rawSearch)}".`
      : "Ainda não tem nenhum matchup cadastrado aqui.";
    grid.innerHTML = `<p class="empty-note">${msg}</p>`;
    return;
  }
  grid.innerHTML = list.map(m => `
    <a class="trophy-card" data-tier="${escapeHtml(TIER_CLASS[m.tier] || "normal")}" href="/matchup/${encodeURIComponent(slugify(m.championName))}">
      <div class="icon-wrap"><img src="${escapeHtml(champIconUrl(m.version, m.championId))}" alt="${escapeHtml(m.championName)}" loading="lazy" /></div>
      <div class="name">${escapeHtml(m.championName)}</div>
      ${renderCardRunes(m)}
      <span class="tier-badge ${escapeHtml(TIER_CLASS[m.tier] || "normal")}">${escapeHtml(TIER_LABEL[m.tier] || "Match Fácil")}</span>
    </a>
  `).join("");
}

document.getElementById("tier-filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  document.querySelectorAll("#tier-filters .chip").forEach(c => {
    c.classList.remove("active");
    c.setAttribute("aria-selected", "false");
  });
  btn.classList.add("active");
  btn.setAttribute("aria-selected", "true");
  activeTier = btn.dataset.tier;
  renderGrid();
});

const searchInput = document.getElementById("matchup-search");
const searchClear = document.getElementById("matchup-search-clear");

searchInput.addEventListener("input", () => {
  searchTerm = normalizeText(searchInput.value);
  searchClear.hidden = searchInput.value.length === 0;
  renderGrid();
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchTerm = "";
  searchClear.hidden = true;
  searchInput.focus();
  renderGrid();
});

loadCredibility();
loadMatchups();