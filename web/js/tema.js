// Aplica el modo claro/oscuro guardado antes de pintar la página (evita un parpadeo).
// Se carga en el <head> de cada página, sin "type=module".
(function () {
  try {
    var t = localStorage.getItem("aragon-tema");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* Navegador sin almacenamiento: se usa el modo del sistema. */ }
})();
