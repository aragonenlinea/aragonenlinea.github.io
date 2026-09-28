// Documentos del conjunto: actas, estados financieros e informes privados.
// Los ven los propietarios, el consejo (principales y suplentes) y la administración.
// Los marcados "solo consejo" no aparecen para los propietarios: la base de datos no los entrega.
import { montarPagina, esc, fecha } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso } from "./supabase.js";
import { barraCuenta, casasActivas, CATEGORIAS_DOC, tamanoArchivo } from "./cuenta.js";

const caja = document.getElementById("documentos-conjunto");
let estado = null, docs = [];
let filtro = { categoria: "", anio: "", texto: "" };

const sinTildes = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function lista() {
  const t = sinTildes(filtro.texto.trim());
  const visibles = docs.filter(d => (!filtro.categoria || d.categoria === filtro.categoria)
    && (!filtro.anio || d.fecha.startsWith(filtro.anio))
    && (!t || sinTildes(`${d.titulo} ${d.descripcion || ""} ${d.categoria}`).includes(t)));
  if (!visibles.length) return `<div class="panel nota">No hay documentos con ese filtro.</div>`;
  return `<ul class="docs-privados">${visibles.map(d => `<li class="panel doc-privado">
      <div class="doc-fecha"><b>${fecha(d.fecha)}</b><span class="pill p-info">${esc(d.categoria)}</span>${d.audiencia === "consejo" ? `<span class="pill p-sun">Solo consejo</span>` : ""}</div>
      <h3>${esc(d.titulo)}</h3>
      ${d.descripcion ? `<p class="m">${esc(d.descripcion)}</p>` : ""}
      <div class="row"><a class="btn sm" href="visor.html?privado=${d.id}">Ver documento</a>
        <span class="m">${[d.paginas ? `${d.paginas} página${d.paginas === 1 ? "" : "s"}` : "", tamanoArchivo(d.tamano)].filter(Boolean).join(" · ")}</span></div>
    </li>`).join("")}</ul>`;
}

function pintar() {
  const cats = CATEGORIAS_DOC.filter(c => docs.some(d => d.categoria === c));
  const anios = [...new Set(docs.map(d => d.fecha.slice(0, 4)))].sort().reverse();
  caja.innerHTML = barraCuenta(estado, "Documentos del conjunto", "documentos-conjunto.html")
    + (!docs.length ? `<div class="panel nota">La administración aún no ha publicado documentos.</div>` : `
    <p class="m">Actas, estados financieros e informes del conjunto, solo para propietarios. Se ven aquí mismo, sin descargarlos. Por favor no los reenvíe fuera de la comunidad.</p>
    <div class="filtros-docs no-imprimir">
      <div class="filtros" role="group" aria-label="Categoría">
        <button type="button" data-cat="" aria-pressed="${!filtro.categoria}">Todos</button>
        ${cats.map(c => `<button type="button" data-cat="${esc(c)}" aria-pressed="${filtro.categoria === c}">${esc(c)}</button>`).join("")}
      </div>
      <div class="row">
        ${anios.length > 1 ? `<label class="sr-only" for="doc-anio">Año</label><select id="doc-anio" class="selector-corto"><option value="">Todos los años</option>${anios.map(a => `<option ${filtro.anio === a ? "selected" : ""}>${a}</option>`).join("")}</select>` : ""}
        <label class="sr-only" for="doc-buscar">Buscar</label><input id="doc-buscar" type="search" placeholder="Buscar por título" value="${esc(filtro.texto)}">
      </div>
    </div>
    <div id="doc-lista">${lista()}</div>`);
}

caja.addEventListener("click", e => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  filtro.categoria = b.dataset.cat;
  caja.querySelectorAll("[data-cat]").forEach(x => x.setAttribute("aria-pressed", x.dataset.cat === filtro.categoria));
  document.getElementById("doc-lista").innerHTML = lista();
});
caja.addEventListener("change", e => {
  if (e.target.id !== "doc-anio") return;
  filtro.anio = e.target.value;
  document.getElementById("doc-lista").innerHTML = lista();
});
caja.addEventListener("input", e => {
  if (e.target.id !== "doc-buscar") return;
  filtro.texto = e.target.value;
  document.getElementById("doc-lista").innerHTML = lista();
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    if (!estado.autorizacion_vigente) { location.replace("mi-hogar.html?hogar=1"); return; }
    const esPropietario = casasActivas(estado).some(p => p.rol === "propietario");
    if (!estado.es_admin && !estado.es_consejo && !esPropietario) {
      caja.innerHTML = barraCuenta(estado, "Documentos del conjunto", "documentos-conjunto.html")
        + `<div class="panel nota">Los documentos del conjunto (actas, estados financieros e informes) son solo para los propietarios. Si usted es propietario, registre su casa en <a href="mi-hogar.html?hogar=1">Mi hogar</a>.</div>`;
      return;
    }
    docs = await consulta(sb.from("documentos_privados").select("id,titulo,categoria,fecha,descripcion,audiencia,paginas,tamano")
      .eq("estado", "publicado").order("fecha", { ascending: false }).order("id", { ascending: false }));
    pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
