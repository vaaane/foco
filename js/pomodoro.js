// pomodoro.js — análise do histórico de blocos de foco.
// Mostra: total de foco (estudo), nº de blocos, taxa de conclusão, e a
// distribuição por dia (barras) com estudo x pausa e blocos interrompidos.

import { sair, aoMudarUsuario } from "./auth.js";
import { listarPomodoros, listarItens } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaPomo = $("#tela-pomo");
const quemSou = $("#quem-sou");
const resumo = $("#resumo-pomo");
const cartoesEl = $("#cartoes");
const porDiaEl = $("#por-dia");
const tempoRealEl = $("#tempo-real");
const DOMINIO_LOGIN = "@foco.app";

let registros = [];
let itens = [];

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaPomo.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaPomo.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  try {
    registros = await listarPomodoros();
  } catch (e) {
    console.warn("Falha ao ler pomodoros:", e);
    registros = [];
    resumo.textContent = "Não foi possível carregar. Verifique se as regras do banco foram publicadas.";
  }
  try { itens = await listarItens(); } catch { itens = []; }
  render();
});

function render() {
  const estudo = registros.filter((r) => r.fase === "estudo");
  const focoSeg = estudo.reduce((s, r) => s + (r.segundos || 0), 0);
  const completos = estudo.filter((r) => r.completo).length;
  const interrompidos = estudo.length - completos;
  const taxa = estudo.length ? Math.round((completos / estudo.length) * 100) : 0;

  if (!registros.length) {
    resumo.textContent = "Nenhum bloco de foco registrado ainda. Use o Pomodoro no calendário.";
    cartoesEl.innerHTML = "";
    porDiaEl.innerHTML = `<p class="vazio">Assim que você rodar o Pomodoro, a análise aparece aqui.</p>`;
    return;
  }

  resumo.textContent =
    `${fmtTempo(focoSeg)} de foco em ${estudo.length} bloco(s) · ${completos} completos · ${interrompidos} interrompidos`;

  cartoesEl.innerHTML = `
    <div class="pomo-cartao"><b class="bom">${fmtTempo(focoSeg)}</b><span>foco total</span></div>
    <div class="pomo-cartao"><b>${estudo.length}</b><span>blocos de estudo</span></div>
    <div class="pomo-cartao"><b class="${taxa >= 70 ? "bom" : taxa >= 40 ? "med" : "ruim"}">${taxa}%</b><span>concluídos</span></div>
    <div class="pomo-cartao"><b>${fmtTempo(mediaPorDia(estudo))}</b><span>média / dia ativo</span></div>`;

  // agrupa por dia
  const dias = {};
  for (const r of estudo) {
    const d = r.data || "sem";
    (dias[d] ||= { foco: 0, blocos: 0, completos: 0 });
    dias[d].foco += r.segundos || 0;
    dias[d].blocos++;
    if (r.completo) dias[d].completos++;
  }
  const chaves = Object.keys(dias).sort((a, b) => (a < b ? 1 : -1)); // recente 1º
  const maxFoco = Math.max(...chaves.map((d) => dias[d].foco), 1);

  porDiaEl.innerHTML = `
    <h3 class="sub-secao">Foco por dia</h3>
    <div class="pomo-barras">
      ${chaves.map((d) => {
        const info = dias[d];
        const pct = Math.round((info.foco / maxFoco) * 100);
        return `
          <div class="pd-linha">
            <span class="pd-data">${d === "sem" ? "sem data" : fmtData(d)}</span>
            <div class="pd-barra"><span style="width:${pct}%"></span></div>
            <span class="pd-val">${fmtTempo(info.foco)} · ${info.blocos} bl · ${info.completos}✓</span>
          </div>`;
      }).join("")}
    </div>`;

  renderTempoReal();
}

// Painel "Tempo real por dia": soma o cronômetro dos itens (pela data do item)
// com o foco do pomodoro (pela data do bloco).
function renderTempoReal() {
  if (!tempoRealEl) return;
  const dias = {};
  // cronômetro dos itens
  for (const it of itens) {
    const seg = it.tempoGasto || 0;
    if (seg <= 0) continue;
    const d = it.data || "sem";
    (dias[d] ||= { crono: 0, foco: 0 }).crono += seg;
  }
  // foco do pomodoro (só estudo)
  for (const r of registros) {
    if (r.fase !== "estudo") continue;
    const d = r.data || "sem";
    (dias[d] ||= { crono: 0, foco: 0 }).foco += r.segundos || 0;
  }
  const chaves = Object.keys(dias).sort((a, b) => (a < b ? 1 : -1));
  if (!chaves.length) {
    tempoRealEl.innerHTML = `<h3 class="sub-secao">Tempo real por dia</h3>
      <p class="vazio">Use o cronômetro (▶) nos itens ou o Pomodoro para ver seu tempo real aqui.</p>`;
    return;
  }
  const maxTotal = Math.max(...chaves.map((d) => dias[d].crono + dias[d].foco), 1);
  tempoRealEl.innerHTML = `
    <h3 class="sub-secao">Tempo real por dia <small style="color:var(--muted);font-weight:400">(cronômetro dos itens + foco do pomodoro)</small></h3>
    <div class="tr-barras">
      ${chaves.map((d) => {
        const info = dias[d];
        const total = info.crono + info.foco;
        const pctC = Math.round((info.crono / maxTotal) * 100);
        const pctF = Math.round((info.foco / maxTotal) * 100);
        return `
          <div class="tr-linha">
            <span class="tr-data">${d === "sem" ? "sem data" : fmtData(d)}</span>
            <div class="tr-barra">
              <span class="tr-crono" style="width:${pctC}%" title="Cronômetro dos itens"></span>
              <span class="tr-foco" style="width:${pctF}%" title="Foco do pomodoro"></span>
            </div>
            <span class="tr-val">${fmtTempo(total)}</span>
          </div>`;
      }).join("")}
    </div>
    <div class="tr-legenda">
      <span><i class="tr-crono"></i> cronômetro dos itens</span>
      <span><i class="tr-foco"></i> foco do pomodoro</span>
    </div>`;
}

function mediaPorDia(estudo) {
  const dias = new Set(estudo.map((r) => r.data));
  const total = estudo.reduce((s, r) => s + (r.segundos || 0), 0);
  return dias.size ? Math.round(total / dias.size) : 0;
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
