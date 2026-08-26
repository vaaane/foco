// materia.js
// Acompanhamento de UMA matéria (escolhida por ?m=Nome). Mostra:
//  - progresso (barra + %) e contadores (feito / falta / pulado / p/ revisar);
//  - o conteúdo separado em ESTUDADO (com a data em que caiu) e PROGRAMADO
//    (o que ainda falta, com a data prevista / atrasado / sem data);
//  - lista completa dos itens com status, tipo e data, filtrável.
// Página só de leitura — não altera dados (isso é no calendário).

import { sair, aoMudarUsuario } from "./auth.js";
import { listarItens, listarAtividades, listarCadernos } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaMat = $("#tela-mat");
const quemSou = $("#quem-sou");
const tituloMat = $("#titulo-mat");
const resumoMat = $("#resumo-mat");
const painelProg = $("#painel-progresso");
const filtrosEl = $("#filtros");
const conteudoEl = $("#conteudo-mat");
const linkQuestoes = $("#link-questoes");
const DOMINIO_LOGIN = "@foco.app";

const CLASSE_MAT = {
  "Português": "port", "Inglês": "ing", "Raciocínio Lógico": "rlm",
  "Atualidades e IA": "atu", "Legislação": "leg", "Específicos": "esp",
};
const NOMES_TIPO = { video: "Videoaula", pdf: "PDF", revisao: "Revisão", simulado: "Simulado" };
const STATUS_INFO = {
  afazer: { ic: "○", txt: "A fazer", cls: "s-afazer" },
  feito:  { ic: "✓", txt: "Concluído", cls: "s-feito" },
  pulado: { ic: "⤳", txt: "Pulado", cls: "s-pulado" },
};

// matéria vem da URL (?m=...)
const MATERIA = new URLSearchParams(location.search).get("m") || "";

let itens = [];
let atividades = [];
let idxTopicos = {}; // tópico normalizado → { q, ac, sessoes }
let filtro = "todos"; // todos | falta | feito | pulado | revisar

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) {
    telaMat.hidden = true;
    telaDeslogado.hidden = false;
    return;
  }
  telaDeslogado.hidden = true;
  telaMat.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  await carregar();
});

async function carregar() {
  // Fontes independentes: se alguma falhar (ex.: regra do Realtime ainda não
  // publicada), a página mostra o que conseguir.
  const [rItens, rAtiv, rCad] = await Promise.allSettled([
    listarItens(), listarAtividades(), listarCadernos(),
  ]);
  const todosItens = rItens.status === "fulfilled" ? rItens.value : [];
  const todasAtiv = rAtiv.status === "fulfilled" ? rAtiv.value : [];
  const cadernos = rCad.status === "fulfilled" ? rCad.value : [];
  if (rItens.status === "rejected") console.warn("Falha ao ler itens:", rItens.reason);
  if (rAtiv.status === "rejected") console.warn("Falha ao ler atividades:", rAtiv.reason);
  if (rCad.status === "rejected") console.warn("Falha ao ler cadernos:", rCad.reason);

  // Cada tentativa de caderno vira uma "atividade" para reaproveitar o cálculo
  // de desempenho e o cruzamento por tópico.
  const deCadernos = [];
  for (const c of cadernos) {
    for (const t of c.tentativas || []) {
      deCadernos.push({
        disciplina: c.disciplina || "",
        total: t.total || 0,
        acertos: t.acertos || 0,
        tempoMin: t.tempoMin || 0,
        topicos: Array.isArray(c.topicos) ? c.topicos : [],
      });
    }
  }

  itens = todosItens.filter((i) => (i.disciplina || "—") === MATERIA);
  atividades = [...todasAtiv, ...deCadernos].filter((a) => (a.disciplina || "—") === MATERIA);
  render();
}

