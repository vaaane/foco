// atividades.js
// Cadernos de questões: cada caderno tem nome, matéria, tópicos e uma lista de
// tentativas (a 1ª na criação; "Refeito" adiciona novas). Mostra a evolução da
// primeira para a última tentativa, placar por matéria e registros antigos.

import { sair, aoMudarUsuario } from "./auth.js";
import {
  criarCaderno,
  listarCadernos,
  adicionarTentativa,
  removerTentativa,
  removerCaderno,
  listarAtividades,
  removerAtividade,
  listarItens,
} from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaAtiv = $("#tela-ativ");
const quemSou = $("#quem-sou");
const resumo = $("#resumo-ativ");
const form = $("#form-ativ");
const selDisc = $("#sel-disc");
const placar = $("#placar");
const listaCadernos = $("#lista-cadernos");
const blocoLegado = $("#bloco-legado");
const listaEl = $("#lista-ativ");
const blocoTopicos = $("#bloco-topicos");
const listaTopicos = $("#lista-topicos");
const DOMINIO_LOGIN = "@foco.app";

// modal refeito
const modalRefeito = $("#modal-refeito");
const rfNome = $("#refeito-nome");
const rfData = $("#rf-data");
const rfTotal = $("#rf-total");
const rfAcertos = $("#rf-acertos");
const rfTempo = $("#rf-tempo");
let cadernoEmRefeito = null;

const MATERIAS = ["Português", "Inglês", "Raciocínio Lógico", "Atualidades e IA", "Legislação", "Específicos", "Revisão"];
const CLASSE_MAT = {
  "Português": "port", "Inglês": "ing", "Raciocínio Lógico": "rlm",
  "Atualidades e IA": "atu", "Legislação": "leg", "Específicos": "esp",
};

let cadernos = [];
let legado = [];
let itensPlano = [];

selDisc.innerHTML = MATERIAS.map((m) => `<option>${m}</option>`).join("");
form.data.value = hojeISO();

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaAtiv.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaAtiv.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  await carregar();
});

async function carregar() {
  try {
    cadernos = await listarCadernos();
  } catch (err) {
    console.warn("Falha ao ler cadernos:", err);
    cadernos = [];
    resumo.textContent = "Não foi possível carregar. Verifique se as regras do banco foram publicadas.";
  }
  try { legado = await listarAtividades(); } catch { legado = []; }
  try { itensPlano = await listarItens(); } catch { itensPlano = []; }
  renderTopicos();
  render();
}

/* ------------------------------ TÓPICOS ------------------------------ */

function renderTopicos() {
  const mat = selDisc.value;
  const nomes = [...new Set(
    itensPlano
      .filter((i) => (i.disciplina || "") === mat && i.categoria !== "revisao")
      .map((i) => (i.titulo || "").trim())
      .filter(Boolean)
  )];
  if (!nomes.length) { blocoTopicos.hidden = true; listaTopicos.innerHTML = ""; return; }
  blocoTopicos.hidden = false;
  listaTopicos.innerHTML = nomes.map((n) =>
    `<label class="top-chip"><input type="checkbox" value="${escapar(n)}"><span>${escapar(n)}</span></label>`
  ).join("");
}

function topicosMarcados() {
  return [...listaTopicos.querySelectorAll("input:checked")].map((c) => c.value);
}

selDisc.addEventListener("change", renderTopicos);
$("#top-nenhum").addEventListener("click", () =>
  listaTopicos.querySelectorAll("input:checked").forEach((c) => (c.checked = false)));

/* --------------------------- CRIAR CADERNO --------------------------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const total = Number(form.total.value) || 0;
  const acertos = Number(form.acertos.value) || 0;
  await criarCaderno({
    nome: form.nome.value,
    disciplina: form.disciplina.value,
    topicos: topicosMarcados(),
    primeira: {
      data: form.data.value || hojeISO(),
      total,
      acertos,
      tempoMin: form.tempoMin.value,
    },
  });
  form.nome.value = "";
  form.total.value = "";
  form.acertos.value = "";
  form.tempoMin.value = "";
  listaTopicos.querySelectorAll("input:checked").forEach((c) => (c.checked = false));
  await carregar();
});

/* ------------------------------ RENDER ------------------------------ */

