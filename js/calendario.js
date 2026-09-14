// calendario.js
// Página do calendário. Mostra o plano dia a dia. Cada item tem:
//  - status rico por ícones (a fazer / concluído / pulei-não-importa /
//    pulei-já-sabia) + marca "precisa de revisão", com legenda e tooltip;
//  - cronômetro que grava o tempo real;
//  - geração de revisões espaçadas (+1/+7/+15/+30) com cor de fundo escolhível;
//  - arrastar para reordenar dentro do dia e entre dias, com "voltar à posição
//    inicial" (guardando dia/ordem originais).
// No topo roda o Pomodoro universal do dia, junto do cronômetro dos itens.

import { sair, aoMudarUsuario } from "./auth.js";
import {
  planoJaCarregado,
  importarPlano,
  listarItens,
  atualizarItem,
  criarItem,
  criarRevisao,
  removerItem,
  removerItens,
  limparItens,
  reordenarItens,
  voltarPosicaoInicial,
  registrarPomodoro,
  listarCadernos,
  criarCaderno,
} from "./db.js";
import { planoDoUsuario, nomeDoUsuario, dataProvaDoUsuario } from "./planos.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaCal = $("#tela-cal");
const quemSou = $("#quem-sou");
const resumoGeral = $("#resumo-geral");
const metricasEl = $("#metricas");
const btnCarregar = $("#btn-carregar");
const btnRecarregar = $("#btn-recarregar");
const listaDias = $("#lista-dias");
const DOMINIO_LOGIN = "@foco.app";

let itens = []; // itens carregados do banco
let cadernosPorId = {}; // id do caderno → caderno (para itens de exercícios)
const cronometros = {}; // id -> { inicio, intervalo }
let usuarioAtual = null; // user do Firebase logado (para escolher o plano)

const NOMES_TIPO = { video: "Videoaula", pdf: "PDF", revisao: "Revisão", simulado: "Simulado", exercicios: "Exercícios" };
const CLASSE_MAT = {
  "Português": "port", "Inglês": "ing", "Raciocínio Lógico": "rlm",
  "Atualidades e IA": "atu", "Legislação": "leg", "Específicos": "esp",
};
const MATERIAS = ["Português", "Inglês", "Raciocínio Lógico", "Atualidades e IA", "Legislação", "Específicos", "Revisão"];
const TIPOS = [["video", "Videoaula"], ["pdf", "PDF"], ["exercicios", "Exercícios"], ["revisao", "Revisão"], ["simulado", "Simulado"]];

// Status ricos: valor guardado -> { ícone, rótulo (legenda/tooltip), classe }
const STATUS = {
  afazer:                 { icone: "○", rotulo: "A fazer",                  classe: "s-afazer" },
  feito:                  { icone: "✓", rotulo: "Concluído",                classe: "s-feito" },
  "pulado:naoImportante": { icone: "⤳", rotulo: "Pulei — não é importante", classe: "s-pulado" },
  "pulado:jaSabia":       { icone: "»", rotulo: "Pulei — já sabia",         classe: "s-sabia" },
};
const ORDEM_STATUS = ["afazer", "feito", "pulado:naoImportante", "pulado:jaSabia"];

// Paleta pronta para o fundo das revisões (escolhida na hora de criar).
const PALETA = [
  { nome: "Âmbar",  cor: "rgba(242,165,65,.14)" },
  { nome: "Azul",   cor: "rgba(122,162,247,.16)" },
  { nome: "Verde",  cor: "rgba(62,207,142,.14)" },
  { nome: "Rosa",   cor: "rgba(247,118,142,.15)" },
  { nome: "Roxo",   cor: "rgba(187,154,247,.16)" },
  { nome: "Neutro", cor: "" },
];
const OFFSETS = [1, 7, 15, 30];

// valor do status -> {status, motivoPulo}
function parseStatus(v) {
  if (v === "pulado:naoImportante") return { status: "pulado", motivoPulo: "naoImportante" };
  if (v === "pulado:jaSabia") return { status: "pulado", motivoPulo: "jaSabia" };
  return { status: v, motivoPulo: "" };
}
function valorStatus(it) {
  if (it.status === "pulado") return "pulado:" + (it.motivoPulo || "naoImportante");
  return it.status || "afazer";
}

/* ------------------------------ AUTH ------------------------------ */

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) {
    telaCal.hidden = true;
    telaDeslogado.hidden = false;
    return;
  }
  telaDeslogado.hidden = true;
  telaCal.hidden = false;
  usuarioAtual = user;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  await carregar();
});

/* --------------------------- CARREGAMENTO --------------------------- */

async function carregar() {
  const plano = planoDoUsuario(usuarioAtual);
  // Texto dos botões sempre com o nome de quem está logado.
  btnCarregar.textContent = plano ? `Carregar plano de ${nomeDoUsuario(usuarioAtual)}` : "Carregar plano";
  const temPlano = await planoJaCarregado();
  btnCarregar.hidden = temPlano || !plano;
  btnRecarregar.hidden = !temPlano;
  if (!temPlano) {
    resumoGeral.textContent = plano
      ? `Nenhum plano carregado ainda. Clique em “Carregar plano de ${nomeDoUsuario(usuarioAtual)}”.`
      : "Nenhum plano cadastrado para este usuário.";
    listaDias.innerHTML = "";
    return;
  }
  itens = await listarItens();
  await carregarCadernos();
  render();
}

