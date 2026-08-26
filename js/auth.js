// auth.js
// Autenticação com e-mail e senha. O login serve para escopar os dados por
// usuário (cada doc guarda o uid), então as regras do Firestore garantem que
// cada pessoa só vê os próprios dados.
//
// No Console do Firebase, habilite: Authentication > Sign-in method >
// E-mail/senha.

import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function entrar(email, senha) {
  return signInWithEmailAndPassword(auth, email, senha);
}

export function sair() {
  return signOut(auth);
}

// uid do usuário logado (ou null). Usado pelo db.js para carimbar os docs.
export function uidAtual() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

// Registra um callback chamado sempre que o estado de login muda.
export function aoMudarUsuario(callback) {
  return onAuthStateChanged(auth, callback);
}

// Traduz os códigos de erro do Firebase para mensagens legíveis.
export function traduzirErroAuth(err) {
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Digite a senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não há conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente de novo em instantes.",
  };
  return mapa[err?.code] || "Não foi possível continuar. Tente de novo.";
}
