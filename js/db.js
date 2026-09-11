// db.js
// Módulo central de dados sobre o Realtime Database (mesmo banco do quiz e do
// Diário de Bordo). As funções e o formato de retorno { id, ...dados } são os
// mesmos da versão anterior, então o app.js não muda.
//
// Estrutura no banco (uma "coleção" por tipo, agrupada por uid):
//   concursos/{uid}/{id}   = { nome, banca, dataProva, horasPorDia, criadoEm }
//   disciplinas/{uid}/{id} = { concursoId, nome, peso, criadoEm }
//   pdfs/{uid}/{id}        = passo 3
//   sessoes/{uid}/{id}     = passo 5
//   revisoes/{uid}/{id}    = passo 6
// Agrupar por uid deixa as regras simples (auth.uid === $uid) e evita o
// aninhamento profundo que faria uma leitura puxar dados demais.

import { db } from "./firebase-config.js";
import { uidAtual } from "./auth.js";
import {
  ref,
  push,
  set,
  update,
  remove,
  get,
  query,
  orderByChild,
  equalTo,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Nomes das coleções — referência única, evita string solta pelo código.
export const COL = {
  concursos: "concursos",
  disciplinas: "disciplinas",
  itens: "itens", // itens do calendário (videoaula/pdf/revisão/simulado)
  pdfs: "pdfs", // passo 3
  sessoes: "sessoes", // passo 5
  revisoes: "revisoes", // passo 6
  atividades: "atividades", // questões do QConcursos por matéria (registros soltos, legado)
  cadernos: "cadernos", // conjuntos de questões nomeados, com tentativas (refeitos)
  pomodoros: "pomodoros", // histórico de blocos de foco (pomodoro)
};

// Converte um snapshot do Realtime em array de objetos { id, ...dados }.
function paraLista(snap) {
  const val = snap.val();
  if (!val) return [];
  return Object.entries(val).map(([id, dados]) => ({ id, ...dados }));
}

// Garante que há usuário logado antes de qualquer operação.
function exigirLogin() {
  const uid = uidAtual();
  if (!uid) throw new Error("Nenhum usuário logado.");
  return uid;
}

// Caminho base de uma coleção para o usuário atual (ex.: "concursos/UID").
function base(colecao, uid) {
  return `${colecao}/${uid}`;
}

/* ----------------------------- CONCURSOS ----------------------------- */

export async function criarConcurso({ nome, banca = "", dataProva = "", horasPorDia = 0 }) {
  const uid = exigirLogin();
  const novo = push(ref(db, base(COL.concursos, uid)));
  await set(novo, {
    nome,
    banca,
    dataProva, // string "AAAA-MM-DD" (input type=date)
    horasPorDia: Number(horasPorDia) || 0,
    criadoEm: serverTimestamp(),
  });
  return novo.key;
}

export async function listarConcursos() {
  const uid = exigirLogin();
  const snap = await get(ref(db, base(COL.concursos, uid)));
  const lista = paraLista(snap);
  lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0)); // mais novos primeiro
  return lista;
}

export async function atualizarConcurso(id, campos) {
  const uid = exigirLogin();
  if (campos.horasPorDia !== undefined) campos.horasPorDia = Number(campos.horasPorDia) || 0;
  await update(ref(db, `${base(COL.concursos, uid)}/${id}`), campos);
}

// Remove o concurso e as disciplinas filhas numa única escrita atômica.
export async function removerConcurso(id) {
  const uid = exigirLogin();
  const q = query(ref(db, base(COL.disciplinas, uid)), orderByChild("concursoId"), equalTo(id));
  const filhas = (await get(q)).val() || {};

  const updates = {};
  for (const did of Object.keys(filhas)) {
    updates[`${base(COL.disciplinas, uid)}/${did}`] = null;
  }
  updates[`${base(COL.concursos, uid)}/${id}`] = null;
  await update(ref(db), updates);
}

/* ---------------------------- DISCIPLINAS ---------------------------- */

