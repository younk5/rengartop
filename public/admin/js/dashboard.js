import {
  auth, db, onAuthStateChanged, signOut, ADMIN_EMAILS,
  collection, doc, getDocs, getDoc, setDoc, addDoc, deleteDoc, query, orderBy
} from "../../js/firebase-init.js";
import { escapeHtml } from "../../js/sanitize.js";
import { computeWinrate } from "../../js/rank.js";

const TIER_LABEL = { facil: "Match Fácil", normal: "Match Médio", medio: "Match Difícil", dificil: "Match Impossível" };

// ===== Auth guard =====
onAuthStateChanged(auth, (user) => {
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    location.href = "login.html";
    return;
  }
  document.getElementById("user-email").textContent = user.email;
  document.getElementById("gate-message").style.display = "none";
  document.getElementById("dashboard-content").style.display = "block";
  initChampionSelect();
  loadMatchups();
  loadGeneralContent();
  loadCredibility();
  loadAccounts();
  loadClips();
});

document.getElementById("logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await signOut(auth);
  location.href = "login.html";
});

function setStatus(id, msg, ok) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = "status-msg " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => { el.textContent = ""; }, 3000);
}

// ===== Seletor com busca (itens / runas / feitiços) — busca por nome, mostra ícone, monta chips =====
const itemPickers = {}; // hiddenInputId -> { setFromText(str), reset() }
const PICKER_SOURCES = {
  items: getAllPurchasableItems,
  runes: getAllRunesFlat,
  spells: getAllSpellsFlat,
  mixed: getAllMixedIcons
};

function initItemPickers() {
  document.querySelectorAll(".item-picker").forEach(root => {
    const hiddenId = root.dataset.target;
    const hidden = document.getElementById(hiddenId);
    const getSourceItems = PICKER_SOURCES[root.dataset.source] || PICKER_SOURCES.items;
    const searchInput = root.querySelector(".item-picker-search");
    const results = root.querySelector(".item-picker-results");
    const chipsBox = root.querySelector(".item-picker-chips");
    let allItems = [];
    let selected = [];

    getSourceItems().then(items => { allItems = items; });

    function syncHidden() {
      hidden.value = selected.map(s => s.name).join(", ");
    }
    function renderChips() {
      chipsBox.innerHTML = selected.map((s, i) => `
        <span class="item-chip">
          ${s.iconUrl ? `<img src="${escapeHtml(s.iconUrl)}" alt="" />` : ""}
          <span>${escapeHtml(s.name)}</span>
          <button type="button" class="item-chip-remove" data-index="${i}" aria-label="Remover ${escapeHtml(s.name)}">×</button>
        </span>`).join("");
    }
    function closeResults() {
      results.innerHTML = "";
      results.classList.remove("open");
    }
    function addItem(item) {
      if (selected.some(s => normalizeText(s.name) === normalizeText(item.name))) { closeResults(); searchInput.value = ""; return; }
      selected.push({ name: item.name, iconUrl: item.iconUrl });
      renderChips();
      syncHidden();
      searchInput.value = "";
      closeResults();
      searchInput.focus();
    }

    searchInput.addEventListener("input", () => {
      const q = normalizeText(searchInput.value);
      if (!q) { closeResults(); return; }
      const matches = allItems.filter(it => normalizeText(it.name).includes(q)).slice(0, 10);
      results.innerHTML = matches.length
        ? matches.map(it => `
            <button type="button" class="item-picker-option" data-id="${escapeHtml(it.id)}">
              <img src="${escapeHtml(it.iconUrl)}" alt="" />
              <span>${escapeHtml(it.name)}</span>
            </button>`).join("")
        : `<p class="hint" style="padding:8px 10px;">Nenhum item encontrado.</p>`;
      results.classList.add("open");
    });
    searchInput.addEventListener("focus", () => { if (searchInput.value.trim()) results.classList.add("open"); });
    results.addEventListener("click", (e) => {
      const btn = e.target.closest(".item-picker-option");
      if (!btn) return;
      const item = allItems.find(it => it.id === btn.dataset.id);
      if (item) addItem(item);
    });
    chipsBox.addEventListener("click", (e) => {
      const btn = e.target.closest(".item-chip-remove");
      if (!btn) return;
      selected.splice(Number(btn.dataset.index), 1);
      renderChips();
      syncHidden();
    });
    document.addEventListener("click", (e) => {
      if (!root.contains(e.target)) closeResults();
    });

    itemPickers[hiddenId] = {
      async setFromText(str) {
        const names = splitList(str);
        if (!allItems.length) allItems = await getSourceItems();
        selected = names.map(n => {
          const target = normalizeText(n);
          let match = allItems.find(it => normalizeText(it.name) === target);
          if (!match) match = allItems.find(it => normalizeText(it.name).includes(target) || target.includes(normalizeText(it.name)));
          return match ? { name: n, iconUrl: match.iconUrl } : { name: n, iconUrl: null };
        });
        renderChips();
        syncHidden();
      },
      reset() {
        selected = [];
        renderChips();
        syncHidden();
      }
    };
  });
}
initItemPickers();

