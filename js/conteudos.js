// conteudos.js — página "Conteúdos" (era Matérias).
// Lista as aulas (mesmas do indice.json dos bancos) agrupadas por disciplina.
// Cada aula pode ser marcada como estudada e ter uma anotação livre.
// Ao marcar uma aula como estudada, os itens do edital que ela cobre são
// propagados para a Ementa (via mapa-ementa.json) — hoje só há mapa para
// Informática; para as demais, a marcação fica só aqui.

import { sair, aoMudarUsuario } from "./auth.js";
import { carregarConteudos, salvarConteudo, carregarEmenta, atualizarEmenta } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaMat = $("#tela-mat");
const quemSou = $("#quem-sou");
const conteudo = $("#conteudo-materias");
const topoSub = $("#topo-sub");
const DOMINIO_LOGIN = "@foco.app";

let indice = null;   // { bancos: [...] }
let mapaEmenta = null; // { porDisciplina: { Informática: { "1": [ids] } } }
let estado = {};     // { [bancoId]: { estudado, nota } }
let ementaMarc = {}; // ids já marcados na ementa

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaMat.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaMat.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  try {
    [indice, mapaEmenta, estado, ementaMarc] = await Promise.all([
      fetch("bancos/indice.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("bancos/mapa-ementa.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ porDisciplina: {} })),
      carregarConteudos().catch(() => ({})),
      carregarEmenta().catch(() => ({})),
    ]);
  } catch (e) {
    conteudo.innerHTML = `<p class="resumo-geral">Não consegui carregar os conteúdos. ${escapar(e.message || "")}</p>`;
    return;
  }
  render();
});

function render() {
  const bancos = (indice && indice.bancos) || [];
  const total = bancos.length;
  const feitos = bancos.filter((b) => estado[b.arquivo]?.estudado).length;
  topoSub.textContent = `${feitos} de ${total} aulas estudadas`;

  // agrupa por disciplina, preservando ordem de aparição
  const grupos = new Map();
  for (const b of bancos) {
    const d = b.disciplina || "Outros";
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(b);
  }

  let html = "";
  for (const [disc, lista] of grupos) {
    const f = lista.filter((b) => estado[b.arquivo]?.estudado).length;
    html += `<div class="ct-disc">
      <div class="ct-disc-head">
        <h2 class="titulo-secao">${escapar(disc)}</h2>
        <span class="ct-disc-prog">${f}/${lista.length} estudadas</span>
      </div>
      <div class="ct-lista">${lista.map(cardAula).join("")}</div>
    </div>`;
  }
  conteudo.innerHTML = html;

  conteudo.querySelectorAll("[data-toggle]").forEach((el) =>
    el.addEventListener("change", () => marcarEstudada(el.dataset.toggle, el.checked))
  );
  conteudo.querySelectorAll("[data-nota]").forEach((el) =>
    el.addEventListener("click", () => abrirNota(el.dataset.nota))
  );
}

function cardAula(b) {
  const st = estado[b.arquivo] || {};
  const temNota = st.nota && st.nota.trim();
  const tags = (b.tagsEdital || []).map((t) => `<span class="ct-tag">${escapar(`${t.n}. ${t.titulo}`)}</span>`).join("");
  const meta = b.soConteudo
    ? `conteúdo` + (b.subtitulo ? ` · ${escapar(b.subtitulo)}` : "")
    : `${b.total || 0} questões no banco`;
  return `
    <div class="ct-aula ${st.estudado ? "feita" : ""}">
      <label class="ct-check">
        <input type="checkbox" data-toggle="${b.arquivo}" ${st.estudado ? "checked" : ""} />
      </label>
      <div class="ct-corpo">
        <div class="ct-tit">${escapar(b.titulo)}</div>
        <div class="ct-meta">${meta}</div>
        ${tags ? `<div class="ct-tags">${tags}</div>` : ""}
        ${temNota ? `<div class="ct-nota-previa">📝 ${escapar(resumir(st.nota))}</div>` : ""}
      </div>
      <button class="mini ct-btn-nota" data-nota="${b.arquivo}">${temNota ? "Editar nota" : "Anotar"}</button>
    </div>`;
}

