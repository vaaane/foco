// firebase-config.js
// Inicialização do Firebase (SDK modular v10, via CDN) com Realtime Database.
// Passo 1: cole aqui a config do SEU projeto (Console do Firebase >
// Configurações do projeto > Seus apps > SDK do Firebase > Config).
// Importante: o Realtime Database exige o campo databaseURL.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// TODO: substituir pelos valores do seu projeto.

const firebaseConfig = {
  apiKey: "AIzaSyB4O2V3-VpJUIAGmyUGeAsDif6O436BGCU",
  authDomain: "sistemaconcurso.firebaseapp.com",
  databaseURL: "https://sistemaconcurso-default-rtdb.firebaseio.com",
  projectId: "sistemaconcurso",
  storageBucket: "sistemaconcurso.firebasestorage.app",
  messagingSenderId: "424575080830",
  appId: "1:424575080830:web:18a3467c13245a6f03bb2f"
};


const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
export const auth = getAuth(app);
