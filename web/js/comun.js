// ==========================================================
// Funciones compartidas por todas las páginas del sitio.
// Aquí están el encabezado, el pie de página, el botón de
// modo claro/oscuro y la lectura de los archivos de datos.
// Para agregar una página al menú, edite MENU.
// ==========================================================

export const MENU = [
  ["index.html", "Inicio"],
  ["comunicados.html", "Comunicados"],
  ["documentos.html", "Documentos"],
  ["zonas.html", "Zonas comunes"],
  ["#contacto", "Contacto"]
];

// Escapa texto para mostrarlo sin riesgo dentro del HTML.
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Solo permite enlaces a archivos del mismo sitio, páginas https, teléfonos y correos.
export function enlaceSeguro(url) {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (/^(https:|tel:|mailto:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("//")) return "";
  return u;
}

// ---------- Fechas (formato Colombia) ----------
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
export const aFecha = s => FECHA_OK.test(s) ? new Date(s + "T12:00:00") : null;
export function fecha(s, opciones = { day: "numeric", month: "long", year: "numeric" }) {
  const d = aFecha(s);
  return d ? d.toLocaleDateString("es-CO", opciones) : esc(s);
}
export function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Ordena de la fecha más reciente a la más antigua.
export const recientesPrimero = (a, b) => String(b.fecha).localeCompare(String(a.fecha));

// ---------- Lectura de datos ----------
// Lee web/datos/<nombre>.json. Si el archivo tiene un error, avisa en lenguaje sencillo.
export async function cargar(nombre) {
  const ruta = `datos/${nombre}.json`;
  let r;
  try { r = await fetch(ruta, { cache: "no-cache" }); }
  catch (e) { throw new Error(`No se pudo leer ${ruta}. Revise la conexión a internet.`); }
  if (!r.ok) throw new Error(`No se encontró el archivo ${ruta}.`);
  try { return await r.json(); }
  catch (e) { throw new Error(`El archivo ${ruta} tiene un error de escritura. Revise que no falten ni sobren comas, comillas o corchetes.`); }
}

// Si la dirección trae un ancla (#c-3, #zona-2), resalta ese elemento y lo muestra.
export function irAlAncla() {
  if (!location.hash) return;
  const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!el) return;
  el.classList.add("destacado");
  el.scrollIntoView();
}

// Comunicados publicados (se administran desde el panel y se guardan en Supabase).
export async function cargarComunicados(limite = 100) {
  const { SUPABASE_URL, SUPABASE_CLAVE } = await import("./config.js");
  const url = `${SUPABASE_URL}/rest/v1/comunicados?select=id,fecha,categoria,titulo,texto,adjunto&publicado=eq.true&order=fecha.desc,id.desc&limit=${limite}`;
  let r;
  try { r = await fetch(url, { headers: { apikey: SUPABASE_CLAVE } }); }
  catch (e) { throw new Error("No se pudieron cargar los comunicados. Revise la conexión a internet."); }
  if (!r.ok) throw new Error("No se pudieron cargar los comunicados en este momento. Intente más tarde.");
  return r.json();
}

export function avisoError(contenedor, err) {
  console.error(err);
  contenedor.innerHTML = `<div class="panel error"><h2>No se pudo mostrar esta sección</h2><p>${esc(err.message)}</p><p class="m">Si usted administra el sitio, consulte docs/manual-administracion.md.</p></div>`;
}

