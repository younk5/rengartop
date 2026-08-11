// Helpers de elo/rank compartilhados entre a home (dados salvos no admin) e a
// página de histórico (dados ao vivo da API da Riot).

// Ordem importa: verifica termos mais específicos ("grão-mestre") antes dos
// mais genéricos ("mestre"/"master"), senão "grão-mestre" cairia em "mestre".
// Cada linha aceita o termo em português E o nome oficial em inglês, porque
// o campo "Elo" do admin é texto livre — algumas contas usam um, outras o outro.
const TIER_FROM_TEXT = [
  ["challenger", "desafiante", "challenger"],
  ["grandmaster", "grao-mestre", "grao mestre", "grandmaster"],
  ["master", "mestre", "master"],
  ["diamond", "diamante", "diamond"],
  ["emerald", "esmeralda", "emerald"],
  ["platinum", "platina", "platinum"],
  ["gold", "ouro", "gold"],
  ["silver", "prata", "silver"],
  ["bronze", "bronze"],
  ["iron", "ferro", "iron"],
];

const TIER_LABEL_PT = {
  iron: "Ferro",
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  platinum: "Platina",
  emerald: "Esmeralda",
  diamond: "Diamante",
  master: "Mestre",
  grandmaster: "Grão-Mestre",
  challenger: "Desafiante",
};

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

// Tenta adivinhar o tier (chave em inglês, ex: "diamond") a partir do texto
// livre digitado no campo "Elo" do admin (ex: "Diamante 2", "Grão-Mestre").
export function guessTierFromText(eloText) {
  const norm = normalize(eloText);
  if (!norm) return null;
  for (const [tierKey, ...terms] of TIER_FROM_TEXT) {
    if (terms.some(t => norm.includes(normalize(t)))) return tierKey;
  }
  return null;
}

// Winrate arredondado (0–100) a partir de vitórias/derrotas, ou null se não houver jogos.
export function computeWinrate(wins, losses) {
  const w = Number(wins) || 0;
  const l = Number(losses) || 0;
  if (w + l <= 0) return null;
  return Math.round((w / (w + l)) * 100);
}

export function tierLabel(tierKey) {
  if (!tierKey) return null;
  const key = String(tierKey).toLowerCase();
  return TIER_LABEL_PT[key] || tierKey;
}

// Emblema oficial via Community Dragon (mesmo CDN já liberado no CSP do projeto).
export function emblemUrl(tierKey) {
  const key = String(tierKey || "").toLowerCase();
  if (!TIER_LABEL_PT[key]) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${key}.png`;
}
