#!/usr/bin/env node
// Atualiza a lista CHAMPIONS em public/js/data.js com os campeões mais recentes,
// direto da API oficial (Data Dragon) da Riot. Rode com: npm run update-champions
//
// Reescreve só o bloco entre os marcadores AUTO-GENERATED:CHAMPIONS:START/END —
// o resto do arquivo (runas, itens, feitiços etc.) fica intacto.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_JS_PATH = path.join(__dirname, "..", "public", "js", "data.js");

const START_MARKER = "// AUTO-GENERATED:CHAMPIONS:START";
const END_MARKER = "// AUTO-GENERATED:CHAMPIONS:END";
const MAX_LINE_LENGTH = 110;

async function main() {
  console.log("Buscando a versão mais recente do Data Dragon...");
  const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  if (!versionsRes.ok) throw new Error(`Falha ao buscar versões (HTTP ${versionsRes.status})`);
  const versions = await versionsRes.json();
  const version = versions[0];
  console.log(`Versão atual: ${version}`);

  console.log("Buscando a lista de campeões (pt_BR)...");
  const champRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  if (!champRes.ok) throw new Error(`Falha ao buscar campeões (HTTP ${champRes.status})`);
  const champJson = await champRes.json();

  // "id" aqui é a chave interna do Data Dragon (a mesma usada nas URLs de ícone/splash),
  // não necessariamente igual ao nome em português — por isso os dois campos.
  // Ex: Wukong tem id "MonkeyKing" (nome legado mantido pela Riot no Data Dragon).
  const champions = Object.values(champJson.data)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));

  if (!champions.length) throw new Error("A resposta da API veio sem campeões — abortando sem tocar no arquivo.");
  console.log(`${champions.length} campeões encontrados.`);

  const lines = [];
  let currentLine = "  ";
  for (const c of champions) {
    const entry = `{ id: ${JSON.stringify(c.id)}, name: ${JSON.stringify(c.name)} }, `;
    if ((currentLine + entry).length > MAX_LINE_LENGTH && currentLine.trim()) {
      lines.push(currentLine.trimEnd());
      currentLine = "  ";
    }
    currentLine += entry;
  }
  if (currentLine.trim()) lines.push(currentLine.trimEnd());
  // Remove a vírgula sobrando no fim da última linha.
  const lastIdx = lines.length - 1;
  if (lines[lastIdx]?.endsWith(",")) lines[lastIdx] = lines[lastIdx].slice(0, -1);

  const block = [START_MARKER, "const CHAMPIONS = [", ...lines, "];", END_MARKER].join("\n");

  const original = await readFile(DATA_JS_PATH, "utf8");
  const startIdx = original.indexOf(START_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Não encontrei os marcadores ${START_MARKER} / ${END_MARKER} em ${DATA_JS_PATH}. ` +
      "Nada foi alterado — confirme se eles ainda existem no arquivo antes de rodar de novo."
    );
  }

  const before = original.slice(0, startIdx);
  const after = original.slice(endIdx + END_MARKER.length);
  const updated = before + block + after;

  await writeFile(DATA_JS_PATH, updated, "utf8");
  console.log(`Pronto! public/js/data.js atualizado com ${champions.length} campeões (patch ${version}).`);
}

main().catch((err) => {
  console.error("Erro ao atualizar campeões:", err.message);
  process.exitCode = 1;
});