async function marcarEstudada(bancoId, marcado) {
  const b = indice.bancos.find((x) => x.arquivo === bancoId);
  estado[bancoId] = { ...(estado[bancoId] || {}), estudado: marcado };
  // atualiza visual imediatamente
  const card = conteudo.querySelector(`[data-toggle="${bancoId}"]`)?.closest(".ct-aula");
  if (card) card.classList.toggle("feita", marcado);

  try {
    await salvarConteudo(bancoId, estado[bancoId]);
    // propaga para a ementa (só marca ao ativar; ao desmarcar não desfaz a
    // ementa, pois outro conteúdo pode cobrir o mesmo item)
    if (marcado && b) {
      const ids = idsEmentaDaAula(b);
      if (ids.length) {
        const campos = {};
        for (const id of ids) if (!ementaMarc[id]) { campos[id] = true; ementaMarc[id] = true; }
        if (Object.keys(campos).length) await atualizarEmenta(campos);
      }
    }
  } catch (e) {
    console.warn("Falha ao salvar conteúdo:", e);
  }
  // atualiza contadores
  atualizarContadores();
}

// ids da ementa cobertos por uma aula. Duas formas:
//  - ementaIds direto no item (usado por Matemática, vínculo por aula)
//  - via mapa por disciplina + itensEdital (Pedagógicos/Informática, por número)
function idsEmentaDaAula(b) {
  if (Array.isArray(b.ementaIds) && b.ementaIds.length) return b.ementaIds.slice();
  const porDisc = (mapaEmenta && mapaEmenta.porDisciplina) || {};
  const mapa = porDisc[b.disciplina];
  if (!mapa) return [];
  const out = [];
  for (const n of b.itensEdital || []) {
    const ids = mapa[String(n)];
    if (ids) out.push(...ids);
  }
  return out;
}

function atualizarContadores() {
  const bancos = indice.bancos;
  const feitos = bancos.filter((b) => estado[b.arquivo]?.estudado).length;
  topoSub.textContent = `${feitos} de ${bancos.length} aulas estudadas`;
  // por disciplina
  conteudo.querySelectorAll(".ct-disc").forEach((el) => {
    const h = el.querySelector(".titulo-secao").textContent;
    const lista = bancos.filter((b) => (b.disciplina || "Outros") === h);
    const f = lista.filter((b) => estado[b.arquivo]?.estudado).length;
    el.querySelector(".ct-disc-prog").textContent = `${f}/${lista.length} estudadas`;
  });
}

/* ------------------------------ NOTA ------------------------------ */

function abrirNota(bancoId) {
  const b = indice.bancos.find((x) => x.arquivo === bancoId);
  const st = estado[bancoId] || {};
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  fundo.innerHTML = `
    <div class="modal-caixa" role="dialog" aria-modal="true">
      <h3 class="modal-tit">Anotação — ${escapar(b.titulo)}</h3>
      <textarea class="ct-nota-editor" rows="10" placeholder="Suas anotações sobre esta aula (aceita markdown)…">${escapar(st.nota || "")}</textarea>
      <div class="modal-botoes">
        <button class="mini" id="ct-nota-cancelar">Cancelar</button>
        <button class="btn-primario" id="ct-nota-salvar">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  fundo.querySelector("#ct-nota-cancelar").onclick = fechar;
  fundo.querySelector("#ct-nota-salvar").onclick = async () => {
    const nota = fundo.querySelector(".ct-nota-editor").value;
    estado[bancoId] = { ...(estado[bancoId] || {}), nota };
    try { await salvarConteudo(bancoId, estado[bancoId]); }
    catch (e) { console.warn("Falha ao salvar nota:", e); }
    fechar();
    render();
  };
  fundo.querySelector(".ct-nota-editor").focus();
}

/* ------------------------------ UTIL ------------------------------ */

function resumir(t, n = 90) {
  t = t.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}
function escapar(t = "") {
  const d = document.createElement("div"); d.textContent = t; return d.innerHTML;
}