// Índice de cadernos por id, tolerante a falha (regra não publicada etc.).
async function carregarCadernos() {
  try {
    const lista = await listarCadernos();
    cadernosPorId = {};
    for (const c of lista) cadernosPorId[c.id] = c;
  } catch (e) {
    console.warn("Falha ao ler cadernos:", e);
    cadernosPorId = {};
  }
}

btnCarregar.addEventListener("click", async () => {
  const plano = planoDoUsuario(usuarioAtual);
  if (!plano) { alert("Não há plano cadastrado para este usuário."); return; }
  btnCarregar.disabled = true;
  await importarPlano(plano);
  btnCarregar.disabled = false;
  await carregar();
});

btnRecarregar.addEventListener("click", async () => {
  const plano = planoDoUsuario(usuarioAtual);
  if (!plano) { alert("Não há plano cadastrado para este usuário."); return; }
  if (!confirm("Isto apaga o progresso atual e recarrega o plano do zero. Continuar?")) return;
  await limparItens();
  await importarPlano(plano);
  await carregar();
});

/* ------------------------------ RENDER ------------------------------ */

function render() {
  const feitos = itens.filter((i) => i.status === "feito").length;
  const pulados = itens.filter((i) => i.status === "pulado").length;
  const revisar = itens.filter((i) => i.precisaRevisao).length;
  const totalSeg = itens.reduce((s, i) => s + (i.tempoGasto || 0), 0);
  resumoGeral.textContent =
    `${feitos} de ${itens.length} concluídos · ${pulados} pulados · ${revisar} p/ revisar · ${fmtTempo(totalSeg)} cronometrados`;

  renderMetricas();

  const porData = {};
  for (const it of itens) (porData[it.data] ||= []).push(it);
  const datas = Object.keys(porData).sort();

  const hoje = hojeISO();
  listaDias.innerHTML = "";
  listaDias.appendChild(legendaEl());

  for (const data of datas) {
    const doDia = porData[data].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const feitosDia = doDia.filter((i) => i.status === "feito").length;
    const puladosDia = doDia.filter((i) => i.status === "pulado").length;
    const minPrev = doDia.reduce((s, i) => s + (i.duracaoMin || 0), 0);
    const realSegDia = doDia.reduce((s, i) => s + (i.tempoGasto || 0), 0);
    const extra = puladosDia ? ` · ${puladosDia} pulado(s)` : "";
    const realTxt = realSegDia > 0
      ? `<span class="dia-real" title="Tempo real cronometrado neste dia">real ${fmtTempo(realSegDia)}</span>` : "";

    const bloco = document.createElement("section");
    bloco.className = "dia-bloco" + (data === hoje ? " hoje" : "");
    bloco.dataset.data = data;
    bloco.innerHTML = `
      <header class="dia-head">
        <span class="dia-data">${fmtData(data)}${data === hoje ? " · hoje" : ""}</span>
        <span class="dia-prog">${realTxt}${feitosDia}/${doDia.length} · ${Math.round(minPrev / 60 * 10) / 10}h previstas${extra}</span>
      </header>`;
    const ul = document.createElement("ul");
    ul.className = "itens";
    ul.dataset.data = data;
    for (const it of doDia) ul.appendChild(itemEl(it));
    habilitarDrop(ul);
    bloco.appendChild(ul);
    bloco.appendChild(addTopicoEl(data, doDia));
    listaDias.appendChild(bloco);
  }
}

