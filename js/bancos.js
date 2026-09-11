// bancos.js — bancos de questões reais, organizados por aula e item do edital.
//
// Dados (estáticos, versionados no repo, em /bancos):
//   bancos/indice.json        -> quais bancos existem
//   bancos/edital-see-df.json -> mapa item do edital -> aulas
//   bancos/aula-XX-....json   -> um banco: { titulo, itensEdital, resumoMd, questoes[] }
//
// O resultado de responder um banco é gravado como uma *tentativa de caderno*
// (db.js -> criarCaderno / adicionarTentativa), então aparece no placar de
// Atividades junto com o resto. Nada de novo no schema do banco de dados.

import { sair, aoMudarUsuario } from "./auth.js";
import { criarCaderno, listarCadernos, adicionarTentativa } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaBancos = $("#tela-bancos");
const quemSou = $("#quem-sou");
const conteudo = $("#conteudo-bancos");
const topoTitulo = $("#topo-titulo");
const topoSub = $("#topo-sub");
const topoAcoes = $("#topo-acoes");
const DOMINIO_LOGIN = "@foco.app";

let indice = null; // { bancos: [...] }
let edital = null; // { itens: [...] }
let cadernos = []; // cadernos já existentes do usuário (para não duplicar)

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaBancos.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaBancos.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  try {
    [indice, edital, cadernos] = await Promise.all([
      buscarJSON("bancos/indice.json"),
      buscarJSON("bancos/edital-see-df.json").catch(() => null),
      listarCadernos().catch(() => []),
    ]);
  } catch (e) {
    conteudo.innerHTML = `<p class="resumo-geral">Não consegui carregar os bancos. ${escapar(e.message || "")}</p>`;
    return;
  }
  renderLista();
});

async function buscarJSON(caminho) {
  const r = await fetch(caminho, { cache: "no-cache" });
  if (!r.ok) throw new Error(`falha ao ler ${caminho} (${r.status})`);
  return r.json();
}

/* ============================ VISTA: LISTA ============================ */

function renderLista() {
  topoTitulo.textContent = "Bancos de questões";
  topoSub.textContent = "Questões reais de banca, organizadas por aula e por item do edital.";
  topoAcoes.innerHTML = "";

  const bancos = (indice && indice.bancos) || [];
  if (!bancos.length) {
    conteudo.innerHTML = `<p class="resumo-geral">Nenhum banco cadastrado ainda.</p>`;
    return;
  }

  // Agrupa por item do edital (um banco pode aparecer em mais de um item).
  const itensDoEdital = (edital && edital.itens) || [];
  const porItem = new Map(); // n -> { titulo, bancos: [] }
  for (const it of itensDoEdital) porItem.set(it.n, { titulo: it.titulo, bancos: [] });
  const semItem = [];

  for (const b of bancos) {
    const itens = Array.isArray(b.itensEdital) ? b.itensEdital : [];
    if (!itens.length) semItem.push(b);
    for (const n of itens) {
      if (!porItem.has(n)) porItem.set(n, { titulo: `Item ${n}`, bancos: [] });
      porItem.get(n).bancos.push(b);
    }
  }

  let html = "";
  for (const [n, grupo] of porItem) {
    if (!grupo.bancos.length) continue; // só mostra itens que já têm banco
    html += `<h2 class="titulo-secao bc-item-titulo">Item ${n} — ${escapar(grupo.titulo)}</h2>`;
    html += `<div class="bc-grade">${grupo.bancos.map(cardBanco).join("")}</div>`;
  }
  if (semItem.length) {
    html += `<h2 class="titulo-secao bc-item-titulo">Sem item do edital</h2>`;
    html += `<div class="bc-grade">${semItem.map(cardBanco).join("")}</div>`;
  }

  conteudo.innerHTML = html || `<p class="resumo-geral">Nenhum banco para mostrar.</p>`;
  conteudo.querySelectorAll("[data-abrir]").forEach((el) =>
    el.addEventListener("click", () => abrirBanco(el.dataset.abrir))
  );
}