function render() {
  const cls = CLASSE_MAT[MATERIA] || "rev";
  tituloMat.innerHTML = `<span class="tag t-${cls}" style="font-size:.9rem">${escapar(MATERIA || "—")}</span>`;

  if (!itens.length) {
    resumoMat.textContent = "Nenhum item desta matéria no plano ainda.";
    painelProg.innerHTML = "";
    filtrosEl.innerHTML = "";
    conteudoEl.innerHTML = `<p class="vazio">Carregue o plano no calendário ou adicione tópicos desta matéria.</p>`;
    return;
  }

  // Índice tópico → questões feitas: para cada atividade que marcou tópicos,
  // distribui as questões entre eles. Casa por título normalizado com os itens.
  idxTopicos = {};
  for (const a of atividades) {
    const tops = Array.isArray(a.topicos) ? a.topicos : [];
    if (!tops.length) continue;
    // divide as questões igualmente entre os tópicos marcados na atividade
    const qPorTop = tops.length ? (a.total || 0) / tops.length : 0;
    const acPorTop = tops.length ? (a.acertos || 0) / tops.length : 0;
    for (const t of tops) {
      const k = normalizar(t);
      (idxTopicos[k] ||= { q: 0, ac: 0, sessoes: 0 });
      idxTopicos[k].q += qPorTop;
      idxTopicos[k].ac += acPorTop;
      idxTopicos[k].sessoes += 1;
    }
  }

  const total = itens.length;
  const feitos = itens.filter((i) => i.status === "feito").length;
  const pulados = itens.filter((i) => i.status === "pulado").length;
  const falta = itens.filter((i) => i.status === "afazer").length;
  const revisar = itens.filter((i) => i.precisaRevisao).length;
  const tempoSeg = itens.reduce((s, i) => s + (i.tempoGasto || 0), 0);
  // "resolvidos" = feitos + pulados (o que já foi tratado, saiu da fila)
  const tratados = feitos + pulados;
  const pct = total ? Math.round((tratados / total) * 100) : 0;
  const pctFeito = total ? Math.round((feitos / total) * 100) : 0;

  // desempenho em questões (das atividades)
  const q = atividades.reduce((s, a) => s + (a.total || 0), 0);
  const qAc = atividades.reduce((s, a) => s + (a.acertos || 0), 0);
  const pctQ = q ? Math.round((qAc / q) * 100) : null;

  resumoMat.textContent =
    `${feitos} de ${total} concluídos (${pctFeito}%) · ${falta} a fazer · ${pulados} pulados · ${revisar} p/ revisar · ${fmtTempo(tempoSeg)} cronometrados`
    + (pctQ != null ? ` · ${pctQ}% em ${q} questões` : "");

  linkQuestoes.href = "atividades.html";

  // barra de progresso empilhada (feito + pulado)
  painelProg.innerHTML = `
    <div class="prog-topo">
      <span class="prog-pct">${pct}%</span>
      <span class="prog-lbl">do conteúdo já tratado (${tratados}/${total})</span>
    </div>
    <div class="prog-barra">
      <span class="seg-feito" style="width:${pctFeito}%" title="${feitos} concluídos"></span>
      <span class="seg-pulado" style="width:${total ? (pulados / total) * 100 : 0}%" title="${pulados} pulados"></span>
    </div>
    <div class="prog-cards">
      <div class="prog-card"><b class="bom">${feitos}</b><span>concluídos</span></div>
      <div class="prog-card"><b>${falta}</b><span>a fazer</span></div>
      <div class="prog-card"><b>${pulados}</b><span>pulados</span></div>
      <div class="prog-card"><b class="med">${revisar}</b><span>p/ revisar</span></div>
      ${pctQ != null
        ? `<div class="prog-card"><b class="${pctQ >= 70 ? "bom" : pctQ >= 50 ? "med" : "ruim"}">${pctQ}%</b><span>${qAc}/${q} questões</span></div>`
        : `<div class="prog-card"><b>—</b><span>sem questões</span></div>`}
    </div>`;

  // filtros
  const defs = [
    ["todos", `Todos (${total})`],
    ["falta", `A fazer (${falta})`],
    ["feito", `Concluídos (${feitos})`],
    ["pulado", `Pulados (${pulados})`],
    ["revisar", `P/ revisar (${revisar})`],
  ];
  filtrosEl.innerHTML = defs.map(([k, r]) =>
    `<button class="mini filtro-btn${filtro === k ? " ativo" : ""}" data-f="${k}">${r}</button>`).join("");
  filtrosEl.querySelectorAll(".filtro-btn").forEach((b) => {
    b.addEventListener("click", () => { filtro = b.dataset.f; render(); });
  });

  renderConteudo();
}

function passaFiltro(it) {
  switch (filtro) {
    case "falta": return it.status === "afazer";
    case "feito": return it.status === "feito";
    case "pulado": return it.status === "pulado";
    case "revisar": return !!it.precisaRevisao;
    default: return true;
  }
}