// Painel de métricas no topo do calendário.
function renderMetricas() {
  if (!itens.length) { metricasEl.innerHTML = ""; return; }

  // dias até a prova (data por usuário)
  const hoje = hojeISO();
  const dataProva = dataProvaDoUsuario(usuarioAtual);
  const diasProva = dataProva ? diffDias(hoje, dataProva) : null;

  // horas planejadas (total e restante)
  const minTotal = itens.reduce((s, i) => s + (i.duracaoMin || 0), 0);
  const minResta = itens
    .filter((i) => i.status === "afazer")
    .reduce((s, i) => s + (i.duracaoMin || 0), 0);

  // progresso
  const feitos = itens.filter((i) => i.status === "feito").length;
  const pctFeito = itens.length ? Math.round((feitos / itens.length) * 100) : 0;

  // disciplinas distintas (ignora as "Revisão/Geral" agregadas)
  const disc = new Set(itens.map((i) => i.disciplina).filter(Boolean));

  // % em questões (dos cadernos, última tentativa de cada)
  let q = 0, ac = 0;
  for (const c of Object.values(cadernosPorId)) {
    const t = (c.tentativas || [])[ (c.tentativas || []).length - 1 ];
    if (t) { q += t.total || 0; ac += t.acertos || 0; }
  }
  const pctQ = q ? Math.round((ac / q) * 100) : null;

  // tempo real cronometrado (todos os itens)
  const realSeg = itens.reduce((s, i) => s + (i.tempoGasto || 0), 0);
  const realH = (realSeg / 3600);

  const cards = [
    { n: diasProva == null ? "—" : (diasProva >= 0 ? diasProva : "—"), r: diasProva == null ? "sem data de prova" : (diasProva >= 0 ? "dias até a prova" : "prova passou"), cls: diasProva != null && diasProva >= 0 && diasProva <= 14 ? "urgente" : "" },
    { n: `${Math.round(minTotal / 60)}h`, r: "horas planejadas" },
    { n: `${realH < 10 ? realH.toFixed(1) : Math.round(realH)}h`, r: "tempo real estudado", cls: "med" },
    { n: `${pctFeito}%`, r: "do plano concluído", cls: "bom" },
    { n: pctQ != null ? `${pctQ}%` : "—", r: "em questões", cls: pctQ == null ? "" : pctQ >= 70 ? "bom" : pctQ >= 50 ? "med" : "ruim" },
    { n: disc.size, r: "disciplinas" },
  ];

  metricasEl.innerHTML = cards.map((c) =>
    `<div class="metrica ${c.cls || ""}"><b>${c.n}</b><span>${c.r}</span></div>`).join("");
}

// Diferença em dias entre duas datas ISO (b - a).
function diffDias(aISO, bISO) {
  const [a1, a2, a3] = aISO.split("-").map(Number);
  const [b1, b2, b3] = bISO.split("-").map(Number);
  const a = new Date(a1, a2 - 1, a3);
  const b = new Date(b1, b2 - 1, b3);
  return Math.round((b - a) / 86400000);
}

// Legenda fixa dos ícones de status.
function legendaEl() {
  const div = document.createElement("div");
  div.className = "legenda";
  div.innerHTML =
    `<span class="leg-titulo">Legenda:</span>` +
    ORDEM_STATUS.map((k) => {
      const s = STATUS[k];
      return `<span class="leg-item"><span class="leg-ic ${s.classe}">${s.icone}</span>${s.rotulo}</span>`;
    }).join("") +
    `<span class="leg-item"><span class="leg-ic s-rev">★</span>Precisa de revisão</span>`;
  return div;
}

// Botão + formulário inline para adicionar um tópico ao dia.
function addTopicoEl(data, doDia) {
  const wrap = document.createElement("div");
  wrap.className = "add-topico";
  const proxOrdem = Math.max(0, ...doDia.map((i) => i.ordem || 0)) + 1;
  wrap.innerHTML = `
    <button class="mini add-btn">+ adicionar tópico</button>
    <form class="add-form" hidden autocomplete="off">
      <input name="titulo" placeholder="Título do tópico" required />
      <select name="disciplina">${MATERIAS.map((m) => `<option>${m}</option>`).join("")}</select>
      <select name="tipo">${TIPOS.map(([v, r]) => `<option value="${v}">${r}</option>`).join("")}</select>
      <input name="min" type="number" min="0" placeholder="min" style="max-width:80px" />
      <button class="btn-primario" type="submit">Salvar</button>
      <button type="button" class="mini cancelar">Cancelar</button>
    </form>`;
  const btn = wrap.querySelector(".add-btn");
  const form = wrap.querySelector(".add-form");
  btn.addEventListener("click", () => { form.hidden = false; btn.hidden = true; form.titulo.focus(); });
  wrap.querySelector(".cancelar").addEventListener("click", () => { form.hidden = true; btn.hidden = false; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = form.titulo.value.trim();
    if (!titulo) return;
    await criarItem({
      data, titulo,
      disciplina: form.disciplina.value,
      tipo: form.tipo.value,
      duracaoMin: form.min.value,
      ordem: proxOrdem,
    });
    itens = await listarItens();
    render();
  });
  return wrap;
}