export async function criarDisciplina(concursoId, { nome, peso = 0 }) {
  const uid = exigirLogin();
  const novo = push(ref(db, base(COL.disciplinas, uid)));
  await set(novo, {
    concursoId,
    nome,
    peso: Number(peso) || 0, // nº de questões na prova = prioridade no cronograma
    criadoEm: serverTimestamp(),
  });
  return novo.key;
}

export async function listarDisciplinas(concursoId) {
  const uid = exigirLogin();
  const q = query(ref(db, base(COL.disciplinas, uid)), orderByChild("concursoId"), equalTo(concursoId));
  const lista = paraLista(await get(q));
  lista.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0)); // ordem de cadastro
  return lista;
}

export async function atualizarDisciplina(id, campos) {
  const uid = exigirLogin();
  if (campos.peso !== undefined) campos.peso = Number(campos.peso) || 0;
  await update(ref(db, `${base(COL.disciplinas, uid)}/${id}`), campos);
}

export async function removerDisciplina(id) {
  const uid = exigirLogin();
  await remove(ref(db, `${base(COL.disciplinas, uid)}/${id}`));
}

/* ------------------------------ ITENS ------------------------------ */
// Itens do calendário: videoaula, pdf, revisão, simulado. Cada um tem
// data (AAAA-MM-DD), disciplina, título, duração prevista e o tempo real gasto.

// Já existe plano carregado para este usuário?
export async function planoJaCarregado() {
  const uid = exigirLogin();
  const snap = await get(ref(db, base(COL.itens, uid)));
  return snap.exists();
}

// Importa o plano (array vindo de plano.js) numa escrita só. Não duplica:
// se já houver itens, não faz nada e devolve false.
export async function importarPlano(plano) {
  const uid = exigirLogin();
  const snap = await get(ref(db, base(COL.itens, uid)));
  if (snap.exists()) return false;
  const updates = {};
  plano.forEach((it, i) => {
    const novo = push(ref(db, base(COL.itens, uid)));
    updates[`${base(COL.itens, uid)}/${novo.key}`] = {
      data: it.d,
      tipo: it.t,
      disciplina: it.m,
      titulo: it.n,
      duracaoMin: it.min || 0,
      paginas: it.pag || 0, // nº de páginas (PDFs)
      topico: it.top || 0, // nº do tópico no Gran (localização)
      professor: it.prof || "", // professor da aula (localização)
      status: "afazer", // afazer | feito | pulado
      motivoPulo: "", // naoImportante | jaSabia (quando status = pulado)
      precisaRevisao: false,
      tempoGasto: 0, // segundos cronometrados
      ordem: i,
      dataOriginal: it.d, // para "voltar à posição inicial"
      ordemOriginal: i,
      manual: false, // itens do plano; os criados pelo usuário serão true
      categoria: "estudo", // estudo | revisao (revisão espaçada gerada de um item)
      corFundo: "", // cor de fundo escolhida (revisões); "" = padrão
      origemId: "", // id do item que originou a revisão
      origemData: "", // data do item de origem
      origemTitulo: "", // título do item de origem (para exibir "veio de …")
    };
  });
  await update(ref(db), updates);
  return true;
}

export async function listarItens() {
  const uid = exigirLogin();
  const lista = paraLista(await get(ref(db, base(COL.itens, uid))));
  lista.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return lista;
}

export async function atualizarItem(id, campos) {
  const uid = exigirLogin();
  await update(ref(db, `${base(COL.itens, uid)}/${id}`), campos);
}