// ===== Matchups =====
function initChampionSelect() {
  const sel = document.getElementById("m-champion");
  sel.innerHTML = CHAMPIONS.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
}

const matchupForm = document.getElementById("matchup-form");
const cancelEditBtn = document.getElementById("matchup-cancel-edit");

matchupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const championId = document.getElementById("m-champion").value;
  const champion = findChampion(championId);
  const payload = {
    championId,
    championName: champion ? champion.name : championId,
    tier: document.getElementById("m-tier").value,
    summary: document.getElementById("m-summary").value.trim(),
    runesPrimary: document.getElementById("m-runes-primary").value.trim(),
    runesSecondary: document.getElementById("m-runes-secondary").value.trim(),
    shardOffense: document.getElementById("m-shard-offense").value,
    shardFlex: document.getElementById("m-shard-flex").value,
    shardDefense: document.getElementById("m-shard-defense").value,
    summonerSpells: document.getElementById("m-spells").value.trim(),
    runesNote: document.getElementById("m-runes-note").value.trim(),
    skillOrder: document.getElementById("m-skill-order").value.trim(),
    skillNote: document.getElementById("m-skill-note").value.trim(),
    itemsStarting: document.getElementById("m-items-starting").value.trim(),
    itemsStartingNote: document.getElementById("m-items-starting-note").value.trim(),
    itemsFirst: document.getElementById("m-items-first").value.trim(),
    itemsFirstNote: document.getElementById("m-items-first-note").value.trim(),
    itemsSecond: document.getElementById("m-items-second").value.trim(),
    itemsSecondNote: document.getElementById("m-items-second-note").value.trim(),
    tips: document.getElementById("m-tips").value.trim(),
    updatedAt: Date.now()
  };
  const editingId = document.getElementById("matchup-doc-id").value;
  try {
    if (editingId) {
      await setDoc(doc(db, "matchups", editingId), payload, { merge: true });
    } else {
      await addDoc(collection(db, "matchups"), payload);
    }
    setStatus("matchup-status", "Matchup salvo.", true);
    resetMatchupForm();
    loadMatchups();
  } catch (err) {
    console.error(err);
    setStatus("matchup-status", "Erro ao salvar. Confira as Regras de Segurança do Firestore.", false);
  }
});

cancelEditBtn.addEventListener("click", resetMatchupForm);

function resetMatchupForm() {
  matchupForm.reset();
  document.getElementById("matchup-doc-id").value = "";
  cancelEditBtn.style.display = "none";
  Object.entries(itemPickers).forEach(([id, p]) => { if (id.startsWith("m-")) p.reset(); });
}

async function loadMatchups() {
  const tbody = document.querySelector("#matchup-table tbody");
  tbody.innerHTML = `<tr><td colspan="3">Carregando...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "matchups"), orderBy("championName")));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="3">Nenhum matchup ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const m = d.data();
      return `<tr>
        <td>${escapeHtml(m.championName)}</td>
        <td>${escapeHtml(TIER_LABEL[m.tier] || m.tier)}</td>
        <td class="row-actions">
          <button data-edit="${escapeHtml(d.id)}">Editar</button>
          <button data-delete="${escapeHtml(d.id)}" class="danger">Excluir</button>
        </td>
      </tr>`;
    }).join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="3">Erro ao carregar.</td></tr>`;
  }
}