function itemEl(it) {
  const li = document.createElement("li");
  const vs = valorStatus(it);
  li.className = "item"
    + (it.status === "feito" ? " concluido" : "")
    + (it.status === "pulado" ? " pulado" : "")
    + (it.precisaRevisao ? " revisar" : "")
    + (it.categoria === "revisao" ? " e-revisao" : "");
  li.draggable = true;
  li.dataset.id = it.id;
  if (it.corFundo) li.style.background = it.corFundo;

  const mat = CLASSE_MAT[it.disciplina] || "rev";
  const motivoTxt = it.status === "pulado"
    ? (it.motivoPulo === "jaSabia" ? "já sabia" : "não é importante") : "";
  // itens antigos podem não ter dataOriginal/ordemOriginal — usa o valor atual
  // como base, assim o botão "voltar" só aparece quando de fato houve mudança.
  const dataOrig = it.dataOriginal ?? it.data;
  const ordemOrig = it.ordemOriginal ?? it.ordem;
  const movido = (it.data !== dataOrig || it.ordem !== ordemOrig);
  const origem = it.categoria === "revisao" && it.origemTitulo
    ? `<span class="origem" title="Revisão de: ${escapar(it.origemTitulo)}">↩ ${escapar(it.origemTitulo)}</span>` : "";

  li.innerHTML = `
    <span class="grip" title="Arraste para mover">⋮⋮</span>
    <div class="status-icons" role="group" aria-label="Status">
      ${ORDEM_STATUS.map((k) => {
        const s = STATUS[k];
        const ativo = vs === k ? " ativo" : "";
        return `<button class="st-ic ${s.classe}${ativo}" data-st="${k}" title="${s.rotulo}" aria-label="${s.rotulo}">${s.icone}</button>`;
      }).join("")}
    </div>
    <div class="item-corpo">
      <div class="item-titulo">${escapar(it.titulo)}</div>
      ${(it.professor || it.topico) ? `<div class="item-local">${it.professor ? `Prof. ${escapar(it.professor)}` : ""}${it.professor && it.topico ? " · " : ""}${it.topico ? `Tópico ${it.topico}` : ""}</div>` : ""}
      <div class="item-sub">
        <span class="tag t-${mat}">${escapar(it.disciplina)}</span>
        <span class="tipo">${NOMES_TIPO[it.tipo] || it.tipo}</span>
        ${it.paginas ? `<span class="paginas">${it.paginas} págs</span>` : ""}
        ${it.duracaoMin ? `<span class="prev">~${it.duracaoMin}min</span>` : ""}
        ${motivoTxt ? `<span class="motivo">${motivoTxt}</span>` : ""}
        ${origem}
        ${it.tipo === "exercicios" ? seloCaderno(it) : ""}
      </div>
    </div>
    <button class="mini rev-btn" title="Precisa de revisão">${it.precisaRevisao ? "★" : "☆"}</button>
    <button class="mini rev-esp-btn" title="Criar revisões espaçadas">＋rev</button>
    ${movido ? `<button class="mini voltar-btn" title="Voltar ao dia original (${fmtDataCurta(dataOrig)})">↩</button>` : ""}
    <div class="item-timer">
      <span class="tempo" data-tempo>${fmtTempo(it.tempoGasto || 0)}</span>
      <button class="mini timer-btn" data-timer>${cronometros[it.id] ? "⏸" : "▶"}</button>
    </div>
    <button class="mini x-btn" title="Remover">×</button>`;

  li.querySelectorAll(".st-ic").forEach((b) => {
    b.addEventListener("click", async () => {
      const campos = parseStatus(b.dataset.st);
      Object.assign(it, campos);
      await atualizarItem(it.id, campos);
      render();
    });
  });

  li.querySelector(".rev-btn").addEventListener("click", async () => {
    it.precisaRevisao = !it.precisaRevisao;
    await atualizarItem(it.id, { precisaRevisao: it.precisaRevisao });
    render();
  });

  li.querySelector(".rev-esp-btn").addEventListener("click", () => abrirPainelRevisao(it, li));

  const cadBtn = li.querySelector(".cad-link-btn");
  if (cadBtn) cadBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (it.cadernoId && cadernosPorId[it.cadernoId]) {
      // já tem caderno → vai para a página de atividades
      location.href = "atividades.html";
    } else {
      abrirModalAnexarCaderno(it);
    }
  });

  const voltar = li.querySelector(".voltar-btn");
  if (voltar) voltar.addEventListener("click", async () => {
    await voltarPosicaoInicial(it.id, dataOrig, ordemOrig);
    itens = await listarItens();
    render();
  });

  li.querySelector(".x-btn").addEventListener("click", async () => {
    // Revisão espaçada com família (mesma origem): abre modal com checkboxes,
    // já marcando a clicada, deixando escolher quais apagar.
    if (it.categoria === "revisao" && it.origemId) {
      const familia = itens
        .filter((x) => x.categoria === "revisao" && x.origemId === it.origemId)
        .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
      if (familia.length > 1) {
        abrirModalApagarRevisoes(it, familia);
        return;
      }
    }
    if (!confirm(`Remover "${it.titulo}"?`)) return;
    await removerItem(it.id);
    itens = itens.filter((x) => x.id !== it.id);
    render();
  });

  const elTempo = li.querySelector("[data-tempo]");
  const elBtn = li.querySelector("[data-timer]");
  if (cronometros[it.id]) elBtn.classList.add("rodando");
  elBtn.addEventListener("click", () => alternarTimer(it, elBtn, elTempo));

  habilitarDrag(li);
  return li;
}

/* --------- MODAL: apagar revisões da mesma família (com seleção) --------- */