// Cria um item avulso (tópico adicionado pelo usuário) num dia.
export async function criarItem(dados) {
  const uid = exigirLogin();
  const novo = push(ref(db, base(COL.itens, uid)));
  await set(novo, {
    data: dados.data,
    tipo: dados.tipo || "video",
    disciplina: dados.disciplina || "",
    titulo: dados.titulo,
    duracaoMin: Number(dados.duracaoMin) || 0,
    status: "afazer",
    motivoPulo: "",
    precisaRevisao: false,
    tempoGasto: 0,
    ordem: dados.ordem ?? Date.now(),
    dataOriginal: dados.data,
    ordemOriginal: dados.ordem ?? Date.now(),
    manual: true,
    categoria: dados.categoria || "estudo",
    corFundo: dados.corFundo || "",
    origemId: dados.origemId || "",
    origemData: dados.origemData || "",
    origemTitulo: dados.origemTitulo || "",
  });
  return novo.key;
}

// Cria uma revisão espaçada a partir de um item, deslocada em `offsetDias`
// (+1/+7/+15/+30). A revisão fica vinculada ao item de origem e pode ter uma
// cor de fundo escolhida pelo usuário.
export async function criarRevisao(itemOrigem, offsetDias, corFundo = "") {
  const data = somarDias(itemOrigem.data, offsetDias);
  const uid = exigirLogin();
  // ordem: entra no fim do dia de destino
  const novo = push(ref(db, base(COL.itens, uid)));
  await set(novo, {
    data,
    tipo: "revisao",
    disciplina: itemOrigem.disciplina || "",
    titulo: `Revisão (+${offsetDias}d) — ${itemOrigem.titulo}`,
    duracaoMin: 0,
    status: "afazer",
    motivoPulo: "",
    precisaRevisao: false,
    tempoGasto: 0,
    ordem: Date.now(),
    dataOriginal: data,
    ordemOriginal: Date.now(),
    manual: true,
    categoria: "revisao",
    corFundo: corFundo || "",
    origemId: itemOrigem.id || "",
    origemData: itemOrigem.data || "",
    origemTitulo: itemOrigem.titulo || "",
  });
  return novo.key;
}

// Reordena/move itens numa única escrita atômica. `mudancas` = array de
// { id, ordem, data } — só os itens que mudaram de lugar.
export async function reordenarItens(mudancas) {
  const uid = exigirLogin();
  const updates = {};
  for (const m of mudancas) {
    updates[`${base(COL.itens, uid)}/${m.id}/ordem`] = m.ordem;
    updates[`${base(COL.itens, uid)}/${m.id}/data`] = m.data;
  }
  await update(ref(db), updates);
}

// Volta um item para o dia e a posição em que nasceu.
export async function voltarPosicaoInicial(id, dataOriginal, ordemOriginal) {
  const uid = exigirLogin();
  await update(ref(db, `${base(COL.itens, uid)}/${id}`), {
    data: dataOriginal,
    ordem: ordemOriginal,
  });
}

// Soma dias a uma data ISO "AAAA-MM-DD" e devolve outra data ISO.
function somarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export async function removerItem(id) {
  const uid = exigirLogin();
  await remove(ref(db, `${base(COL.itens, uid)}/${id}`));
}

// Remove várias revisões de uma vez (usado ao apagar toda a "família" de
// revisões geradas do mesmo item de origem). `ids` = array de ids.
export async function removerItens(ids = []) {
  if (!ids.length) return;
  const uid = exigirLogin();
  const updates = {};
  for (const id of ids) updates[`${base(COL.itens, uid)}/${id}`] = null;
  await update(ref(db), updates);
}

// Apaga todos os itens do usuário (para recarregar o plano do zero).
export async function limparItens() {
  const uid = exigirLogin();
  await remove(ref(db, base(COL.itens, uid)));
}

/* ---------------------------- ATIVIDADES ---------------------------- */
// Registro de questões resolvidas (ex.: QConcursos): por matéria, quantidade,
// tempo gasto e acertos/erros. Uma entrada por sessão de questões.
//   atividades/{uid}/{id} = { data, disciplina, total, acertos, erros,
//                             tempoMin, fonte, obs, criadoEm }

