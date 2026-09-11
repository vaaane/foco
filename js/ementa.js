// ementa.js — checklist expansível da ementa do edital, com progresso salvo
// por usuário no Realtime Database (usuarios/$uid/ementa/$id = true).

import { ementaData } from "./ementa-data.js";
import { sair, aoMudarUsuario } from "./auth.js";
import { carregarEmenta, atualizarEmenta } from "./db.js";

const $ = (s) => document.querySelector(s);
const telaDeslogado = $("#tela-deslogado");
const telaEmenta = $("#tela-ementa");
const quemSou = $("#quem-sou");
const arvoreEl = $("#arvore-ementa");
const progPctEl = $("#prog-pct");
const progBarraEl = $("#prog-barra-interna");
const progLblEl = $("#prog-lbl");
const DOMINIO_LOGIN = "@foco.app";

let marcados = {}; // { id: true } — só folhas marcadas ficam aqui
const expandidos = new Set(); // ids de nós com filhos que estão abertos

$("#btn-sair").addEventListener("click", () => sair());

aoMudarUsuario(async (user) => {
  if (!user) { telaEmenta.hidden = true; telaDeslogado.hidden = false; return; }
  telaDeslogado.hidden = true; telaEmenta.hidden = false;
  quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
  try {
    marcados = await carregarEmenta();
  } catch (e) {
    console.warn("Falha ao ler ementa:", e);
    marcados = {};
  }
  render();
});

// ids das folhas (nós sem filhos) sob um nó.
function folhas(node) {
  if (!node.filhos || !node.filhos.length) return [node.id];
  return node.filhos.flatMap(folhas);
}

function render() {
  arvoreEl.innerHTML = ementaData.map((n) => renderNo(n, 0)).join("");
  arvoreEl.querySelectorAll('input[data-indeterminado="1"]').forEach((el) => {
    el.indeterminate = true;
  });
  renderProgressoGeral();
}

function renderNo(node, prof) {
  const temFilhos = Array.isArray(node.filhos) && node.filhos.length > 0;

  if (!temFilhos) {
    const marcado = !!marcados[node.id];
    return `
      <label class="em-item" style="--prof:${prof}">
        <input type="checkbox" data-leaf="${node.id}" ${marcado ? "checked" : ""} />
        <span class="em-titulo">${escapar(node.titulo)}</span>
      </label>`;
  }

  const ids = folhas(node);
  const total = ids.length;
  const feitos = ids.filter((id) => marcados[id]).length;
  const aberto = expandidos.has(node.id);
  const indeterminado = feitos > 0 && feitos < total;

  return `
    <div class="em-no">
      <div class="em-cabecalho" style="--prof:${prof}">
        <input type="checkbox" data-pai="${node.id}"
          ${feitos === total && total > 0 ? "checked" : ""}
          ${indeterminado ? 'data-indeterminado="1"' : ""} />
        <button type="button" class="em-toggle" data-expandir="${node.id}" aria-expanded="${aberto}">
          <svg class="em-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          <span class="em-titulo">${escapar(node.titulo)}</span>
        </button>
        <span class="em-contador">${feitos}/${total}</span>
      </div>
      <div class="em-filhos" ${aberto ? "" : "hidden"}>
        ${node.filhos.map((f) => renderNo(f, prof + 1)).join("")}
      </div>
    </div>`;
}

function renderProgressoGeral() {
  const todasFolhas = ementaData.flatMap(folhas);
  const total = todasFolhas.length;
  const feitos = todasFolhas.filter((id) => marcados[id]).length;
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  progPctEl.textContent = `${pct}%`;
  progBarraEl.style.width = `${pct}%`;
  progLblEl.textContent = `${feitos} de ${total} itens concluídos`;
}

arvoreEl.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-expandir]");
  if (!btn) return;
  const id = btn.dataset.expandir;
  if (expandidos.has(id)) expandidos.delete(id);
  else expandidos.add(id);
  render();
});

arvoreEl.addEventListener("change", async (ev) => {
  const alvo = ev.target;

  if (alvo.dataset.leaf) {
    const id = alvo.dataset.leaf;
    const campos = {};
    if (alvo.checked) { marcados[id] = true; campos[id] = true; }
    else { delete marcados[id]; campos[id] = null; }
    renderProgressoGeral();
    atualizarContadoresPais();
    try { await atualizarEmenta(campos); } catch (e) { console.warn("Falha ao salvar ementa:", e); }
    return;
  }

  if (alvo.dataset.pai) {
    const node = acharNo(ementaData, alvo.dataset.pai);
    if (!node) return;
    const ids = folhas(node);
    const campos = {};
    for (const id of ids) {
      if (alvo.checked) { marcados[id] = true; campos[id] = true; }
      else { delete marcados[id]; campos[id] = null; }
    }
    render();
    try { await atualizarEmenta(campos); } catch (e) { console.warn("Falha ao salvar ementa:", e); }
  }
});

function acharNo(lista, id) {
  for (const n of lista) {
    if (n.id === id) return n;
    if (n.filhos) {
      const achado = acharNo(n.filhos, id);
      if (achado) return achado;
    }
  }
  return null;
}

// Atualiza só os contadores/estado dos checkboxes-pai sem re-renderizar a
// árvore inteira (evita fechar o que já está expandido a cada clique numa folha).
function atualizarContadoresPais() {
  arvoreEl.querySelectorAll("[data-pai]").forEach((input) => {
    const node = acharNo(ementaData, input.dataset.pai);
    if (!node) return;
    const ids = folhas(node);
    const total = ids.length;
    const feitos = ids.filter((id) => marcados[id]).length;
    input.checked = feitos === total && total > 0;
    input.indeterminate = feitos > 0 && feitos < total;
    const contador = input.closest(".em-cabecalho").querySelector(".em-contador");
    if (contador) contador.textContent = `${feitos}/${total}`;
  });
}

function escapar(txt = "") {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}