function abrirModalApagarRevisoes(clicada, familia) {
  document.querySelectorAll(".modal-fundo").forEach((m) => m.remove());

  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  const hoje = hojeISO();

  const linhas = familia.map((r) => {
    const marcada = r.id === clicada.id ? "checked" : "";
    const dataTxt = r.data ? fmtData(r.data) : "sem data";
    const venc = r.data && r.data < hoje ? ` <span class="atrasado">atrasada</span>` : "";
    const feito = r.status === "feito" ? " · ✓ feita" : "";
    return `
      <label class="mr-item">
        <input type="checkbox" value="${r.id}" ${marcada}>
        <span class="mr-txt">
          <b>${escapar(r.titulo)}</b>
          <span class="mr-meta">${dataTxt}${venc}${feito}</span>
        </span>
      </label>`;
  }).join("");

  fundo.innerHTML = `
    <div class="modal-caixa" role="dialog" aria-modal="true">
      <h3 class="modal-tit">Apagar revisões</h3>
      <p class="modal-sub">Criadas a partir de "${escapar(clicada.origemTitulo || "um item")}".
        Marque as que deseja apagar.</p>
      <div class="mr-acoes-topo">
        <button class="mini" data-todas>Marcar todas</button>
        <button class="mini" data-nenhuma>Desmarcar todas</button>
      </div>
      <div class="mr-lista">${linhas}</div>
      <div class="modal-botoes">
        <button class="mini" data-cancelar>Cancelar</button>
        <button class="mini perigo" data-apagar>Apagar selecionadas</button>
      </div>
    </div>`;

  document.body.appendChild(fundo);

  const caixas = () => [...fundo.querySelectorAll(".mr-lista input[type=checkbox]")];
  fundo.querySelector("[data-todas]").addEventListener("click", () =>
    caixas().forEach((c) => (c.checked = true)));
  fundo.querySelector("[data-nenhuma]").addEventListener("click", () =>
    caixas().forEach((c) => (c.checked = false)));

  const fechar = () => fundo.remove();
  fundo.querySelector("[data-cancelar]").addEventListener("click", fechar);
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });

  fundo.querySelector("[data-apagar]").addEventListener("click", async () => {
    const ids = caixas().filter((c) => c.checked).map((c) => c.value);
    if (!ids.length) { fechar(); return; }
    await removerItens(ids);
    itens = itens.filter((x) => !ids.includes(x.id));
    fechar();
    render();
  });
}

/* ------------- CADERNO ANEXADO (itens de exercícios) ------------- */

// Selo mostrado no item: se tem caderno, % da última tentativa + evolução e
// link; se não, um botão "anexar caderno".
function seloCaderno(it) {
  const cad = it.cadernoId ? cadernosPorId[it.cadernoId] : null;
  if (!cad) {
    return `<button class="cad-link-btn anexar" title="Anexar um caderno de questões">＋ caderno</button>`;
  }
  const tent = cad.tentativas || [];
  const pctDe = (t) => (t && t.total ? Math.round((t.acertos / t.total) * 100) : 0);
  const pUlt = pctDe(tent[tent.length - 1]);
  const pPrim = pctDe(tent[0]);
  const delta = tent.length > 1 ? pUlt - pPrim : null;
  const dTxt = delta == null ? ""
    : delta > 0 ? ` <span class="cad-up">▲+${delta}%</span>`
    : delta < 0 ? ` <span class="cad-down">▼${delta}%</span>`
    : ` <span class="cad-eq">→</span>`;
  return `<button class="cad-link-btn tem" title="${escapar(cad.nome)} · ${tent.length} tentativa(s) — abrir atividades">📓 ${pUlt}%${dTxt}</button>`;
}

function abrirModalAnexarCaderno(it) {
  document.querySelectorAll(".modal-fundo").forEach((m) => m.remove());
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";

  // cadernos da mesma matéria primeiro, depois os demais
  const todos = Object.values(cadernosPorId);
  const mesma = todos.filter((c) => (c.disciplina || "") === (it.disciplina || ""));
  const outros = todos.filter((c) => (c.disciplina || "") !== (it.disciplina || ""));
  const ordenados = [...mesma, ...outros];

  const opcoes = ordenados.length
    ? ordenados.map((c) => {
        const tent = c.tentativas || [];
        const p = tent.length && tent[tent.length - 1].total
          ? Math.round((tent[tent.length - 1].acertos / tent[tent.length - 1].total) * 100) : 0;
        return `<option value="${c.id}">${escapar(c.nome)} — ${c.disciplina || "—"} (${tent.length} tent., ${p}%)</option>`;
      }).join("")
    : "";

  fundo.innerHTML = `
    <div class="modal-caixa" role="dialog" aria-modal="true">
      <h3 class="modal-tit">Anexar caderno</h3>
      <p class="modal-sub">Vincule este item de exercícios a um caderno de questões.</p>

      <div class="anexo-secao">
        <label class="anexo-radio"><input type="radio" name="modo" value="existente" ${ordenados.length ? "checked" : ""}>
          <span>Escolher existente</span></label>
        <select id="an-select" ${ordenados.length ? "" : "disabled"}>${opcoes || `<option>Nenhum caderno criado ainda</option>`}</select>
      </div>

      <div class="anexo-secao">
        <label class="anexo-radio"><input type="radio" name="modo" value="novo" ${ordenados.length ? "" : "checked"}>
          <span>Criar novo</span></label>
        <input id="an-nome" placeholder="Nome do caderno" value="${escapar(it.titulo)}">
        <div class="anexo-nums">
          <input id="an-total" type="number" min="0" placeholder="Qtd">
          <input id="an-acertos" type="number" min="0" placeholder="Acertos">
          <input id="an-tempo" type="number" min="0" placeholder="min">
        </div>
      </div>

      <div class="modal-botoes">
        <button class="mini" data-cancelar>Cancelar</button>
        <button class="mini perigo" data-ok style="background:var(--accent);border-color:var(--accent)">Anexar</button>
      </div>
    </div>`;

  document.body.appendChild(fundo);

  const fechar = () => fundo.remove();
  fundo.querySelector("[data-cancelar]").addEventListener("click", fechar);
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });

  fundo.querySelector("[data-ok]").addEventListener("click", async () => {
    const modo = fundo.querySelector('input[name="modo"]:checked').value;
    let cadernoId = null;

    if (modo === "existente") {
      cadernoId = fundo.querySelector("#an-select").value;
      if (!cadernoId) { fechar(); return; }
    } else {
      const nome = fundo.querySelector("#an-nome").value.trim() || it.titulo;
      const total = Number(fundo.querySelector("#an-total").value) || 0;
      const acertos = Number(fundo.querySelector("#an-acertos").value) || 0;
      const tempoMin = Number(fundo.querySelector("#an-tempo").value) || 0;
      cadernoId = await criarCaderno({
        nome, disciplina: it.disciplina || "", topicos: [it.titulo],
        primeira: { data: hojeISO(), total, acertos, tempoMin },
      });
    }

    await atualizarItem(it.id, { cadernoId });
    it.cadernoId = cadernoId;
    await carregarCadernos();
    fechar();
    render();
  });
}

