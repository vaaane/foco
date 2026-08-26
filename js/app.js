// app.js
// Liga a interface (index.html) às funções de dados (db.js) e de login (auth.js).
// Fluxo: entrar > listar concursos > selecionar um > listar/editar disciplinas.

import { entrar, sair, aoMudarUsuario, traduzirErroAuth } from "./auth.js";
import {
  criarConcurso,
  listarConcursos,
  atualizarConcurso,
  removerConcurso,
  criarDisciplina,
  listarDisciplinas,
  atualizarDisciplina,
  removerDisciplina,
} from "./db.js";

// Referências de elementos.
const $ = (sel) => document.querySelector(sel);
const telaLogin = $("#tela-login");
const telaApp = $("#tela-app");
const formLogin = $("#form-login");
const erroLogin = $("#erro-login");
const btnEntrar = $("#btn-entrar");
const btnSair = $("#btn-sair");
const quemSou = $("#quem-sou");

const listaConcursos = $("#lista-concursos");
const formConcurso = $("#form-concurso");
const painelDisciplinas = $("#painel-disciplinas");
const tituloDisciplinas = $("#titulo-disciplinas");
const listaDisciplinas = $("#lista-disciplinas");
const formDisciplina = $("#form-disciplina");

let concursoSelecionado = null; // { id, nome, ... }

// O login usa e-mail/senha do Firebase, mas o usuário só digita um "usuário".
// Completamos com um domínio fixo por baixo, então a conta criada no Console
// precisa ser <usuario>@foco.app (tudo minúsculo).
const DOMINIO_LOGIN = "@foco.app";

/* ------------------------------ LOGIN ------------------------------ */

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  esconderErro();
  const usuario = formLogin.usuario.value.trim().toLowerCase();
  const email = usuario.includes("@") ? usuario : usuario + DOMINIO_LOGIN;
  const senha = formLogin.senha.value;
  console.log("[LOGIN] tentando entrar com:", email, "| senha vazia?", senha === "");
  btnEntrar.disabled = true;
  try {
    const cred = await entrar(email, senha);
    console.log("[LOGIN] SUCESSO:", cred.user.email, cred.user.uid);
  } catch (err) {
    console.log("[LOGIN] ERRO:", err.code, err.message);
    mostrarErroLogin(traduzirErroAuth(err));
  } finally {
    btnEntrar.disabled = false;
  }
});

btnSair.addEventListener("click", () => sair());

aoMudarUsuario((user) => {
  console.log("[AUTH] estado mudou. Usuário:", user ? user.email : "nenhum");
  if (user) {
    telaLogin.hidden = true;
    telaApp.hidden = false;
    // Mostra só o usuário, sem o domínio interno.
    quemSou.textContent = (user.email || "").replace(DOMINIO_LOGIN, "") || "conectado";
    formLogin.reset();
    esconderErro();
    carregarConcursos();
  } else {
    telaApp.hidden = true;
    telaLogin.hidden = false;
    concursoSelecionado = null;
  }
});

function mostrarErroLogin(msg) {
  erroLogin.textContent = msg;
  erroLogin.hidden = false;
}
function esconderErro() {
  erroLogin.hidden = true;
}

/* ---------------------------- CONCURSOS ---------------------------- */

formConcurso.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = {
    nome: formConcurso.nome.value.trim(),
    banca: formConcurso.banca.value.trim(),
    dataProva: formConcurso.dataProva.value,
    horasPorDia: formConcurso.horasPorDia.value,
  };
  if (!dados.nome) return;
  try {
    await criarConcurso(dados);
    formConcurso.reset();
    carregarConcursos();
  } catch (err) {
    mostrarErro(err);
  }
});

async function carregarConcursos() {
  const itens = await listarConcursos();
  listaConcursos.innerHTML = "";
  if (itens.length === 0) {
    listaConcursos.innerHTML = `<li class="vazio">Nenhum concurso ainda. Cadastre o primeiro acima.</li>`;
    return;
  }
  for (const c of itens) {
    const li = document.createElement("li");
    li.className = "card-item" + (concursoSelecionado?.id === c.id ? " ativo" : "");
    li.innerHTML = `
      <button class="item-abrir" data-id="${c.id}">
        <span class="item-nome">${escapar(c.nome)}</span>
        <span class="item-meta">${[c.banca, contagem(c.dataProva)].filter(Boolean).join(" · ")}</span>
      </button>
      <div class="item-acoes">
        <button class="mini" data-editar="${c.id}">Editar</button>
        <button class="mini perigo" data-remover="${c.id}">Excluir</button>
      </div>`;
    li.querySelector(".item-abrir").addEventListener("click", () => selecionarConcurso(c));
    li.querySelector("[data-editar]").addEventListener("click", () => editarConcurso(c));
    li.querySelector("[data-remover]").addEventListener("click", () => excluirConcurso(c));
    listaConcursos.appendChild(li);
  }
}