function cardBanco(b) {
  const tags = (b.itensEdital || []).map((n) => `<span class="bc-tag">Item ${n}</span>`).join("");
  return `
    <button class="bc-card" data-abrir="${escapar(b.arquivo)}">
      <span class="bc-aula">Aula ${escapar(b.aula || "?")}</span>
      <span class="bc-card-tit">${escapar(b.titulo || b.arquivo)}</span>
      <span class="bc-card-meta">${b.total || "?"} questões</span>
      <span class="bc-tags">${tags}</span>
    </button>`;
}

/* ============================ ABRIR UM BANCO ============================ */

let bancoAtual = null;

async function abrirBanco(arquivo) {
  conteudo.innerHTML = `<p class="resumo-geral">Carregando…</p>`;
  try {
    bancoAtual = await buscarJSON(`bancos/${arquivo}`);
    bancoAtual._arquivo = arquivo;
  } catch (e) {
    conteudo.innerHTML = `<p class="resumo-geral">Não consegui abrir o banco. ${escapar(e.message || "")}</p>`;
    return;
  }
  renderBanco();
}

function renderBanco() {
  const b = bancoAtual;
  topoTitulo.textContent = `Aula ${b.aula} — ${b.titulo}`;
  topoSub.textContent = `${b.fonte || ""}${b.itensEdital?.length ? " · itens " + b.itensEdital.join(", ") : ""}`;

  topoAcoes.innerHTML = `
    <button class="mini" id="bc-voltar">← Bancos</button>
    ${b.resumoMd ? `<button class="mini" id="bc-resumo">Resumo</button>` : ""}
    <button class="btn-primario" id="bc-responder">Responder</button>`;
  $("#bc-voltar").onclick = renderLista;
  $("#bc-responder").onclick = iniciarResponder;
  if (b.resumoMd) $("#bc-resumo").onclick = renderResumo;

  // pré-visualização: primeiras questões, com gabarito escondido
  const previa = b.questoes.slice(0, 3).map((q) => cardQuestaoPrevia(q)).join("");
  conteudo.innerHTML = `
    <div class="bc-info">
      <p class="resumo-geral">${b.total} questões reais de banca, com gabarito e comentário. Clique em <b>Responder</b> para começar${b.resumoMd ? ", ou em <b>Resumo</b> para revisar a teoria" : ""}.</p>
    </div>
    <div class="bc-previa">${previa}
      <p class="bc-previa-mais">…e mais ${Math.max(0, b.total - 3)} questões.</p>
    </div>`;
}

function cardQuestaoPrevia(q) {
  return `
    <div class="bc-q previa">
      <div class="bc-q-head"><span class="bc-q-num">${q.numero}</span>
        <span class="bc-q-banca">${escapar(q.banca || "")}</span></div>
      <p class="bc-q-enun">${escapar(q.enunciado)}</p>
    </div>`;
}

/* ============================ VISTA: RESUMO ============================ */

function renderResumo() {
  const b = bancoAtual;
  topoTitulo.textContent = `Resumo — Aula ${b.aula}`;
  topoSub.textContent = b.titulo;
  topoAcoes.innerHTML = `
    <button class="mini" id="bc-voltar-banco">← Banco</button>
    <button class="btn-primario" id="bc-responder2">Responder</button>`;
  $("#bc-voltar-banco").onclick = renderBanco;
  $("#bc-responder2").onclick = iniciarResponder;
  conteudo.innerHTML = `<article class="bc-resumo md">${renderMarkdown(b.resumoMd)}</article>`;
}

/* ============================ VISTA: RESPONDER ============================ */

let resp = null; // { i, respostas: {numero: valor}, iniciadoEm }

function iniciarResponder() {
  resp = { i: 0, respostas: {}, iniciadoEm: Date.now() };
  renderQuestao();
}

