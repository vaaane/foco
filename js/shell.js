// shell.js — comportamento do menu lateral no mobile.
// Independente do Firebase: só cuida de abrir/fechar o drawer.
// Carregado com "defer" em todas as páginas do app.
(function () {
  const app = document.querySelector(".app");
  if (!app) return;

  const hamb = document.getElementById("hamb");
  const overlay = document.getElementById("overlay");

  const fechar = () => app.classList.remove("menu-aberto");

  hamb?.addEventListener("click", () => app.classList.toggle("menu-aberto"));
  overlay?.addEventListener("click", fechar);

  // fecha o drawer ao clicar num link de navegação (mobile)
  document.querySelectorAll(".sb-nav a.sb-item").forEach((a) => {
    a.addEventListener("click", fechar);
  });
})();