function render() {
  let tot = 0, ac = 0, min = 0;
  const porMat = {};
  const acumula = (m, total, acertos, tempoMin) => {
    tot += total; ac += acertos; min += tempoMin;
    (porMat[m] ||= { total: 0, acertos: 0, min: 0 });
    porMat[m].total += total; porMat[m].acertos += acertos; porMat[m].min += tempoMin;
  };
  for (const c of cadernos)
    for (const t of c.tentativas || [])
      acumula(c.disciplina || "—", t.total || 0, t.acertos || 0, t.tempoMin || 0);
  for (const a of legado)
    acumula(a.disciplina || "—", a.total || 0, a.acertos || 0, a.tempoMin || 0);

  const pct = tot ? Math.round((ac / tot) * 100) : 0;
  resumo.textContent = tot
    ? `${cadernos.length} caderno(s) · ${tot} questões resolvidas · ${ac} acertos (${pct}%) · ${fmtMin(min)}`
    : "Nenhum caderno ainda. Crie o primeiro acima.";

  const mats = Object.keys(porMat).sort((x, y) => porMat[y].total - porMat[x].total);
  placar.innerHTML = mats.length
    ? mats.map((m) => {
        const d = porMat[m];
        const p = d.total ? Math.round((d.acertos / d.total) * 100) : 0;
        const cls = CLASSE_MAT[m] || "rev";
        return `
          <div class="placar-card">
            <div class="placar-top">
              <span class="tag t-${cls}">${escapar(m)}</span>
              <span class="placar-pct ${p >= 70 ? "bom" : p >= 50 ? "med" : "ruim"}">${p}%</span>
            </div>
            <div class="placar-num">${d.acertos}/${d.total} acertos</div>
            <div class="placar-barra"><span style="width:${p}%"></span></div>
            <div class="placar-sub">${fmtMin(d.min)}</div>
          </div>`;
      }).join("")
    : `<p class="vazio">O placar por matéria aparece aqui conforme você registra questões.</p>`;

  renderCadernos();
  renderLegado();
}

function renderCadernos() {
  if (!cadernos.length) {
    listaCadernos.innerHTML = `<p class="vazio">Sem cadernos ainda. Crie um acima para acompanhar sua evolução ao refazer.</p>`;
    return;
  }
  listaCadernos.innerHTML = cadernos.map((c) => {
    const cls = CLASSE_MAT[c.disciplina] || "rev";
    const tent = (c.tentativas || []).slice();
    const primeira = tent[0];
    const ultima = tent[tent.length - 1];
    const pctDe = (t) => (t && t.total ? Math.round((t.acertos / t.total) * 100) : 0);
    const pPrim = pctDe(primeira);
    const pUlt = pctDe(ultima);
    const delta = tent.length > 1 ? pUlt - pPrim : null;
    const deltaTxt = delta == null ? ""
      : delta > 0 ? `<span class="cad-delta subiu">▲ +${delta}%</span>`
      : delta < 0 ? `<span class="cad-delta caiu">▼ ${delta}%</span>`
      : `<span class="cad-delta igual">→ 0%</span>`;

    const tops = Array.isArray(c.topicos) && c.topicos.length
      ? `<div class="cad-topicos">${c.topicos.map((t) => `<span class="ativ-top">${escapar(t)}</span>`).join("")}</div>` : "";

    const linhas = tent.map((t, i) => {
      const p = pctDe(t);
      const marca = `${i + 1}ª`;
      const podeRemover = tent.length > 1;
      return `
        <div class="cad-tent">
          <span class="cad-tent-n">${marca}</span>
          <span class="cad-tent-data">${t.data ? fmtData(t.data) : "—"}</span>
          <span class="cad-tent-num">${t.acertos}/${t.total} <small>(${p}%)</small></span>
          <span class="cad-tent-barra"><span class="${p >= 70 ? "bom" : p >= 50 ? "med" : "ruim"}" style="width:${p}%"></span></span>
          <span class="cad-tent-tempo">${fmtMin(t.tempoMin || 0)}</span>
          ${podeRemover ? `<button class="mini x-tent" data-cad="${c.id}" data-i="${i}" title="Remover tentativa">×</button>` : `<span></span>`}
        </div>`;
    }).join("");

    return `
      <div class="cad-card" data-id="${c.id}">
        <div class="cad-head">
          <div class="cad-titulo">
            <span class="tag t-${cls}">${escapar(c.disciplina || "—")}</span>
            <b>${escapar(c.nome)}</b>
          </div>
          <div class="cad-resumo">
            ${tent.length} tentativa(s) · ${pPrim}% &rarr; <b>${pUlt}%</b> ${deltaTxt}
          </div>
        </div>
        ${tops}
        <div class="cad-tentativas">${linhas}</div>
        <div class="cad-acoes">
          <button class="mini refazer" data-cad="${c.id}">&#65291; Refeito</button>
          <button class="mini x-cad" data-cad="${c.id}">Excluir caderno</button>
        </div>
      </div>`;
  }).join("");

  listaCadernos.querySelectorAll(".refazer").forEach((b) =>
    b.addEventListener("click", () => abrirRefeito(b.dataset.cad)));
  listaCadernos.querySelectorAll(".x-cad").forEach((b) =>
    b.addEventListener("click", async () => {
      const c = cadernos.find((x) => x.id === b.dataset.cad);
      if (!confirm(`Excluir o caderno "${c?.nome || ""}" e todas as tentativas?`)) return;
      await removerCaderno(b.dataset.cad);
      await carregar();
    }));
  listaCadernos.querySelectorAll(".x-tent").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remover esta tentativa?")) return;
      await removerTentativa(b.dataset.cad, Number(b.dataset.i));
      await carregar();
    }));
}

