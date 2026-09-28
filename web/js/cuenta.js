// Elementos comunes de la zona de residentes: barra de cuenta, navegación y casa activa.
import { esc } from "./comun.js";
import { sb } from "./supabase.js";

const SECCIONES = [
  ["mi-hogar.html", "Mi hogar"],
  ["estado-cuenta.html", "Estado de cuenta"],
  ["pqrs.html", "PQRS"],
  ["reservas.html", "Reservas"],
  ["finanzas.html", "Informes financieros"],
  ["documentos-conjunto.html", "Documentos"]
];

// Categorías de los documentos privados (deben coincidir con 018_documentos_privados.sql).
export const CATEGORIAS_DOC = ["Actas de asamblea", "Actas de consejo", "Estados financieros", "Informes de gestión", "Contratos", "Pólizas", "Otros"];

// 2.345.678 bytes → "2,2 MB"
export const tamanoArchivo = b => !b ? "" : b >= 1048576 ? `${(b / 1048576).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(b / 1024)).toLocaleString("es-CO")} KB`;

// Pesos colombianos sin decimales: $1.250.000 (negativos con signo menos).
export const pesos = v => {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("es-CO");
};

// Barra superior: título, sesión, navegación entre secciones y botón de salir.
export function barraCuenta(estado, titulo, actual) {
  const nav = SECCIONES.map(([h, t]) =>
    `<a class="btn sm ${h === actual ? "" : "ghost"}" href="${h}${h === "mi-hogar.html" ? "?hogar=1" : ""}" ${h === actual ? 'aria-current="page"' : ""}>${t}</a>`).join("");
  const panel = estado.es_admin || estado.es_consejo
    ? `<a class="btn sm ${actual === "admin.html" ? "" : "ghost"}" href="admin.html">${estado.es_admin ? "Panel de administración" : "Censo del conjunto"}</a>` : "";
  return `<div class="cuenta-barra no-imprimir">
      <div><h1>${esc(titulo)}</h1><p class="m">Sesión: ${esc(estado.correo || "")}</p></div>
      <div class="row">${nav}${panel}<button class="btn sm ghost" type="button" data-salir>Cerrar sesión</button></div>
    </div>`;
}

// Cerrar sesión desde cualquier página que use la barra.
document.addEventListener("click", async e => {
  if (!e.target.closest("[data-salir]")) return;
  await sb.auth.signOut();
  location.replace("index.html");
});

// Casas en las que la persona tiene cuenta activa y vigente.
export const casasActivas = estado => estado.perfiles.filter(p => p.unidad_id && p.estado === "activo" && !p.vencido);

// Casa elegida (se recuerda al pasar de una página a otra en la misma sesión del navegador).
export function casaElegida(estado) {
  const casas = casasActivas(estado);
  let guardada = null;
  try { guardada = +sessionStorage.getItem("aragon-casa"); } catch (e) { }
  return casas.find(p => p.unidad_id === guardada) || casas[0] || null;
}
export function recordarCasa(unidad) {
  try { sessionStorage.setItem("aragon-casa", String(unidad)); } catch (e) { }
}

// Selector de casa (solo si tiene más de una).
export function selectorCasa(estado, actual) {
  const casas = casasActivas(estado);
  if (casas.length < 2) return "";
  return `<label for="casa">Casa</label><select id="casa">${casas.map(p =>
    `<option value="${p.unidad_id}" ${p.unidad_id === actual.unidad_id ? "selected" : ""}>Casa ${p.unidad_id} (${p.rol})</option>`).join("")}</select>`;
}

// Estados de PQRS y reservas.
const ESTADO_PQRS = {
  radicada: ["Radicada", "p-info"],
  en_tramite: ["En trámite", "p-warn"],
  respondida: ["Respondida", "p-ok"]
};
export const pillPqrs = e => `<span class="pill ${ESTADO_PQRS[e]?.[1] || "p-info"}">${ESTADO_PQRS[e]?.[0] || esc(e)}</span>`;

const ESTADO_RESERVA = {
  pendiente: ["Pendiente de aprobación", "p-warn"],
  aprobada: ["Aprobada", "p-ok"],
  rechazada: ["Rechazada", "p-bad"],
  cancelada: ["Cancelada", "p-bad"]
};
export const pillReserva = e => `<span class="pill ${ESTADO_RESERVA[e]?.[1] || "p-info"}">${ESTADO_RESERVA[e]?.[0] || esc(e)}</span>`;

export const fechaHora = ts => new Date(ts).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// Días hábiles (lunes a viernes, sin festivos) entre una fecha y hoy.
export function diasHabilesDesde(fechaISO) {
  const d = new Date(fechaISO);
  const hoy = new Date();
  let n = 0;
  for (d.setDate(d.getDate() + 1); d <= hoy; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}
