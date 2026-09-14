// planos.js
// Roteador de planos por usuário. Cada pessoa estuda para um concurso diferente,
// então o plano importado depende de quem está logado.
//
// O login do app é sempre <usuario>@foco.app (ver DOMINIO_LOGIN). Aqui mapeamos
// pelo <usuario> (a parte antes do @), em minúsculas.
//
// Para adicionar um novo usuário:
//   1. crie um arquivo js/plano-<nome>.js exportando `export const PLANO_<NOME> = [...]`;
//   2. importe-o aqui;
//   3. adicione uma linha em PLANOS_POR_USUARIO.

import { PLANO_EDUARDO } from "./plano-eduardo.js";
import { PLANO_VANESSA } from "./plano-vanessa.js";

// usuario (antes do @foco.app, minúsculo) -> plano
const PLANOS_POR_USUARIO = {
  eduardo: PLANO_EDUARDO,
  vanessa: PLANO_VANESSA,
};

// usuario -> data da prova (ISO "AAAA-MM-DD"). Enquanto não sai o edital, use
// uma data de referência (ex.: fim da preparação).
const DATA_PROVA_POR_USUARIO = {
  eduardo: "2026-10-11",
  vanessa: "2026-12-19", // referência: fim do plano de 90 dias
};

// data de prova usada quando o usuário não está no mapa acima.
const DATA_PROVA_PADRAO = "";

// Plano usado quando o usuário logado não está no mapa acima.
// Deixe null para NÃO importar nada (recomendado: evita dar o plano errado a
// alguém). Ou aponte para um plano padrão, ex.: PLANO_EDUARDO.
const PLANO_PADRAO = null;

// Extrai o "usuario" de um e-mail tipo "vanessa@foco.app" -> "vanessa".
function usuarioDoEmail(email) {
  return String(email || "").toLowerCase().split("@")[0].trim();
}

// Retorna o plano do usuário logado (array de itens) ou null se não houver.
export function planoDoUsuario(user) {
  const nome = usuarioDoEmail(user?.email);
  return PLANOS_POR_USUARIO[nome] || PLANO_PADRAO;
}

// Só para exibir na tela (ex.: "Carregar plano de Vanessa").
export function nomeDoUsuario(user) {
  const nome = usuarioDoEmail(user?.email);
  return nome ? nome.charAt(0).toUpperCase() + nome.slice(1) : "usuário";
}

// Retorna a data da prova (ISO) do usuário logado, ou "" se não houver.
export function dataProvaDoUsuario(user) {
  const nome = usuarioDoEmail(user?.email);
  return DATA_PROVA_POR_USUARIO[nome] || DATA_PROVA_PADRAO;
}
