import { db, doc, getDoc, collection, getDocs, query, orderBy } from "./firebase-init-public.js";
import { escapeHtml, safeUrl, extractYoutubeId } from "./sanitize.js";

async function loadGeneralContent() {
  try {
    const snap = await getDoc(doc(db, "guideContent", "main"));
    const data = snap.exists() ? snap.data() : {};

    document.getElementById("builds-text").textContent = data.buildsText || "Em breve, ainda tô escrevendo essa parte.";
    document.getElementById("builds-runes").innerHTML = await buildRuneBoardHtml({
      runesPrimary: data.runesPrimary,
      runesSecondary: data.runesSecondary,
      shardOffense: data.shardOffense,
      shardFlex: data.shardFlex,
      shardDefense: data.shardDefense
    });

    const abilities = await getRengarAbilities();
    const activeAbilities = abilities.filter(a => a.key !== "P");
    document.getElementById("builds-ability-pills").innerHTML = activeAbilities.map(ab => `
      <div class="m-ability-pill${ab.key === "R" ? " ultimate" : ""}">
        ${ab.iconUrl ? `<img src="${escapeHtml(ab.iconUrl)}" alt="${escapeHtml(ab.name)}" />` : ""}
        <span><span class="key">${escapeHtml(ab.key)}</span>${escapeHtml(ab.name)}</span>
      </div>`).join("");
    document.getElementById("builds-skill-grid").innerHTML = renderSkillMatrix(activeAbilities, data.skillOrder, "Ordem de habilidades ainda não configurada.");
    document.getElementById("builds-skill-note").textContent = data.skillNote || "";

    document.getElementById("combos-intro").textContent = data.combosIntro || "";
    await renderCombos(data.combos);
    renderDica(data.dica);

    renderMacroList(data.macroTips);
  } catch (e) {
    console.error(e);
    document.getElementById("builds-text").textContent = "Não deu pra carregar isso agora, tenta de novo daqui a pouco.";
  }
}

// Arte oficial do ícone empoderado (o mesmo "estouro" dourado que aparece
// no HUD do cliente quando a ferocidade enche), direto do wiki da Riot —
// substitui o ícone base só quando a habilidade tá marcada com "*".
const EMPOWERED_ICON_OVERRIDES = {
  Q: "https://wiki.leagueoflegends.com/en-us/images/Rengar_Savagery_2.png",
  W: "https://wiki.leagueoflegends.com/en-us/images/Rengar_Battle_Roar_2.png",
  E: "https://wiki.leagueoflegends.com/en-us/images/Rengar_Bola_Strike_2.png"
};

// Sequências de combo: "Mato, Q, W" vira chip de texto + ícones de habilidade
// ligados por setas. Sufixo "*" marca a habilidade como empoderada (ex: "Q*").
async function renderCombos(combos) {
  const el = document.getElementById("combos-list");
  if (!Array.isArray(combos) || !combos.length) {
    el.innerHTML = `<p class="empty-note">Em breve, ainda tô escrevendo essa parte.</p>`;
    return;
  }
  const abilities = await getRengarAbilities();
  const abilityByKey = Object.fromEntries(abilities.map(a => [a.key, a]));

  el.innerHTML = combos.map(combo => {
    const tokens = splitList(combo.sequence);
    const seqHtml = tokens.map((tok, i) => {
      const sep = i > 0 ? `<span class="g-combo-sep">→</span>` : "";
      const empowered = /\*$/.test(tok);
      const key = tok.replace(/\*$/, "").toUpperCase();
      const ability = ["Q", "W", "E", "R"].includes(key) ? abilityByKey[key] : null;
      if (ability) {
        const empoweredArtUrl = empowered ? EMPOWERED_ICON_OVERRIDES[key] : null;
        const shownIconUrl = empoweredArtUrl || ability.iconUrl;
        return `${sep}<span class="g-combo-icon" title="${escapeHtml(ability.name)}${empowered ? " (empoderada)" : ""}">
          <span class="g-combo-icon-frame"><img src="${escapeHtml(shownIconUrl)}" alt="${escapeHtml(ability.name)}" /></span>
        </span>`;
      }
      return `${sep}<span class="g-combo-chip">${escapeHtml(tok)}</span>`;
    }).join("");
    return `
      <div class="g-combo">
        <div>
          <h3>${escapeHtml(combo.title || "Combo")}</h3>
          <p>${escapeHtml(combo.description || "")}</p>
        </div>
        <div class="g-combo-seq">${seqHtml}</div>
      </div>`;
  }).join("");
}

function renderDica(text) {
  const wrap = document.getElementById("combos-dica");
  const span = document.getElementById("combos-dica-text");
  if (!text || !text.trim()) { wrap.style.display = "none"; return; }
  span.textContent = text.trim();
  wrap.style.display = "";
}

function renderMacroList(tips) {
  const el = document.getElementById("macro-list");
  if (!Array.isArray(tips) || !tips.length) {
    el.innerHTML = `<div class="g-macro"><p class="hint">Em breve, ainda tô escrevendo essa parte.</p></div>`;
    return;
  }
  el.innerHTML = tips.map((tip, i) => `
    <div class="g-macro">
      <span class="num">${String(i + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(tip.title || "")}</h3>
      <p>${escapeHtml(tip.text || "")}</p>
    </div>`).join("");
}

async function loadClips() {
  const grid = document.getElementById("clips-grid");
  try {
    const q = query(collection(db, "clips"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) {
      grid.innerHTML = `<p class="empty-note">Ainda não tem clipe nenhum aqui.</p>`;
      return;
    }
    grid.innerHTML = snap.docs.map(d => {
      const c = d.data();
      const yid = extractYoutubeId(c.url);
      const safeHref = safeUrl(c.url);
      const embed = yid
        ? `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(yid)}" title="${escapeHtml(c.title)}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
        : (safeHref
            ? `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--accent);">Abrir clipe ↗</a>`
            : `<p class="hint" style="display:flex;align-items:center;justify-content:center;height:100%;">Link inválido</p>`);
      return `
        <div class="clip-card">
          <div class="clip-frame">
            ${embed}
          </div>
          <div class="clip-body">
            <h4>${escapeHtml(c.title || "Sem título")}</h4>
            <p>${escapeHtml(c.description || "")}</p>
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<p class="empty-note">Não deu pra carregar os clipes agora.</p>`;
  }
}

loadGeneralContent();
loadClips();