function renderLegado() {
  if (!legado.length) { blocoLegado.hidden = true; return; }
  blocoLegado.hidden = false;
  listaEl.innerHTML = legado.map((a) => {
    const cls = CLASSE_MAT[a.disciplina] || "rev";
    const p = a.total ? Math.round((a.acertos / a.total) * 100) : 0;
    return `
      <div class="ativ-item" data-id="${a.id}">
        <div class="ativ-esq">
          <span class="ativ-data">${fmtData(a.data)}</span>
          <span class="tag t-${cls}">${escapar(a.disciplina || "—")}</span>
        </div>
        <div class="ativ-mid">
          <span class="ativ-num">${a.acertos}/${a.total} <small>(${p}%)</small></span>
          <span class="ativ-tempo">${fmtMin(a.tempoMin || 0)}</span>
          ${a.obs ? `<span class="ativ-obs">${escapar(a.obs)}</span>` : ""}
        </div>
        <button class="mini x-ativ" title="Remover">&times;</button>
      </div>`;
  }).join("");
  listaEl.querySelectorAll(".x-ativ").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.closest(".ativ-item").dataset.id;
      if (!confirm("Remover este registro antigo?")) return;
      await removerAtividade(id);
      await carregar();
    }));
}

/* --------------------------- MODAL REFEITO --------------------------- */

function abrirRefeito(cadId) {
  cadernoEmRefeito = cadernos.find((c) => c.id === cadId);
  if (!cadernoEmRefeito) return;
  const tent = cadernoEmRefeito.tentativas || [];
  const ult = tent[tent.length - 1];
  rfNome.textContent = `${cadernoEmRefeito.nome} — última: ${ult ? `${ult.acertos}/${ult.total}` : "—"}`;
  rfData.value = hojeISO();
  rfTotal.value = ult ? ult.total : "";
  rfAcertos.value = "";
  rfTempo.value = "";
  modalRefeito.hidden = false;
}

function fecharRefeito() { modalRefeito.hidden = true; cadernoEmRefeito = null; }

$("#rf-cancelar").addEventListener("click", fecharRefeito);
modalRefeito.addEventListener("click", (e) => { if (e.target === modalRefeito) fecharRefeito(); });
$("#rf-salvar").addEventListener("click", async () => {
  if (!cadernoEmRefeito) return;
  await adicionarTentativa(cadernoEmRefeito.id, {
    data: rfData.value || hojeISO(),
    total: Number(rfTotal.value) || 0,
    acertos: Number(rfAcertos.value) || 0,
    tempoMin: Number(rfTempo.value) || 0,
  });
  fecharRefeito();
  await carregar();
});

/* ------------------------------ UTIL ------------------------------ */

function fmtMin(min) {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h) return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
  return `${m}min`;
}

const DIAS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtData(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS_SEM[dt.getDay()]}, ${d} ${MESES[m - 1]}`;
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