function renderQuestao() {
  const b = bancoAtual;
  const q = b.questoes[resp.i];
  const total = b.questoes.length;
  const escolhida = resp.respostas[q.numero];

  topoTitulo.textContent = `Questão ${resp.i + 1} de ${total}`;
  topoSub.textContent = `Aula ${b.aula} — ${b.titulo}`;
  topoAcoes.innerHTML = `<button class="mini" id="bc-sair-resp">Sair</button>`;
  $("#bc-sair-resp").onclick = () => {
    if (confirm("Sair sem finalizar? Suas respostas nesta rodada serão perdidas.")) renderBanco();
  };

  let opcoes = "";
  if (q.tipo === "certo_errado") {
    opcoes = ["CERTO", "ERRADO"].map((v) =>
      `<button class="bc-op ${escolhida === v ? "sel" : ""}" data-op="${v}">${v === "CERTO" ? "Certo" : "Errado"}</button>`
    ).join("");
  } else {
    opcoes = Object.entries(q.alternativas).map(([k, v]) =>
      `<button class="bc-op ${escolhida === k.toUpperCase() ? "sel" : ""}" data-op="${k.toUpperCase()}">
        <b>${k})</b> ${escapar(v)}</button>`
    ).join("");
  }

  conteudo.innerHTML = `
    <div class="bc-progresso-resp">
      <div class="prog-barra"><span class="seg-feito" style="width:${((resp.i) / total) * 100}%"></span></div>
    </div>
    <div class="bc-q responder">
      <div class="bc-q-head"><span class="bc-q-num">${q.numero}</span>
        <span class="bc-q-banca">${escapar(q.banca || "")}</span></div>
      <p class="bc-q-enun">${escapar(q.enunciado)}</p>
      <div class="bc-ops">${opcoes}</div>
      <div class="bc-nav">
        <button class="mini" id="bc-ant" ${resp.i === 0 ? "disabled" : ""}>← Anterior</button>
        <button class="btn-primario" id="bc-prox">${resp.i === total - 1 ? "Finalizar" : "Próxima →"}</button>
      </div>
    </div>`;

  conteudo.querySelectorAll("[data-op]").forEach((el) =>
    el.addEventListener("click", () => {
      resp.respostas[q.numero] = el.dataset.op;
      conteudo.querySelectorAll("[data-op]").forEach((o) => o.classList.toggle("sel", o === el));
    })
  );
  $("#bc-ant").onclick = () => { if (resp.i > 0) { resp.i--; renderQuestao(); } };
  $("#bc-prox").onclick = () => {
    if (resp.i === total - 1) finalizar();
    else { resp.i++; renderQuestao(); }
  };
}

/* ============================ RESULTADO ============================ */

