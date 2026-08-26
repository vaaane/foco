// materias.js
// Visão por matéria: para cada disciplina mostra a distribuição ao longo do
// tempo (mini-linha do tempo por dia), total de itens, concluídos, nº de
// revisões (espaçadas e marcações "precisa de revisão"), tempo cronometrado e
// desempenho em questões (vindo das atividades do QConcursos).

import { sair, aoMudarUsuario } from "./auth.js";
import { listarItens, listarAtividades } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaMat = $("#tela-mat");
const quemSou = $("#quem-sou");
const resumo = $("#resumo-mat");
const listaEl = $("#lista-mat");
const DOMINIO_LOGIN = "@foco.app";

const CLASSE_MAT = {
  "Português": "port", "Inglês": "ing", "Raciocínio Lógico": "rlm",
  "Atualidades e IA": "atu", "Legislação": "leg", "Específicos": "esp",
};

let itens = [];
let atividades = [];

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
  // Lê as duas fontes de forma independente: se a de atividades falhar (ex.:
  // regra do Realtime ainda não publicada), a página mostra o plano mesmo assim.
  const [rItens, rAtiv] = await Promise.allSettled([listarItens(), listarAtividades()]);
  itens = rItens.status === "fulfilled" ? rItens.value : [];
  atividades = rAtiv.status === "fulfilled" ? rAtiv.value : [];
  if (rItens.status === "rejected") console.warn("Falha ao ler itens:", rItens.reason);
  if (rAtiv.status === "rejected") console.warn("Falha ao ler atividades:", rAtiv.reason);
  render();
}

function render() {
  if (!itens.length && !atividades.length) {
    resumo.textContent = "Nada por aqui ainda. Carregue o plano no calendário e registre questões.";
    listaEl.innerHTML = "";
    return;
  }

  // agrega por matéria
  const mat = {};
  const garante = (m) => (mat[m] ||= {
    total: 0, feitos: 0, pulados: 0, revEspacadas: 0, precisaRev: 0,
    tempoSeg: 0, dias: new Set(), datas: [], q: 0, qAcertos: 0, qMin: 0,
  });

  for (const it of itens) {
    const m = it.disciplina || "—";
    const d = garante(m);
    d.total++;
    if (it.status === "feito") d.feitos++;
    if (it.status === "pulado") d.pulados++;
    if (it.categoria === "revisao") d.revEspacadas++;
    if (it.precisaRevisao) d.precisaRev++;
    d.tempoSeg += it.tempoGasto || 0;
    if (it.data) { d.dias.add(it.data); d.datas.push(it.data); }
  }
  for (const a of atividades) {
    const m = a.disciplina || "—";
    const d = garante(m);
    d.q += a.total || 0;
    d.qAcertos += a.acertos || 0;
    d.qMin += a.tempoMin || 0;
  }

  const mats = Object.keys(mat).sort((x, y) => mat[y].total - mat[x].total);

  // faixa global de datas (para alinhar as mini-linhas do tempo)
  const todasDatas = itens.map((i) => i.data).filter(Boolean).sort();
  const dMin = todasDatas[0];
  const dMax = todasDatas[todasDatas.length - 1];

  resumo.textContent = `${mats.length} matérias · ${itens.length} itens no plano · ${atividades.length} registros de questões`;

  listaEl.innerHTML = mats.map((m) => {
    const d = mat[m];
    const cls = CLASSE_MAT[m] || "rev";
    const pctFeito = d.total ? Math.round((d.feitos / d.total) * 100) : 0;
    const pctQ = d.q ? Math.round((d.qAcertos / d.q) * 100) : null;
    return `
      <a class="mat-card" href="materia.html?m=${encodeURIComponent(m)}" title="Ver conteúdo de ${escapar(m)}">
        <header class="mat-head">
          <span class="tag t-${cls}">${escapar(m)}</span>
          <span class="mat-prog">${d.feitos}/${d.total} concluídos (${pctFeito}%)</span>
        </header>

        <div class="mat-stats">
          <div class="mat-stat"><b>${d.dias.size}</b><span>dias com esta matéria</span></div>
          <div class="mat-stat"><b>${d.revEspacadas}</b><span>revisões espaçadas</span></div>
          <div class="mat-stat"><b>${d.precisaRev}</b><span>marcadas p/ revisar</span></div>
          <div class="mat-stat"><b>${d.pulados}</b><span>puladas</span></div>
          <div class="mat-stat"><b>${fmtTempo(d.tempoSeg)}</b><span>cronometrado</span></div>
          ${pctQ != null
            ? `<div class="mat-stat"><b class="${pctQ >= 70 ? "bom" : pctQ >= 50 ? "med" : "ruim"}">${pctQ}%</b><span>${d.qAcertos}/${d.q} questões</span></div>`
            : `<div class="mat-stat"><b>—</b><span>sem questões</span></div>`}
        </div>

        <div class="mat-timeline-wrap">
          <span class="mat-tl-lbl">distribuição no tempo</span>
          <div class="mat-timeline">${miniTimeline(m, dMin, dMax)}</div>
        </div>
        <span class="mat-abrir">ver conteúdo →</span>
      </a>`;
  }).join("");
}

// Mini linha do tempo: um tracinho por dia entre dMin e dMax; altura conforme
// a quantidade de itens da matéria naquele dia; verde se todos concluídos.
function miniTimeline(materia, dMin, dMax) {
  if (!dMin || !dMax) return "";
  const dias = listarDatas(dMin, dMax);
  const porDia = {};
  for (const it of itens) {
    if ((it.disciplina || "—") !== materia) continue;
    (porDia[it.data] ||= { n: 0, feitos: 0 });
    porDia[it.data].n++;
    if (it.status === "feito") porDia[it.data].feitos++;
  }
  const maxN = Math.max(1, ...Object.values(porDia).map((x) => x.n));
  return dias.map((dia) => {
    const info = porDia[dia];
    if (!info) return `<span class="tl-bar vazio" title="${fmtData(dia)}"></span>`;
    const alt = 20 + Math.round((info.n / maxN) * 26); // 20–46px
    const tudo = info.feitos === info.n;
    const parcial = info.feitos > 0 && !tudo;
    const cls = tudo ? "cheio" : parcial ? "parcial" : "";
    return `<span class="tl-bar ${cls}" style="height:${alt}px" title="${fmtData(dia)}: ${info.n} item(ns), ${info.feitos} concluído(s)"></span>`;
  }).join("");
}

/* ------------------------------ UTIL ------------------------------ */

function listarDatas(iso1, iso2) {
  const out = [];
  const [a1, m1, d1] = iso1.split("-").map(Number);
  const [a2, m2, d2] = iso2.split("-").map(Number);
  const cur = new Date(a1, m1 - 1, d1);
  const fim = new Date(a2, m2 - 1, d2);
  let guarda = 0;
  while (cur <= fim && guarda++ < 400) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

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

function escapar(txt = "") {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}
