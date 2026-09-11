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
import { salvarTentativaBanco, listarTentativasBanco } from "./db.js";

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
let tentativas = []; // histórico de tentativas do banco aberto (respostasBanco)

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaBancos.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaBancos.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  try {
    [indice, edital] = await Promise.all([
      buscarJSON("bancos/indice.json"),
      buscarJSON("bancos/edital-see-df.json").catch(() => null),
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
  topoSub.textContent = "Um banco por aula. As tags mostram os itens do edital que ele cobre.";
  topoAcoes.innerHTML = "";

  const bancos = (indice && indice.bancos) || [];
  if (!bancos.length) {
    conteudo.innerHTML = `<p class="resumo-geral">Nenhum banco cadastrado ainda.</p>`;
    return;
  }

  // Lista simples: um card por banco (aula).
  const html = `<div class="bc-grade">${bancos.map(cardBanco).join("")}</div>`;
  conteudo.innerHTML = html;
  conteudo.querySelectorAll("[data-abrir]").forEach((el) =>
    el.addEventListener("click", () => abrirBanco(el.dataset.abrir))
  );
}

// Rótulo completo de um item do edital: "10. Educação/sociedade e prática escolar".
// Usa tagsEdital do próprio banco; se faltar, cai no mapa do edital; senão, só o número.
function rotuloEdital(b, n) {
  const t = (b.tagsEdital || []).find((x) => x.n === n);
  if (t && t.titulo) return `${n}. ${t.titulo}`;
  const it = ((edital && edital.itens) || []).find((x) => x.n === n);
  return it ? `${n}. ${it.titulo}` : `Item ${n}`;
}

function cardBanco(b) {
  const tags = (b.itensEdital || [])
    .map((n) => `<span class="bc-tag">${escapar(rotuloEdital(b, n))}</span>`)
    .join("");
  return `
    <button class="bc-card" data-abrir="${escapar(b.arquivo)}">
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
    tentativas = await listarTentativasBanco(bancoAtual.id).catch(() => []);
  } catch (e) {
    conteudo.innerHTML = `<p class="resumo-geral">Não consegui abrir o banco. ${escapar(e.message || "")}</p>`;
    return;
  }
  renderBanco();
}

function renderBanco() {
  const b = bancoAtual;
  topoTitulo.textContent = b.titulo;
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
    ${renderAnalise()}
    <h2 class="titulo-secao">Amostra</h2>
    <div class="bc-previa">${previa}
      <p class="bc-previa-mais">…e mais ${Math.max(0, b.total - 3)} questões.</p>
    </div>`;
  desenharGrafico();
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
  topoTitulo.textContent = `Resumo — ${b.titulo}`;
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
  const escolhida = resp.respostas[q.numero]; // undefined = ainda não respondeu
  const certa = q.gabarito.toUpperCase();
  const respondida = escolhida != null;
  const acertou = respondida && escolhida === certa;

  // placar correndo
  let ok = 0, resp_count = 0;
  for (const qq of b.questoes) {
    const dada = resp.respostas[qq.numero];
    if (dada != null) { resp_count++; if (dada === qq.gabarito.toUpperCase()) ok++; }
  }
  const erros = resp_count - ok;

  topoTitulo.textContent = `Questão ${resp.i + 1} de ${total}`;
  topoSub.textContent = b.titulo;
  topoAcoes.innerHTML = `<button class="mini" id="bc-sair-resp">Sair</button>`;
  $("#bc-sair-resp").onclick = () => {
    if (confirm("Sair sem finalizar? Suas respostas nesta rodada serão perdidas.")) renderBanco();
  };

  // monta as opções. Depois de respondida, marca certa/errada e trava.
  const opcao = (valor, rotulo) => {
    let cls = "bc-op";
    if (respondida) {
      cls += " travada";
      if (valor === certa) cls += " correta";
      else if (valor === escolhida) cls += " incorreta";
    } else if (valor === escolhida) {
      cls += " sel";
    }
    return `<button class="${cls}" data-op="${valor}" ${respondida ? "disabled" : ""}>${rotulo}</button>`;
  };

  let opcoes = "";
  if (q.tipo === "certo_errado") {
    opcoes = ["CERTO", "ERRADO"].map((v) => opcao(v, v === "CERTO" ? "Certo" : "Errado")).join("");
  } else {
    opcoes = Object.entries(q.alternativas)
      .map(([k, v]) => opcao(k.toUpperCase(), `<b>${k})</b> ${escapar(v)}`)).join("");
  }

  // feedback (só após responder)
  let feedback = "";
  if (respondida) {
    const txtCerta = q.tipo === "certo_errado" ? certa : `alternativa ${certa}`;
    feedback = `
      <div class="bc-feedback ${acertou ? "ok" : "erro"}">
        <span class="bc-fb-verdito">${acertou ? "✓ Você acertou" : "✗ Você errou"}</span>
        ${acertou ? "" : `<span class="bc-fb-certa">Resposta correta: <b>${txtCerta}</b></span>`}
      </div>
      ${q.comentario ? `<details class="bc-com"><summary>Ver comentário</summary><div class="md">${renderMarkdown(q.comentario)}</div></details>` : ""}`;
  }

  const ultima = resp.i === total - 1;
  conteudo.innerHTML = `
    <div class="bc-placar">
      <span class="bc-placar-item">Respondidas <b>${resp_count}/${total}</b></span>
      <span class="bc-placar-item ok">Acertos <b>${ok}</b></span>
      <span class="bc-placar-item erro">Erros <b>${erros}</b></span>
    </div>
    <div class="bc-progresso-resp">
      <div class="prog-barra"><span class="seg-feito" style="width:${(resp_count / total) * 100}%"></span></div>
    </div>
    <div class="bc-q responder">
      <div class="bc-q-head"><span class="bc-q-num">${q.numero}</span>
        <span class="bc-q-banca">${escapar(q.banca || "")}</span></div>
      <p class="bc-q-enun">${escapar(q.enunciado)}</p>
      <div class="bc-ops">${opcoes}</div>
      ${feedback}
      <div class="bc-nav">
        <button class="mini" id="bc-ant" ${resp.i === 0 ? "disabled" : ""}>← Anterior</button>
        <button class="btn-primario" id="bc-prox">${ultima ? "Finalizar" : "Próxima →"}</button>
      </div>
    </div>`;

  // clicar numa opção confirma na hora (só se ainda não respondeu)
  if (!respondida) {
    conteudo.querySelectorAll("[data-op]").forEach((el) =>
      el.addEventListener("click", () => {
        resp.respostas[q.numero] = el.dataset.op;
        renderQuestao(); // re-renderiza travado, com feedback
      })
    );
  }
  $("#bc-ant").onclick = () => { if (resp.i > 0) { resp.i--; renderQuestao(); } };
  $("#bc-prox").onclick = () => {
    if (ultima) finalizar();
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

  // Salva a tentativa completa (data + nota + TODAS as respostas). Automático.
  let salvou = true;
  try {
    await salvarTentativaBanco(bancoAtual.id, {
      data: hoje, total, acertos, tempoMin,
      respostas: resp.respostas,
    });
    tentativas = await listarTentativasBanco(bancoAtual.id).catch(() => tentativas);
  } catch (e) {
    salvou = false;
    console.warn("Não consegui salvar a tentativa:", e);
  }

  const pct = Math.round((acertos / total) * 100);
  topoTitulo.textContent = "Resultado";
  topoSub.textContent = b.titulo;
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

  const avisoSalvar = salvou
    ? `<p class="bc-salvo">✓ Tentativa salva em ${formatarData(hoje)}.</p>`
    : `<p class="bc-salvo erro">Não consegui salvar esta tentativa (veja a conexão).</p>`;

  conteudo.innerHTML = `
    <div class="bc-resultado">
      <div class="bc-nota"><span class="bc-nota-pct">${pct}%</span>
        <span class="bc-nota-frac">${acertos} de ${total} certas · ${tempoMin} min</span></div>
    </div>
    ${avisoSalvar}
    ${renderAnalise()}
    <h2 class="titulo-secao">Revisão</h2>
    <div class="bc-revisao">${revisao}</div>`;
  desenharGrafico();
}

/* ============================ ANÁLISE DE RENDIMENTO ============================ */
// Usa `tentativas` (já carregada). Mostra: gráfico de evolução da nota (linha)
// + lista das tentativas (data, nota, tempo). Chamada no resultado e no banco.

function renderAnalise() {
  if (!tentativas || tentativas.length === 0) {
    return `<div class="bc-analise-vazia"><p class="resumo-geral">Ainda não há tentativas salvas. Responda o banco para começar a acompanhar seu rendimento.</p></div>`;
  }
  const linhas = [...tentativas]
    .slice()
    .reverse()
    .map((t, idx) => {
      const n = tentativas.length - idx;
      const pct = t.total ? Math.round((t.acertos / t.total) * 100) : 0;
      return `<tr>
        <td>${n}ª</td>
        <td>${formatarData(t.data)}</td>
        <td><b>${pct}%</b></td>
        <td>${t.acertos}/${t.total}</td>
        <td>${t.tempoMin || "—"} min</td>
      </tr>`;
    }).join("");

  const melhor = Math.max(...tentativas.map((t) => (t.total ? t.acertos / t.total : 0)));
  const ultima = tentativas[tentativas.length - 1];
  const ultimaPct = ultima.total ? Math.round((ultima.acertos / ultima.total) * 100) : 0;

  return `
    <section class="bc-analise">
      <div class="bc-analise-head">
        <h2 class="titulo-secao">Rendimento</h2>
        <span class="bc-analise-resumo">${tentativas.length} tentativa(s) · melhor ${Math.round(melhor * 100)}% · última ${ultimaPct}%</span>
      </div>
      <div class="bc-grafico-wrap"><canvas id="bc-grafico" height="180"></canvas></div>
      <table class="bc-tent-tab">
        <thead><tr><th>#</th><th>Data</th><th>Nota</th><th>Acertos</th><th>Tempo</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </section>`;
}

// Desenha a evolução da nota em canvas puro (sem biblioteca externa).
function desenharGrafico() {
  const cv = document.getElementById("bc-grafico");
  if (!cv || !tentativas.length) return;
  const dpr = window.devicePixelRatio || 1;
  const larg = cv.clientWidth || 600;
  const alt = 180;
  cv.width = larg * dpr; cv.height = alt * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const cor = (css.getPropertyValue("--accent") || "#f5a623").trim();
  const corLinha = (css.getPropertyValue("--line") || "#223038").trim();
  const corTxt = (css.getPropertyValue("--muted") || "#8ba0a8").trim();

  const pad = { t: 16, r: 14, b: 26, l: 34 };
  const w = larg - pad.l - pad.r;
  const h = alt - pad.t - pad.b;
  const pts = tentativas.map((t) => (t.total ? (t.acertos / t.total) * 100 : 0));
  const n = pts.length;
  const x = (i) => pad.l + (n === 1 ? w / 2 : (w * i) / (n - 1));
  const y = (v) => pad.t + h - (h * v) / 100;

  // grades 0/50/100
  ctx.strokeStyle = corLinha; ctx.fillStyle = corTxt;
  ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  [0, 50, 100].forEach((v) => {
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(larg - pad.r, y(v)); ctx.stroke();
    ctx.fillText(v + "%", pad.l - 6, y(v));
  });

  // linha
  ctx.strokeStyle = cor; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((v, i) => { const px = x(i), py = y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();

  // pontos + rótulo da nota
  ctx.fillStyle = cor; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  pts.forEach((v, i) => {
    const px = x(i), py = y(v);
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(Math.round(v) + "%", px, py - 7);
  });
}

function formatarData(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
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