document.querySelector("#matchup-table tbody").addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const delId = e.target.dataset.delete;
  if (editId) {
    const snap = await getDoc(doc(db, "matchups", editId));
    if (!snap.exists()) return;
    const m = snap.data();
    document.getElementById("matchup-doc-id").value = editId;
    document.getElementById("m-champion").value = m.championId;
    document.getElementById("m-tier").value = m.tier;
    document.getElementById("m-summary").value = m.summary || "";
    document.getElementById("m-runes-primary").value = m.runesPrimary || "";
    document.getElementById("m-runes-secondary").value = m.runesSecondary || "";
    document.getElementById("m-shard-offense").value = m.shardOffense || "";
    document.getElementById("m-shard-flex").value = m.shardFlex || "";
    document.getElementById("m-shard-defense").value = m.shardDefense || "";
    document.getElementById("m-spells").value = m.summonerSpells || "";
    itemPickers["m-runes-primary"]?.setFromText(m.runesPrimary || "");
    itemPickers["m-runes-secondary"]?.setFromText(m.runesSecondary || "");
    itemPickers["m-spells"]?.setFromText(m.summonerSpells || "");
    document.getElementById("m-runes-note").value = m.runesNote || "";
    document.getElementById("m-skill-order").value = m.skillOrder || "";
    document.getElementById("m-skill-note").value = m.skillNote || "";
    document.getElementById("m-items-starting-note").value = m.itemsStartingNote || "";
    document.getElementById("m-items-first-note").value = m.itemsFirstNote || m.buildNote || "";
    document.getElementById("m-items-second-note").value = m.itemsSecondNote || "";
    document.getElementById("m-tips").value = m.tips || "";
    itemPickers["m-items-starting"]?.setFromText(m.itemsStarting || "");
    itemPickers["m-items-first"]?.setFromText(m.itemsFirst || m.itemsCore || "");
    itemPickers["m-items-second"]?.setFromText(m.itemsSecond || "");
    cancelEditBtn.style.display = "inline-flex";
    matchupForm.scrollIntoView({ behavior: "smooth" });
  }
  if (delId) {
    if (!confirm("Excluir esse matchup?")) return;
    await deleteDoc(doc(db, "matchups", delId));
    loadMatchups();
  }
});

// ===== Credibilidade =====
async function loadCredibility() {
  try {
    const snap = await getDoc(doc(db, "profileContent", "main"));
    const data = snap.exists() ? snap.data() : {};
    document.getElementById("p-hours").value = data.statHours || "";
    document.getElementById("p-followers").value = data.statFollowers || "";
  } catch (err) { console.error(err); }
}

document.getElementById("credibility-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await setDoc(doc(db, "profileContent", "main"), {
      statHours: document.getElementById("p-hours").value.trim(),
      statFollowers: document.getElementById("p-followers").value.trim(),
      updatedAt: Date.now()
    }, { merge: true });
    setStatus("credibility-status", "Números gerais salvos.", true);
  } catch (err) {
    console.error(err);
    setStatus("credibility-status", "Erro ao salvar.", false);
  }
});

// ----- Contas ranqueadas (OP.GG) -----
const accountForm = document.getElementById("account-form");
const accountCancelBtn = document.getElementById("account-cancel-edit");
let cachedAccounts = [];

async function getAccounts() {
  const snap = await getDoc(doc(db, "profileContent", "main"));
  const data = snap.exists() ? snap.data() : {};
  return Array.isArray(data.accounts) ? data.accounts : [];
}

async function saveAccounts(accounts) {
  await setDoc(doc(db, "profileContent", "main"), { accounts, updatedAt: Date.now() }, { merge: true });
}

function resetAccountForm() {
  accountForm.reset();
  document.getElementById("a-doc-id").value = "";
  accountCancelBtn.style.display = "none";
}

accountCancelBtn.addEventListener("click", resetAccountForm);

accountForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("a-name").value.trim();
  if (!name) return;
  const opggUrl = document.getElementById("a-opgg").value.trim();
  if (opggUrl && !/^https?:\/\//i.test(opggUrl)) {
    setStatus("account-status", "O link do OP.GG precisa começar com http:// ou https://.", false);
    return;
  }
  const account = {
    id: document.getElementById("a-doc-id").value || makeRowId(),
    name,
    opggUrl,
    elo: document.getElementById("a-elo").value.trim(),
    lp: document.getElementById("a-lp").value === "" ? null : Number(document.getElementById("a-lp").value),
    wins: document.getElementById("a-wins").value === "" ? 0 : Number(document.getElementById("a-wins").value),
    losses: document.getElementById("a-losses").value === "" ? 0 : Number(document.getElementById("a-losses").value),
  };
  try {
    const accounts = await getAccounts();
    const editingId = document.getElementById("a-doc-id").value;
    const idx = accounts.findIndex(a => a.id === editingId);
    if (editingId && idx !== -1) {
      accounts[idx] = account;
    } else {
      accounts.push(account);
    }
    await saveAccounts(accounts);
    setStatus("account-status", "Conta salva.", true);
    resetAccountForm();
    loadAccounts();
  } catch (err) {
    console.error(err);
    setStatus("account-status", "Erro ao salvar.", false);
  }
});