async function finalizar() {
  const b = bancoAtual;
  const total = b.questoes.length;
  let acertos = 0;
  const detalhe = b.questoes.map((q) => {
    const dada = resp.respostas[q.numero] || "";
    const certa = q.gabarito.toUpperCase();
    const ok = dada === certa;
    if (ok) acertos++;
    return { q, dada, certa, ok };
  });
  const tempoMin = Math.max(1, Math.round((Date.now() - resp.iniciadoEm) / 60000));
  const hoje = new Date().toISOString().slice(0, 10);

  // Grava como tentativa de caderno (aparece no placar de Atividades).
  try {
    const existente = cadernos.find((c) => c.nome === b.titulo);
    if (existente) {
      await adicionarTentativa(existente.id, { data: hoje, total, acertos, tempoMin });
    } else {
      await criarCaderno({
        nome: b.titulo,
        disciplina: b.disciplina || "",
        topicos: (b.itensEdital || []).map((n) => `Item ${n}`),
        primeira: { data: hoje, total, acertos, tempoMin },
      });
      cadernos = await listarCadernos().catch(() => cadernos);
    }
  } catch (e) {
    console.warn("Não consegui salvar a tentativa:", e);
  }

  const pct = Math.round((acertos / total) * 100);
  topoTitulo.textContent = "Resultado";
  topoSub.textContent = `Aula ${b.aula} — ${b.titulo}`;
  topoAcoes.innerHTML = `
    <button class="mini" id="bc-refazer">Refazer</button>
    <button class="btn-primario" id="bc-voltar-lista">Bancos</button>`;
  $("#bc-refazer").onclick = iniciarResponder;
  $("#bc-voltar-lista").onclick = renderLista;

  const revisao = detalhe.map(({ q, dada, certa, ok }) => `
    <div class="bc-q rev ${ok ? "ok" : "erro"}">
      <div class="bc-q-head">
        <span class="bc-q-num">${q.numero}</span>
        <span class="bc-q-banca">${escapar(q.banca || "")}</span>
        <span class="bc-veredito ${ok ? "ok" : "erro"}">${ok ? "acertou" : "errou"}</span>
      </div>
      <p class="bc-q-enun">${escapar(q.enunciado)}</p>
      ${renderAlternativasRevisao(q, dada, certa)}
      <details class="bc-com"><summary>Comentário</summary><div class="md">${renderMarkdown(q.comentario || "")}</div></details>
    </div>`).join("");

  conteudo.innerHTML = `
    <div class="bc-resultado">
      <div class="bc-nota"><span class="bc-nota-pct">${pct}%</span>
        <span class="bc-nota-frac">${acertos} de ${total} certas · ${tempoMin} min</span></div>
    </div>
    <h2 class="titulo-secao">Revisão</h2>
    <div class="bc-revisao">${revisao}</div>`;
}

function renderAlternativasRevisao(q, dada, certa) {
  if (q.tipo === "certo_errado") {
    return `<p class="bc-ce">Sua resposta: <b>${dada || "—"}</b> · Gabarito: <b>${certa}</b></p>`;
  }
  return `<ol class="bc-alts">` + Object.entries(q.alternativas).map(([k, v]) => {
    const K = k.toUpperCase();
    const cls = K === certa ? "certa" : (K === dada ? "marcada-errada" : "");
    return `<li class="${cls}"><b>${k})</b> ${escapar(v)}</li>`;
  }).join("") + `</ol>`;
}

/* ============================ UTIL ============================ */

function escapar(t) {
  return (t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Markdown mínimo: títulos (##, ###), negrito, listas (-) e tabelas GFM.
// Suficiente para os resumos; sem dependência externa.
function renderMarkdown(md) {
  const linhas = (md || "").replace(/\r/g, "").split("\n");
  let html = "", i = 0;
  const inline = (s) => escapar(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");

  while (i < linhas.length) {
    const l = linhas[i];

    // tabela GFM: linha com | seguida de linha separadora ---
    if (/\|/.test(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const head = celulas(l);
      i += 2;
      const linhasCorpo = [];
      while (i < linhas.length && /\|/.test(linhas[i])) { linhasCorpo.push(celulas(linhas[i])); i++; }
      html += `<table class="md-tab"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`;
      html += linhasCorpo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
      html += `</tbody></table>`;
      continue;
    }
    // títulos
    let m;
    if ((m = l.match(/^###\s+(.*)/))) { html += `<h4>${inline(m[1])}</h4>`; i++; continue; }
    if ((m = l.match(/^##\s+(.*)/))) { html += `<h3>${inline(m[1])}</h3>`; i++; continue; }
    if ((m = l.match(/^#\s+(.*)/))) { html += `<h2>${inline(m[1])}</h2>`; i++; continue; }
    // lista
    if (/^\s*-\s+/.test(l)) {
      html += "<ul>";
      while (i < linhas.length && /^\s*-\s+/.test(linhas[i])) {
        html += `<li>${inline(linhas[i].replace(/^\s*-\s+/, ""))}</li>`; i++;
      }
      html += "</ul>";
      continue;
    }
    // parágrafo / vazio
    if (l.trim() === "") { i++; continue; }
    html += `<p>${inline(l)}</p>`; i++;
  }
  return html;
}
function celulas(linha) {
  return linha.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((s) => s.trim());
}