// ---------- Modo claro / oscuro ----------
const TEMAS = [
  [null, "Automático", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>'],
  ["light", "Claro", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'],
  ["dark", "Oscuro", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>']
];
function temaActual() {
  const t = document.documentElement.getAttribute("data-theme");
  return Math.max(0, TEMAS.findIndex(([v]) => v === t));
}
function pintarBotonTema(b) {
  const [, nombre, icono] = TEMAS[temaActual()];
  b.innerHTML = `${icono}<span class="txt">${nombre}</span>`;
  b.setAttribute("aria-label", `Modo de color: ${nombre}. Cambiar`);
}
function cambiarTema(b) {
  const [valor] = TEMAS[(temaActual() + 1) % TEMAS.length];
  if (valor) document.documentElement.setAttribute("data-theme", valor);
  else document.documentElement.removeAttribute("data-theme");
  try { valor ? localStorage.setItem("aragon-tema", valor) : localStorage.removeItem("aragon-tema"); } catch (e) { }
  pintarBotonTema(b);
}

// ---------- Encabezado y pie ----------
export async function montarPagina() {
  const actual = location.pathname.split("/").pop() || "index.html";
  let sitio = { nombre: "Conjunto Residencial Aragón", ciudad: "Neiva, Huila", directorio: [] };
  try { sitio = { ...sitio, ...(await cargar("sitio")) }; } catch (e) { console.error(e); }

  if (sitio.modo_prueba) {
    const aviso = document.createElement("div");
    aviso.className = "demo";
    aviso.textContent = "Sitio en construcción. La información que aparece es de prueba.";
    document.body.prepend(aviso);
  }

  // "Mi cuenta" aparece cuando se habilita el acceso de residentes (sitio.json → "acceso_residentes": true).
  const menu = [...MENU];
  if (sitio.acceso_residentes) menu.splice(menu.length - 1, 0, ["mi-hogar.html", "Mi cuenta"]);

  const cab = document.getElementById("encabezado");
  cab.innerHTML = `<div class="barra-in">
      <a class="marca" href="index.html"><img class="logo" src="img/logo-aragon.png" alt="" width="94" height="40"><span>Aragón en línea<small>${esc(sitio.nombre)}, ${esc(sitio.ciudad)}</small></span></a>
      <nav aria-label="Menú principal">${menu.map(([h, t]) =>
        `<a href="${h}"${h === actual ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
      <button class="tema" type="button"></button>
    </div>`;
  const bt = cab.querySelector(".tema");
  pintarBotonTema(bt);
  bt.addEventListener("click", () => cambiarTema(bt));

  document.getElementById("pie").innerHTML = `<div class="pie-in">
      <div id="contacto" class="directorio" role="region" aria-label="Directorio">${directorio(sitio.directorio)}</div>
    </div>
    <div class="pie-in">
      <p>${esc(sitio.nombre)}${sitio.direccion ? `, ${esc(sitio.direccion)}` : ""}, ${esc(sitio.ciudad)}.</p>
      <p>Sitio informativo: no pide datos personales ni recibe pagos.</p>
    </div>`;
  return sitio;
}

export function directorio(lista = []) {
  return lista.map(d => {
    const url = enlaceSeguro(d.enlace);
    const det = url ? `<a href="${esc(url)}">${esc(d.detalle)}</a>` : `<span>${esc(d.detalle)}</span>`;
    return `<div><b>${esc(d.nombre)}</b>${det}</div>`;
  }).join("");
}

// ---------- Íconos de zonas comunes ----------
export const ICONOS = {
  salon: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M8 22 24 9l16 13"/><path d="M12 20v19h24V20"/><path d="M20 39V28h8v11"/></svg>',
  bbq: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><ellipse cx="24" cy="20" rx="14" ry="6"/><path d="M10 20c0 8 6 12 14 12s14-4 14-12"/><path d="M16 32l-4 9M32 32l4 9M24 32v9"/></svg>',
  piscina: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 30c4-3 8-3 12 0s8 3 12 0 8-3 12 0"/><path d="M6 38c4-3 8-3 12 0s8 3 12 0 8-3 12 0"/><path d="M16 24V10a4 4 0 0 1 8 0M30 24V10a4 4 0 0 1 8 0M16 16h14"/></svg>',
  cancha: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M9 24h30M24 9c-6 5-6 25 0 30M24 9c6 5 6 25 0 30"/></svg>',
  parque: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M10 40V14M38 40V14M8 14h32"/><path d="M18 14v14M30 14v14"/><path d="M15 28h6M27 28h6"/></svg>',
  parqueadero: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><rect x="9" y="7" width="30" height="34" rx="5"/><path d="M19 33V15h7a5 5 0 0 1 0 10h-7"/></svg>',
  general: '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M24 40s-12-10-12-20a12 12 0 0 1 24 0c0 10-12 20-12 20z"/><circle cx="24" cy="20" r="4"/></svg>'
};
export const icono = nombre => ICONOS[nombre] || ICONOS.general;