async function loadAccounts() {
  const tbody = document.querySelector("#account-table tbody");
  tbody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
  try {
    cachedAccounts = await getAccounts();
    if (!cachedAccounts.length) {
      tbody.innerHTML = `<tr><td colspan="4">Nenhuma conta ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = cachedAccounts.map(a => {
      const wr = computeWinrate(a.wins, a.losses);
      const wrLabel = wr === null ? "—" : `${wr}% (${a.wins || 0}V/${a.losses || 0}D)`;
      return `<tr>
        <td>${escapeHtml(a.name)}</td>
        <td>${escapeHtml(a.elo || "—")}</td>
        <td>${escapeHtml(wrLabel)}</td>
        <td class="row-actions">
          <button data-edit-account="${escapeHtml(a.id)}">Editar</button>
          <button data-delete-account="${escapeHtml(a.id)}" class="danger">Excluir</button>
        </td>
      </tr>`;
    }).join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="4">Erro ao carregar.</td></tr>`;
  }
}

document.querySelector("#account-table tbody").addEventListener("click", async (e) => {
  const editId = e.target.dataset.editAccount;
  const delId = e.target.dataset.deleteAccount;
  if (editId) {
    const a = cachedAccounts.find(x => x.id === editId);
    if (!a) return;
    document.getElementById("a-doc-id").value = a.id;
    document.getElementById("a-name").value = a.name || "";
    document.getElementById("a-opgg").value = a.opggUrl || "";
    document.getElementById("a-elo").value = a.elo || "";
    document.getElementById("a-lp").value = a.lp ?? "";
    document.getElementById("a-wins").value = a.wins ?? "";
    document.getElementById("a-losses").value = a.losses ?? "";
    accountCancelBtn.style.display = "inline-flex";
    accountForm.scrollIntoView({ behavior: "smooth" });
  }
  if (delId) {
    if (!confirm("Excluir essa conta?")) return;
    try {
      const accounts = await getAccounts();
      await saveAccounts(accounts.filter(a => a.id !== delId));
      loadAccounts();
    } catch (err) {
      console.error(err);
    }
  }
});

// ===== Conteúdo geral do guia =====
// Combos e tópicos de macro são listas repetíveis montadas na hora (sem
// depender do Firestore ter um esquema fixo) — cada linha vira um objeto
// dentro de um array salvo no documento guideContent/main.

function makeRowId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

// ----- Combos -----
const combosEditor = document.getElementById("combos-editor");

function addComboRow(combo = {}) {
  const rowId = makeRowId();
  const row = document.createElement("div");
  row.className = "dash-repeat-row";
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <button type="button" class="dash-repeat-remove" aria-label="Remover combo">×</button>
    <label>Título do combo</label>
    <input type="text" class="combo-title" placeholder="Ex: Troca curta na lane" value="${escapeHtml(combo.title || "")}" />
    <label>Descrição</label>
    <textarea class="combo-desc" placeholder="Ex: Entra pelo mato, bate com o Q e usa o W pra curar o dano da troca.">${escapeHtml(combo.description || "")}</textarea>
    <label>Sequência</label>
    <input type="text" class="combo-seq" placeholder="Ex: Mato, Q, W  ou  R, E, Q, W*" value="${escapeHtml(combo.sequence || "")}" />
    <p class="hint">Separe por vírgula. Use Q, W, E ou R pra habilidade (ícone automático); qualquer outra palavra vira um chip de texto (ex: "Mato"). Ponha um * depois da letra pra marcar habilidade empoderada (ex: Q*).</p>
  `;
  row.querySelector(".dash-repeat-remove").addEventListener("click", () => row.remove());
  combosEditor.appendChild(row);
}

document.getElementById("add-combo-btn").addEventListener("click", () => addComboRow());

function readCombos() {
  return Array.from(combosEditor.querySelectorAll(".dash-repeat-row")).map(row => ({
    title: row.querySelector(".combo-title").value.trim(),
    description: row.querySelector(".combo-desc").value.trim(),
    sequence: row.querySelector(".combo-seq").value.trim()
  })).filter(c => c.title || c.description || c.sequence);
}

// ----- Tópicos de macro -----
const macroEditor = document.getElementById("macro-editor");

function addMacroRow(tip = {}) {
  const rowId = makeRowId();
  const row = document.createElement("div");
  row.className = "dash-repeat-row";
  row.dataset.rowId = rowId;
  row.innerHTML = `
    <button type="button" class="dash-repeat-remove" aria-label="Remover tópico">×</button>
    <label>Título</label>
    <input type="text" class="macro-title" placeholder="Ex: Mato é território" value="${escapeHtml(tip.title || "")}" />
    <label>Texto</label>
    <textarea class="macro-text" placeholder="Ex: A lane se joga em volta das moitas...">${escapeHtml(tip.text || "")}</textarea>
  `;
  row.querySelector(".dash-repeat-remove").addEventListener("click", () => row.remove());
  macroEditor.appendChild(row);
}

document.getElementById("add-macro-btn").addEventListener("click", () => addMacroRow());

function readMacroTips() {
  return Array.from(macroEditor.querySelectorAll(".dash-repeat-row")).map(row => ({
    title: row.querySelector(".macro-title").value.trim(),
    text: row.querySelector(".macro-text").value.trim()
  })).filter(t => t.title || t.text);
}

async function loadGeneralContent() {
  try {
    const snap = await getDoc(doc(db, "guideContent", "main"));
    const data = snap.exists() ? snap.data() : {};

    document.getElementById("g-builds").value = data.buildsText || "";
    document.getElementById("g-runes-primary").value = data.runesPrimary || "";
    document.getElementById("g-runes-secondary").value = data.runesSecondary || "";
    document.getElementById("g-shard-offense").value = data.shardOffense || "";
    document.getElementById("g-shard-flex").value = data.shardFlex || "";
    document.getElementById("g-shard-defense").value = data.shardDefense || "";
    itemPickers["g-runes-primary"]?.setFromText(data.runesPrimary || "");
    itemPickers["g-runes-secondary"]?.setFromText(data.runesSecondary || "");
    document.getElementById("g-skill-order").value = data.skillOrder || "";
    document.getElementById("g-skill-note").value = data.skillNote || "";

    document.getElementById("g-combos-intro").value = data.combosIntro || "";
    document.getElementById("g-dica").value = data.dica || "";

    combosEditor.innerHTML = "";
    (Array.isArray(data.combos) && data.combos.length ? data.combos : []).forEach(addComboRow);

    macroEditor.innerHTML = "";
    (Array.isArray(data.macroTips) && data.macroTips.length ? data.macroTips : []).forEach(addMacroRow);
  } catch (err) { console.error(err); }
}

document.getElementById("general-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await setDoc(doc(db, "guideContent", "main"), {
      buildsText: document.getElementById("g-builds").value.trim(),
      runesPrimary: document.getElementById("g-runes-primary").value.trim(),
      runesSecondary: document.getElementById("g-runes-secondary").value.trim(),
      shardOffense: document.getElementById("g-shard-offense").value,
      shardFlex: document.getElementById("g-shard-flex").value,
      shardDefense: document.getElementById("g-shard-defense").value,
      skillOrder: document.getElementById("g-skill-order").value.trim(),
      skillNote: document.getElementById("g-skill-note").value.trim(),
      combosIntro: document.getElementById("g-combos-intro").value.trim(),
      combos: readCombos(),
      dica: document.getElementById("g-dica").value.trim(),
      macroTips: readMacroTips(),
      updatedAt: Date.now()
    }, { merge: true });
    setStatus("general-status", "Conteúdo salvo.", true);
  } catch (err) {
    console.error(err);
    setStatus("general-status", "Erro ao salvar.", false);
  }
});

// ===== Clipes =====
document.getElementById("clip-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("c-url").value.trim();
  if (!/^https?:\/\//i.test(url)) {
    setStatus("clip-status", "A URL do clipe precisa começar com http:// ou https://.", false);
    return;
  }
  try {
    await addDoc(collection(db, "clips"), {
      title: document.getElementById("c-title").value.trim(),
      description: document.getElementById("c-description").value.trim(),
      url,
      createdAt: Date.now()
    });
    setStatus("clip-status", "Clipe adicionado.", true);
    document.getElementById("clip-form").reset();
    loadClips();
  } catch (err) {
    console.error(err);
    setStatus("clip-status", "Erro ao adicionar.", false);
  }
});

async function loadClips() {
  const tbody = document.querySelector("#clip-table tbody");
  tbody.innerHTML = `<tr><td colspan="2">Carregando...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "clips"), orderBy("createdAt", "desc")));
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="2">Nenhum clipe ainda.</td></tr>`;
      return;
    }
    tbody.innerHTML = snap.docs.map(d => `
      <tr>
        <td>${escapeHtml(d.data().title)}</td>
        <td class="row-actions"><button data-delete-clip="${escapeHtml(d.id)}" class="danger">Excluir</button></td>
      </tr>`).join("");
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="2">Erro ao carregar.</td></tr>`;
  }
}

document.querySelector("#clip-table tbody").addEventListener("click", async (e) => {
  const id = e.target.dataset.deleteClip;
  if (!id) return;
  if (!confirm("Excluir esse clipe?")) return;
  await deleteDoc(doc(db, "clips", id));
  loadClips();
});