export async function criarAtividade(dados) {
  const uid = exigirLogin();
  const total = Number(dados.total) || 0;
  const acertos = Number(dados.acertos) || 0;
  const erros = dados.erros != null ? Number(dados.erros) || 0 : Math.max(0, total - acertos);
  const novo = push(ref(db, base(COL.atividades, uid)));
  await set(novo, {
    data: dados.data,
    disciplina: dados.disciplina || "",
    total,
    acertos,
    erros,
    tempoMin: Number(dados.tempoMin) || 0,
    fonte: dados.fonte || "QConcursos",
    topicos: Array.isArray(dados.topicos) ? dados.topicos : [],
    obs: dados.obs || "",
    criadoEm: serverTimestamp(),
  });
  return novo.key;
}

export async function listarAtividades() {
  const uid = exigirLogin();
  const lista = paraLista(await get(ref(db, base(COL.atividades, uid))));
  lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (b.criadoEm || 0) - (a.criadoEm || 0)));
  return lista;
}

export async function atualizarAtividade(id, campos) {
  const uid = exigirLogin();
  ["total", "acertos", "erros", "tempoMin"].forEach((k) => {
    if (campos[k] !== undefined) campos[k] = Number(campos[k]) || 0;
  });
  await update(ref(db, `${base(COL.atividades, uid)}/${id}`), campos);
}

export async function removerAtividade(id) {
  const uid = exigirLogin();
  await remove(ref(db, `${base(COL.atividades, uid)}/${id}`));
}

/* ===================== CADERNOS (conjuntos de questões) ===================== */
// Estrutura:
//   cadernos/{uid}/{id} = {
//     nome, disciplina, topicos: [],
//     tentativas: [ { data, total, acertos, tempoMin }, ... ],  // 1ª = criação
//     criadoEm
//   }

function tentativaLimpa(t = {}) {
  const total = Number(t.total) || 0;
  const acertos = Math.min(total, Number(t.acertos) || 0);
  return {
    data: t.data || "",
    total,
    acertos,
    tempoMin: Number(t.tempoMin) || 0,
  };
}

// Cria um caderno com a primeira tentativa.
export async function criarCaderno(dados) {
  const uid = exigirLogin();
  const novo = push(ref(db, base(COL.cadernos, uid)));
  await set(novo, {
    nome: (dados.nome || "").trim() || "Caderno sem nome",
    disciplina: dados.disciplina || "",
    topicos: Array.isArray(dados.topicos) ? dados.topicos : [],
    tentativas: [tentativaLimpa(dados.primeira)],
    criadoEm: serverTimestamp(),
  });
  return novo.key;
}

export async function listarCadernos() {
  const uid = exigirLogin();
  const lista = paraLista(await get(ref(db, base(COL.cadernos, uid))));
  // garante que tentativas seja sempre array
  for (const c of lista) if (!Array.isArray(c.tentativas)) c.tentativas = [];
  lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return lista;
}

// Adiciona uma nova tentativa (refeito) ao caderno.
export async function adicionarTentativa(id, tentativa) {
  const uid = exigirLogin();
  const caminho = `${base(COL.cadernos, uid)}/${id}`;
  const snap = await get(ref(db, caminho));
  const atual = snap.val();
  if (!atual) throw new Error("Caderno não encontrado");
  const tentativas = Array.isArray(atual.tentativas) ? atual.tentativas : [];
  tentativas.push(tentativaLimpa(tentativa));
  await update(ref(db, caminho), { tentativas });
  return tentativas.length;
}

// Remove uma tentativa pelo índice (não deixa o caderno sem nenhuma).
export async function removerTentativa(id, indice) {
  const uid = exigirLogin();
  const caminho = `${base(COL.cadernos, uid)}/${id}`;
  const snap = await get(ref(db, caminho));
  const atual = snap.val();
  if (!atual) return;
  const tentativas = Array.isArray(atual.tentativas) ? atual.tentativas : [];
  if (indice < 0 || indice >= tentativas.length || tentativas.length <= 1) return;
  tentativas.splice(indice, 1);
  await update(ref(db, caminho), { tentativas });
}

export async function atualizarCaderno(id, campos) {
  const uid = exigirLogin();
  await update(ref(db, `${base(COL.cadernos, uid)}/${id}`), campos);
}