function renderConteudo() {
  const hoje = hojeISO();
  const lista = itens.filter(passaFiltro);

  // Estudado = já tratado (feito ou pulado). Programado = ainda a fazer.
  // Revisões espaçadas entram junto, alocadas nos dias conforme o status.
  const estudado = lista.filter((i) => i.status === "feito" || i.status === "pulado");
  const programado = lista.filter((i) => i.status === "afazer");

  // Dentro de cada seção, mantém a ordem original do conteúdo (1, 2, 3…),
  // usando o campo `ordem` do plano; desempata por data.
  const porSequencia = (a, b) => {
    const oa = a.ordem ?? 0, ob = b.ordem ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.data || "") < (b.data || "") ? -1 : (a.data || "") > (b.data || "") ? 1 : 0;
  };
  estudado.sort(porSequencia);
  programado.sort(porSequencia);

  const blocos = [];

  if (estudado.length) {
    blocos.push(`
      <section class="conteudo-bloco">
        <header class="cb-head"><span class="cb-tit">Já estudado</span>
          <span class="cb-sub">${estudado.length} item(ns)</span></header>
        <ul class="cb-lista">${estudado.map((i) => itemLinha(i, hoje)).join("")}</ul>
      </section>`);
  }

  if (programado.length) {
    // agrupa o programado por data para dar noção de "quando está previsto"
    const porData = {};
    for (const it of programado) (porData[it.data || "sem"] ||= []).push(it);
    const datas = Object.keys(porData).sort((a, b) => {
      if (a === "sem") return 1;
      if (b === "sem") return -1;
      return a < b ? -1 : 1;
    });
    const grupos = datas.map((d) => {
      const rotulo = d === "sem" ? "Sem data" : rotuloData(d, hoje);
      const marca = d !== "sem" && d < hoje ? ` <span class="atrasado">atrasado</span>` : "";
      return `
        <div class="cb-grupo">
          <div class="cb-grupo-data">${rotulo}${marca}</div>
          <ul class="cb-lista">${porData[d].map((i) => itemLinha(i, hoje)).join("")}</ul>
        </div>`;
    }).join("");
    blocos.push(`
      <section class="conteudo-bloco">
        <header class="cb-head"><span class="cb-tit">Programado / a fazer</span>
          <span class="cb-sub">${programado.length} item(ns)</span></header>
        ${grupos}
      </section>`);
  }

  conteudoEl.innerHTML = blocos.length
    ? blocos.join("")
    : `<p class="vazio">Nada neste filtro.</p>`;
}

function itemLinha(it, hoje) {
  const si = STATUS_INFO[it.status] || STATUS_INFO.afazer;
  const dataTxt = it.data ? fmtData(it.data) : "sem data";
  const ehHoje = it.data === hoje;
  const tempo = it.tempoGasto ? ` · ${fmtTempo(it.tempoGasto)}` : "";
  const motivo = it.status === "pulado"
    ? ` · ${it.motivoPulo === "jaSabia" ? "já sabia" : "não é importante"}` : "";
  const revMarca = it.precisaRevisao ? `<span class="linha-rev" title="Precisa de revisão">★</span>` : "";
  const ehRev = it.categoria === "revisao" ? `<span class="linha-badge">revisão</span>` : "";
  // selo de questões feitas neste tópico (casando título ↔ tópico da atividade)
  const info = it.categoria !== "revisao" ? idxTopicos[normalizar(it.titulo)] : null;
  let seloQ = "";
  if (info && info.q >= 1) {
    const nq = Math.round(info.q);
    const pctT = info.q ? Math.round((info.ac / info.q) * 100) : 0;
    const cor = pctT >= 70 ? "bom" : pctT >= 50 ? "med" : "ruim";
    seloQ = `<span class="linha-q ${cor}" title="Questões registradas com este tópico">${nq}q · ${pctT}%</span>`;
  }
  return `
    <li class="cb-item ${it.status}">
      <span class="cb-ic ${si.cls}" title="${si.txt}">${si.ic}</span>
      <div class="cb-corpo">
        <div class="cb-titulo">${escapar(it.titulo)} ${ehRev} ${seloQ}</div>
        <div class="cb-meta">
          <span class="cb-data${ehHoje ? " hoje" : ""}">${dataTxt}${ehHoje ? " · hoje" : ""}</span>
          <span class="cb-tipo">${NOMES_TIPO[it.tipo] || it.tipo}</span>
          ${it.duracaoMin ? `<span class="cb-prev">~${it.duracaoMin}min</span>` : ""}
          <span class="cb-extra">${motivo}${tempo}</span>
        </div>
      </div>
      ${revMarca}
    </li>`;
}

/* ------------------------------ UTIL ------------------------------ */

function fmtTempo(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h) return `${h}h${String(m).padStart(2, "0")}`;
  if (m) return `${m}min`;
  return `${seg}s`;
}

const DIAS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtData(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS_SEM[dt.getDay()]}, ${d} ${MESES[m - 1]}`;
}

// rótulo amigável para grupos do programado (hoje / amanhã / data)
function rotuloData(iso, hoje) {
  if (iso === hoje) return "Hoje";
  const amanha = somarDias(hoje, 1);
  if (iso === amanha) return "Amanhã";
  return fmtData(iso);
}

function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapar(txt = "") {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}

// Normaliza para casar título de item com nome de tópico: minúsculas, sem
// acento e sem espaços duplicados.
function normalizar(txt = "") {
  return txt
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