/* ------------------- REVISÕES ESPAÇADAS (painel) ------------------- */

function abrirPainelRevisao(it, li) {
  document.querySelectorAll(".rev-painel").forEach((p) => p.remove());
  const painel = document.createElement("div");
  painel.className = "rev-painel";
  painel.innerHTML = `
    <div class="rev-p-linha">
      <span class="rev-p-tit">Revisões espaçadas</span>
      <span class="rev-p-sub">a partir de ${fmtData(it.data)}</span>
    </div>
    <div class="rev-p-off">
      ${OFFSETS.map((o) => `<label class="rev-off"><input type="checkbox" value="${o}" checked> +${o}d</label>`).join("")}
    </div>
    <div class="rev-p-cor">
      <span class="rev-p-lbl">Cor:</span>
      ${PALETA.map((p, i) => `<button class="rev-cor${i === 0 ? " ativo" : ""}" data-cor="${p.cor}" title="${p.nome}" style="background:${p.cor || "var(--surface-2)"}"></button>`).join("")}
    </div>
    <div class="rev-p-acoes">
      <button class="btn-primario rev-criar">Criar</button>
      <button class="mini rev-fechar">Cancelar</button>
    </div>`;

  let corSel = PALETA[0].cor;
  painel.querySelectorAll(".rev-cor").forEach((b) => {
    b.addEventListener("click", () => {
      painel.querySelectorAll(".rev-cor").forEach((x) => x.classList.remove("ativo"));
      b.classList.add("ativo");
      corSel = b.dataset.cor;
    });
  });
  painel.querySelector(".rev-fechar").addEventListener("click", () => painel.remove());
  painel.querySelector(".rev-criar").addEventListener("click", async () => {
    const offs = [...painel.querySelectorAll(".rev-p-off input:checked")].map((c) => Number(c.value));
    if (!offs.length) { painel.remove(); return; }
    for (const o of offs) await criarRevisao(it, o, corSel);
    painel.remove();
    itens = await listarItens();
    render();
  });

  li.after(painel);
}

/* -------------------------- DRAG AND DROP -------------------------- */

let arrastado = null;
let scrollRAF = null;      // animação de rolagem automática
let scrollVel = 0;         // velocidade atual (px por frame)

// Enquanto arrasta, se o cursor chega perto do topo/base da janela, rola a
// página sozinha — assim dá para soltar o item em dias bem mais abaixo.
function autoScrollDrag(e) {
  const margem = 90;                 // zona sensível nas bordas (px)
  const velMax = 22;                 // velocidade máxima
  const y = e.clientY;
  const h = window.innerHeight;
  if (y < margem) {
    scrollVel = -Math.ceil(((margem - y) / margem) * velMax);
  } else if (y > h - margem) {
    scrollVel = Math.ceil(((y - (h - margem)) / margem) * velMax);
  } else {
    scrollVel = 0;
  }
  if (scrollVel && !scrollRAF) loopScroll();
}

function loopScroll() {
  if (!arrastado || !scrollVel) { scrollRAF = null; return; }
  window.scrollBy(0, scrollVel);
  scrollRAF = requestAnimationFrame(loopScroll);
}

function pararAutoScroll() {
  scrollVel = 0;
  if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
}