export async function removerCaderno(id) {
  const uid = exigirLogin();
  await remove(ref(db, `${base(COL.cadernos, uid)}/${id}`));
}

/* ===================== POMODORO — HISTÓRICO ===================== */

// Registra um bloco de foco (estudo ou pausa). `segundos` = tempo real gasto no
// bloco; `completo` = true se chegou ao fim, false se foi interrompido no meio.
export async function registrarPomodoro(dados) {
  const uid = exigirLogin();
  const novo = push(ref(db, base(COL.pomodoros, uid)));
  await set(novo, {
    data: dados.data,                         // YYYY-MM-DD
    fase: dados.fase || "estudo",             // estudo | pausa
    segundos: Math.max(0, Math.round(dados.segundos) || 0),
    planejadoSeg: Math.max(0, Math.round(dados.planejadoSeg) || 0),
    completo: !!dados.completo,               // true = terminou, false = interrompido
    criadoEm: serverTimestamp(),
  });
  return novo.key;
}

export async function listarPomodoros() {
  const uid = exigirLogin();
  const lista = paraLista(await get(ref(db, base(COL.pomodoros, uid))));
  lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : (b.criadoEm || 0) - (a.criadoEm || 0)));
  return lista;
}

/* ===================== EMENTA (checklist do edital) ===================== */
// usuarios/{uid}/ementa/{id} = true — cada item marcado como concluído.
// Fora do padrão "coleção/uid" acima porque não é uma lista de registros,
// e sim um mapa direto id → true (a árvore em si vem de ementa-data.js).

export async function carregarEmenta() {
  const uid = exigirLogin();
  const snap = await get(ref(db, `usuarios/${uid}/ementa`));
  return snap.val() || {};
}

// `campos` = { id: true (marca) | null (desmarca), ... } — uma escrita só,
// então marcar um nó pai e todos os filhos de uma vez fica atômico.
export async function atualizarEmenta(campos) {
  const uid = exigirLogin();
  await update(ref(db, `usuarios/${uid}/ementa`), campos);
}

/* ===================== BANCOS DE QUESTÕES — TENTATIVAS ===================== */
// Cada vez que o usuário responde um banco inteiro, guardamos uma tentativa
// com a data de conclusão, a nota e TODAS as respostas dadas (para revisar
// depois quais errou e comparar o rendimento entre tentativas).
//
//   respostasBanco/{uid}/{bancoId}/{tentativaId} = {
//     concluidoEm,               // timestamp do servidor
//     data,                      // "AAAA-MM-DD" (dia da conclusão)
//     total, acertos, tempoMin,  // nota geral
//     respostas: { "1": "C", "2": "B", ... }  // numero da questão -> valor marcado
//   }
// bancoId é o id do banco (ex.: "aula-00-fundamentos-tendencias"), então cada
// banco tem seu próprio histórico de tentativas.

export async function salvarTentativaBanco(bancoId, dados) {
  const uid = exigirLogin();
  const novo = push(ref(db, `respostasBanco/${uid}/${bancoId}`));
  await set(novo, {
    concluidoEm: serverTimestamp(),
    data: dados.data || new Date().toISOString().slice(0, 10),
    total: Number(dados.total) || 0,
    acertos: Number(dados.acertos) || 0,
    tempoMin: Number(dados.tempoMin) || 0,
    respostas: dados.respostas && typeof dados.respostas === "object" ? dados.respostas : {},
  });
  return novo.key;
}

// Todas as tentativas de um banco, da mais antiga para a mais recente
// (ordem cronológica facilita o gráfico de evolução).
export async function listarTentativasBanco(bancoId) {
  const uid = exigirLogin();
  const snap = await get(ref(db, `respostasBanco/${uid}/${bancoId}`));
  const lista = paraLista(snap);
  lista.sort((a, b) => (a.concluidoEm || 0) - (b.concluidoEm || 0));
  return lista;
}