async function editarConcurso(c) {
  const nome = prompt("Nome do concurso:", c.nome);
  if (nome === null) return;
  await atualizarConcurso(c.id, { nome: nome.trim() || c.nome });
  if (concursoSelecionado?.id === c.id) concursoSelecionado.nome = nome.trim();
  carregarConcursos();
  atualizarTituloDisciplinas();
}

async function excluirConcurso(c) {
  if (!confirm(`Excluir "${c.nome}" e todas as suas disciplinas?`)) return;
  await removerConcurso(c.id);
  if (concursoSelecionado?.id === c.id) {
    concursoSelecionado = null;
    painelDisciplinas.hidden = true;
  }
  carregarConcursos();
}

/* --------------------------- DISCIPLINAS --------------------------- */

async function selecionarConcurso(c) {
  concursoSelecionado = c;
  painelDisciplinas.hidden = false;
  atualizarTituloDisciplinas();
  carregarConcursos(); // re-render para marcar o ativo
  carregarDisciplinas();
}

function atualizarTituloDisciplinas() {
  tituloDisciplinas.textContent = concursoSelecionado
    ? `Disciplinas — ${concursoSelecionado.nome}`
    : "Disciplinas";
}

formDisciplina.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!concursoSelecionado) return;
  const dados = {
    nome: formDisciplina.nome.value.trim(),
    peso: formDisciplina.peso.value,
  };
  if (!dados.nome) return;
  await criarDisciplina(concursoSelecionado.id, dados);
  formDisciplina.reset();
  carregarDisciplinas();
});

async function carregarDisciplinas() {
  const itens = await listarDisciplinas(concursoSelecionado.id);
  listaDisciplinas.innerHTML = "";
  if (itens.length === 0) {
    listaDisciplinas.innerHTML = `<li class="vazio">Sem disciplinas. Adicione uma ao lado.</li>`;
    return;
  }
  for (const d of itens) {
    const li = document.createElement("li");
    li.className = "card-item";
    li.innerHTML = `
      <div class="item-abrir estatico">
        <span class="item-nome">${escapar(d.nome)}</span>
        <span class="item-meta">peso ${d.peso}</span>
      </div>
      <div class="item-acoes">
        <button class="mini" data-editar="${d.id}">Editar</button>
        <button class="mini perigo" data-remover="${d.id}">Excluir</button>
      </div>`;
    li.querySelector("[data-editar]").addEventListener("click", () => editarDisciplina(d));
    li.querySelector("[data-remover]").addEventListener("click", () => excluirDisciplina(d));
    listaDisciplinas.appendChild(li);
  }
}

async function editarDisciplina(d) {
  const nome = prompt("Nome da disciplina:", d.nome);
  if (nome === null) return;
  const peso = prompt("Peso (nº de questões na prova):", d.peso);
  await atualizarDisciplina(d.id, {
    nome: nome.trim() || d.nome,
    peso: peso === null ? d.peso : peso,
  });
  carregarDisciplinas();
}

async function excluirDisciplina(d) {
  if (!confirm(`Excluir a disciplina "${d.nome}"?`)) return;
  await removerDisciplina(d.id);
  carregarDisciplinas();
}

/* ------------------------------ UTIL ------------------------------ */

// Evita HTML injetado via nomes.
function escapar(txt = "") {
  const div = document.createElement("div");
  div.textContent = txt;
  return div.innerHTML;
}

// "faltam X dias" a partir da data da prova (string AAAA-MM-DD).
function contagem(dataProva) {
  if (!dataProva) return "";
  const dias = Math.ceil((new Date(dataProva) - new Date()) / 86400000);
  if (isNaN(dias)) return "";
  if (dias < 0) return "prova passou";
  if (dias === 0) return "prova é hoje";
  return `faltam ${dias} dias`;
}

function mostrarErro(err) {
  console.error(err);
  alert("Algo deu errado: " + (err?.message || err));
}
