import { db, doc, getDoc, collection, getDocs } from "./firebase-init-public.js";
import { escapeHtml } from "./sanitize.js";

const TIER_LABEL = { facil: "Match Fácil", normal: "Match Médio", medio: "Match Difícil", dificil: "Match Impossível" };

// Se a página foi acessada como /matchup/<slug> (rewrite da Vercel pra
// matchup.html), pega o slug direto do caminho da URL.
function getSlugFromPath() {
  const m = location.pathname.match(/^\/matchup\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function load() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const slug = !id ? getSlugFromPath() : null;
  const root = document.getElementById("matchup-root");
  if (!id && !slug) {
    root.innerHTML = `<p class="empty-note" style="margin:60px auto;text-align:center;">Não achei esse matchup. <a href="index.html">Volta pra lista</a></p>`;
    return;
  }
  let data;
  try {
    if (id) {
      const snap = await getDoc(doc(db, "matchups", id));
      if (!snap.exists()) throw new Error("not-found");
      data = snap.data();
    } else {
      // Sem campo de slug salvo no Firestore: busca todos os matchups e acha
      // o que bate com o slug gerado a partir do championName (mesma função
      // usada pra montar os links dos cards em app.js).
      const snap = await getDocs(collection(db, "matchups"));
      const match = snap.docs.find(d => slugify(d.data().championName) === slug);
      if (!match) throw new Error("not-found");
      data = match.data();
    }
  } catch (e) {
    root.innerHTML = `<p class="empty-note" style="margin:60px auto;text-align:center;">Esse matchup não existe ou o Firebase ainda não tá configurado. <a href="index.html">Volta pra lista</a></p>`;
    return;
  }

  const version = await getDDragonVersion();
  document.title = `Rengar vs ${data.championName} — Marlon547, Guia de Rengar`;
  const champSlug = slugify(data.championName);
  const ogTitleTag = document.querySelector('meta[property="og:title"]');
  if (ogTitleTag) ogTitleTag.setAttribute("content", `Rengar vs ${data.championName} — Marlon547`);
  const ogUrlTag = document.querySelector('meta[property="og:url"]');
  if (ogUrlTag) ogUrlTag.setAttribute("content", `https://marlon547.vercel.app/matchup/${champSlug}`);

  // ===== Cabeçalho =====
  document.getElementById("hero-splash").src = champSplashUrl(data.championId);
  document.getElementById("hero-splash").alt = data.championName || "";
  document.getElementById("enemy-name").textContent = data.championName;
  document.getElementById("enemy-icon").innerHTML = `<img src="${escapeHtml(champIconUrl(version, data.championId))}" alt="${escapeHtml(data.championName)}" />`;
  const tierBadge = document.getElementById("tier-eyebrow");
  tierBadge.textContent = TIER_LABEL[data.tier] || "Matchup";
  tierBadge.className = `m-tier-badge tier-${data.tier || "normal"}`;

  document.getElementById("panel-resumo").textContent = data.summary || "Ainda não escrevi o resumo desse matchup.";
  document.getElementById("panel-dicas").textContent = data.tips || "Ainda não escrevi as dicas desse matchup.";

  // ===== Runas: tabuleiro completo (todas as opções de cada linha, igual ao
  // cliente do LoL, com a escolhida em destaque) + runas de estatística + feitiços =====
  const spellNames = splitList(data.summonerSpells);
  const [runeBoardHtml, spells] = await Promise.all([
    buildRuneBoardHtml(data),
    resolveSpellsByName(spellNames)
  ]);
  document.getElementById("rune-board").innerHTML = runeBoardHtml;
  document.getElementById("runes-note").textContent = data.runesNote || "";

  document.getElementById("summoner-spells").innerHTML = spells.length
    ? spells.map(s => `
      <div class="m-spell-slot">
        ${s.iconUrl ? `<img src="${escapeHtml(s.iconUrl)}" alt="${escapeHtml(s.name)}" title="${escapeHtml(s.name)}" />` : ""}
        <span>${escapeHtml(s.name)}</span>
      </div>`).join("")
    : `<p class="hint">Não informado.</p>`;

  // ===== Habilidades (fixas do Rengar) + ordem de skill desse matchup =====
  const abilities = await getRengarAbilities();
  const activeAbilities = abilities.filter(a => a.key !== "P");
  document.getElementById("ability-pills").innerHTML = activeAbilities.map(ab => `
    <div class="m-ability-pill${ab.key === "R" ? " ultimate" : ""}">
      ${ab.iconUrl ? `<img src="${escapeHtml(ab.iconUrl)}" alt="${escapeHtml(ab.name)}" />` : ""}
      <span><span class="key">${escapeHtml(ab.key)}</span>${escapeHtml(ab.name)}</span>
    </div>`).join("");
  document.getElementById("skill-grid").innerHTML = renderSkillMatrix(activeAbilities, data.skillOrder, "Ordem de habilidades ainda não configurada para esse matchup.");
  document.getElementById("skill-note").textContent = data.skillNote || "";

  // ===== Itens: nomes digitados no admin, resolvidos para ícones via Data Dragon =====
  const startingNames = splitList(data.itemsStarting);
  const firstNames = splitList(data.itemsFirst || data.itemsCore);
  const secondNames = splitList(data.itemsSecond);
  const [startingItems, firstItems, secondItems] = await Promise.all([
    resolveItemsByName(startingNames), resolveItemsByName(firstNames), resolveItemsByName(secondNames)
  ]);
  document.getElementById("items-grid").innerHTML = [
    renderItemCard("Itens iniciais", startingItems, data.itemsStartingNote || ""),
    renderItemCard("Primeiras compras", firstItems, data.itemsFirstNote || data.buildNote || ""),
    renderItemCard("Build principal", secondItems, data.itemsSecondNote || "")
  ].join("");
}

function renderItemCard(title, items, note) {
  const body = items.length
    ? items.map(it => `
      <div class="m-item-slot" title="${escapeHtml(it.name)}">
        ${it.iconUrl ? `<img src="${escapeHtml(it.iconUrl)}" alt="${escapeHtml(it.name)}" />` : ""}
        <span>${escapeHtml(it.name)}</span>
      </div>`).join("")
    : `<p class="hint">Não informado.</p>`;
  return `
    <div class="m-card">
      <p class="m-card-label">${escapeHtml(title)}</p>
      <div class="m-item-row">${body}</div>
      ${note ? `<p class="m-note" style="margin-top:12px;">${escapeHtml(note)}</p>` : ""}
    </div>`;
}

load();