function habilitarDrag(li) {
  li.addEventListener("dragstart", (e) => {
    arrastado = li;
    li.classList.add("arrastando");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", li.dataset.id); } catch (_) {}
    document.addEventListener("dragover", autoScrollDrag);
  });
  li.addEventListener("dragend", () => {
    li.classList.remove("arrastando");
    document.querySelectorAll(".itens.alvo").forEach((u) => u.classList.remove("alvo"));
    document.removeEventListener("dragover", autoScrollDrag);
    pararAutoScroll();
    arrastado = null;
  });
}

function habilitarDrop(ul) {
  ul.addEventListener("dragover", (e) => {
    e.preventDefault();
    ul.classList.add("alvo");
    const depois = elementoDepois(ul, e.clientY);
    if (!arrastado) return;
    if (depois == null) ul.appendChild(arrastado);
    else ul.insertBefore(arrastado, depois);
  });
  ul.addEventListener("dragleave", (e) => {
    if (!ul.contains(e.relatedTarget)) ul.classList.remove("alvo");
  });
  ul.addEventListener("drop", async (e) => {
    e.preventDefault();
    ul.classList.remove("alvo");
    pararAutoScroll();
    await salvarOrdemDoDia(ul);
  });
}

// Acha o item acima do qual soltar, com base na posição Y do mouse.
function elementoDepois(ul, y) {
  const els = [...ul.querySelectorAll(".item:not(.arrastando)")];
  let melhor = { off: -Infinity, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const off = y - box.top - box.height / 2;
    if (off < 0 && off > melhor.off) melhor = { off, el };
  }
  return melhor.el;
}

// Depois de soltar, relê a ordem visual do dia e grava (ordem + nova data).
async function salvarOrdemDoDia(ul) {
  const data = ul.dataset.data;
  const ids = [...ul.querySelectorAll(".item")].map((li) => li.dataset.id);
  const mudancas = [];
  ids.forEach((id, i) => {
    const it = itens.find((x) => x.id === id);
    if (!it) return;
    if (it.ordem !== i || it.data !== data) {
      it.ordem = i;
      it.data = data;
      mudancas.push({ id, ordem: i, data });
    }
  });
  if (mudancas.length) {
    await reordenarItens(mudancas);
    itens = await listarItens();
  }
  render();
}

/* ---------------------------- CRONÔMETRO ---------------------------- */

function alternarTimer(it, elBtn, elTempo) {
  const c = cronometros[it.id];
  if (c) {
    clearInterval(c.intervalo);
    const decorrido = Math.round((Date.now() - c.inicio) / 1000);
    it.tempoGasto = (it.tempoGasto || 0) + decorrido;
    delete cronometros[it.id];
    elBtn.textContent = "▶";
    elBtn.classList.remove("rodando");
    elTempo.textContent = fmtTempo(it.tempoGasto);
    atualizarItem(it.id, { tempoGasto: it.tempoGasto });
  } else {
    const base = it.tempoGasto || 0;
    const inicio = Date.now();
    const intervalo = setInterval(() => {
      const agora = base + Math.round((Date.now() - inicio) / 1000);
      elTempo.textContent = fmtTempo(agora);
    }, 1000);
    cronometros[it.id] = { inicio, intervalo };
    elBtn.textContent = "⏸";
    elBtn.classList.add("rodando");
  }
}

window.addEventListener("beforeunload", () => {
  for (const id in cronometros) {
    const c = cronometros[id];
    const it = itens.find((x) => x.id === id);
    if (!it) continue;
    const decorrido = Math.round((Date.now() - c.inicio) / 1000);
    atualizarItem(id, { tempoGasto: (it.tempoGasto || 0) + decorrido });
  }
});

/* ===================== POMODORO UNIVERSAL DO DIA ===================== */
// Roda independente dos cronômetros de item (duas contagens simultâneas).
// Estudo e pausa configuráveis; avisa ao fim de cada fase; interrompível.

const pomo = {
  fase: "estudo",     // estudo | pausa
  rodando: false,
  restante: 25 * 60,
  estudoMin: 25,
  pausaMin: 5,
  intervalo: null,
  gastoNaFase: 0,     // segundos já rodados na fase atual (p/ salvar ao interromper)
};

