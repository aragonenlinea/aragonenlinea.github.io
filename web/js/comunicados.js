// Página de comunicados (comunicados.html). Los datos están en datos/comunicados.json.
import { montarPagina, cargar, esc, fecha, recientesPrimero, enlaceSeguro, avisoError, irAlAncla } from "./comun.js";

const caja = document.getElementById("comunicados");
let todos = [];
let filtro = "";

function pintar() {
  const cats = [...new Set(todos.map(c => c.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const lista = todos.filter(c => !filtro || c.categoria === filtro);
  caja.innerHTML = `
    ${cats.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por categoría">
      ${["", ...cats].map(c => `<button type="button" data-cat="${esc(c)}" aria-pressed="${c === filtro}">${c ? esc(c) : "Todos"}</button>`).join("")}
    </div>` : ""}
    <div class="panel"><div class="list">${lista.map(c => {
      const adj = enlaceSeguro(c.adjunto);
      return `<article class="item comunicado" id="c-${esc(c.id)}"><div>
        <div class="row"><h2 class="t">${esc(c.titulo)}</h2>${c.categoria ? `<span class="pill p-info">${esc(c.categoria)}</span>` : ""}</div>
        <p class="texto">${esc(c.texto)}</p>
        <div class="row"><span class="m">Publicado el ${fecha(c.fecha)}</span>${adj ? `<a class="btn sm ghost" href="${esc(adj)}" target="_blank" rel="noopener">Ver documento adjunto</a>` : ""}</div>
      </div></article>`;
    }).join("") || `<div class="empty">No hay comunicados publicados.</div>`}</div></div>`;
}

caja.addEventListener("click", e => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  filtro = b.dataset.cat;
  pintar();
});

async function iniciar() {
  await montarPagina();
  try {
    const datos = await cargar("comunicados");
    todos = (Array.isArray(datos) ? datos : []).sort(recientesPrimero);
    pintar();
    irAlAncla();
  } catch (err) { avisoError(caja, err); }
}

iniciar();
