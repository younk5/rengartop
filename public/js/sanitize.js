// Utilitários de sanitização — usados sempre que texto vindo do Firestore
// (que pode ser digitado por um admin, ou por alguém que comprometa uma conta
// de admin) é inserido no DOM via innerHTML. Isso evita XSS armazenado.

// Escapa caracteres perigosos para uso seguro dentro de HTML (texto ou atributo).
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

// Garante que uma URL só pode ser http/https antes de ser usada em href/src.
// Bloqueia esquemas perigosos como javascript:, data:, vbscript: etc.
export function safeUrl(value) {
  const raw = String(value ?? "").trim();
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (e) {
    // URL inválida
  }
  return "";
}

// Extrai o ID de vídeo do YouTube apenas se a URL for de fato do YouTube.
export function extractYoutubeId(url) {
  const raw = String(url ?? "").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (e) {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "m.youtube.com") {
    return null;
  }
  let id = null;
  if (host === "youtu.be") {
    id = parsed.pathname.slice(1);
  } else if (parsed.pathname.startsWith("/embed/")) {
    id = parsed.pathname.split("/embed/")[1];
  } else {
    id = parsed.searchParams.get("v");
  }
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return id;
  return null;
}