function initPomodoro() {
  const barra = document.createElement("div");
  barra.className = "pomo-barra";
  barra.innerHTML = `
    <div class="pomo-esq">
      <span class="pomo-fase" data-fase>Estudo</span>
      <span class="pomo-tempo" data-ptempo>25:00</span>
    </div>
    <div class="pomo-controles">
      <button class="mini pomo-toggle" data-ptoggle>▶ Iniciar</button>
      <button class="mini pomo-encerrar" data-preset title="Zera e volta ao início do estudo">■ Encerrar</button>
      <label class="pomo-cfg">estudo <input type="number" min="1" value="25" data-pestudo> min</label>
      <label class="pomo-cfg">pausa <input type="number" min="1" value="5" data-ppausa> min</label>
    </div>`;
  const cab = $(".cal-cabecalho");
  if (cab) cab.after(barra);
  else telaCal.querySelector(".cal-main")?.prepend(barra);

  const elFase = barra.querySelector("[data-fase]");
  const elTempo = barra.querySelector("[data-ptempo]");
  const elToggle = barra.querySelector("[data-ptoggle]");
  const elReset = barra.querySelector("[data-preset]");
  const elEstudo = barra.querySelector("[data-pestudo]");
  const elPausa = barra.querySelector("[data-ppausa]");

  const elEncerrar = elReset;

  function pinta() {
    elFase.textContent = pomo.fase === "estudo" ? "Estudo" : "Pausa";
    barra.classList.toggle("em-pausa", pomo.fase === "pausa");
    elTempo.textContent = fmtRelogio(pomo.restante);
    elToggle.textContent = pomo.rodando ? "⏸ Pausar" : "▶ Iniciar";
    elToggle.classList.toggle("rodando", pomo.rodando);
    // Encerrar só faz sentido se o ciclo saiu do estado inicial (rodando, ou
    // parado no meio de um bloco, ou já na fase de pausa).
    const noInicio = !pomo.rodando && pomo.fase === "estudo"
      && pomo.restante === pomo.estudoMin * 60;
    elEncerrar.hidden = noInicio;
  }

  function aplicarConfig() {
    pomo.estudoMin = Math.max(1, Number(elEstudo.value) || 25);
    pomo.pausaMin = Math.max(1, Number(elPausa.value) || 5);
    if (!pomo.rodando) {
      pomo.restante = (pomo.fase === "estudo" ? pomo.estudoMin : pomo.pausaMin) * 60;
      pomo.gastoNaFase = 0;
      pinta();
    }
  }
  elEstudo.addEventListener("change", aplicarConfig);
  elPausa.addEventListener("change", aplicarConfig);

  // Salva o bloco atual no histórico. `completo`=true quando chegou a zero.
  // Só grava se houve pelo menos alguns segundos de tempo real.
  function salvarBloco(completo) {
    const seg = pomo.gastoNaFase;
    pomo.gastoNaFase = 0;
    if (seg < 3) return; // ignora blocos irrelevantes (cliques acidentais)
    registrarPomodoro({
      data: hojeISO(),
      fase: pomo.fase,
      segundos: seg,
      planejadoSeg: (pomo.fase === "estudo" ? pomo.estudoMin : pomo.pausaMin) * 60,
      completo,
    }).catch((e) => console.warn("Falha ao salvar pomodoro:", e));
  }

  function tick() {
    pomo.restante--;
    pomo.gastoNaFase++;
    if (pomo.restante <= 0) {
      const fim = pomo.fase;
      salvarBloco(true);          // bloco concluído
      avisar(fim);
      pomo.fase = fim === "estudo" ? "pausa" : "estudo";
      pomo.restante = (pomo.fase === "estudo" ? pomo.estudoMin : pomo.pausaMin) * 60;
    }
    pinta();
  }

  elToggle.addEventListener("click", () => {
    pomo.rodando = !pomo.rodando;
    if (pomo.rodando) {
      pomo.intervalo = setInterval(tick, 1000);
    } else {
      clearInterval(pomo.intervalo);
      salvarBloco(false);         // pausou no meio → registra o foco parcial
    }
    pinta();
  });
  elReset.addEventListener("click", () => {
    clearInterval(pomo.intervalo);
    if (pomo.rodando) salvarBloco(false); // encerrou rodando → registra parcial
    pomo.gastoNaFase = 0;
    pomo.rodando = false;
    pomo.fase = "estudo";
    pomo.restante = pomo.estudoMin * 60;
    pinta();
  });

  pinta();
}

// Aviso ao fim de cada fase: som + notificação (se permitida) + banner.
function avisar(faseQueAcabou) {
  const msg = faseQueAcabou === "estudo"
    ? "Fim do bloco de estudo! Hora da pausa."
    : "Fim da pausa! Bora voltar ao estudo.";
  try { bipe(); } catch (_) {}
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Foco — Pomodoro", { body: msg });
  }
  mostrarBanner(msg);
}

function bipe() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = "sine"; o.frequency.value = 880;
  g.gain.setValueAtTime(0.001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  o.start(); o.stop(ctx.currentTime + 0.6);
}

function mostrarBanner(msg) {
  let b = $("#pomo-banner");
  if (!b) {
    b = document.createElement("div");
    b.id = "pomo-banner";
    b.className = "pomo-banner";
    document.body.appendChild(b);
  }
  b.textContent = msg;
  b.classList.add("show");
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.remove("show"), 6000);
}

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}
initPomodoro();

/* ------------------------------ UTIL ------------------------------ */

function fmtTempo(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}`;
  if (m) return `${m}min${String(s).padStart(2, "0")}`;
  return `${s}s`;
}

function fmtRelogio(seg) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const DIAS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtData(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS_SEM[dt.getDay()]}, ${d} ${MESES[m - 1]}`;
}

// Versão curta "12/ago" para caber dentro do botão de voltar.
function fmtDataCurta(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}/${MESES[m - 1]}`;
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
