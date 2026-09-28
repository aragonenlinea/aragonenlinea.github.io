// Pestaña "Cartera" del panel: importar la cartera desde Excel/CSV con vista previa y validaciones,
// historial de importaciones, detalle por casa, indicadores y configuración del pago.
// Las mismas validaciones se repiten en la base de datos (importar_cartera): esta página solo
// ayuda a encontrar los errores antes de publicar.
import { esc, fecha } from "./comun.js";
import { sb, rpc, consulta, aviso } from "./supabase.js";
import { pesos } from "./cuenta.js";

// Librería para leer Excel en el navegador (versión fija, CDN oficial de SheetJS).
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const PLANTILLA = "https://github.com/aragonenlinea/aragonenlinea.github.io/raw/main/plantillas/plantilla_cartera.xlsx";
const EJEMPLO = "https://github.com/aragonenlinea/aragonenlinea.github.io/raw/main/plantillas/ejemplo_cartera_PRUEBA.xlsx";

const MONTOS = ["saldo_anterior", "cuota_administracion", "cuota_extraordinaria", "parqueadero", "multas", "intereses_mora", "pagos_periodo", "saldo_total"];
const EDADES = ["mora_1_30", "mora_31_90", "mora_91_180", "mora_181_360", "mora_mas_360"];
const ETIQ = { saldo_anterior: "Saldo ant.", cuota_administracion: "Cuota adm.", cuota_extraordinaria: "Cuota extra", parqueadero: "Parqueadero",
  multas: "Multas", intereses_mora: "Intereses", pagos_periodo: "Pagos", saldo_total: "Saldo total" };

// Nombres de columna aceptados (sin tildes, en minúscula).
const ALIAS = {
  unidad: "unidad", casa: "unidad", no_casa: "unidad", numero_casa: "unidad",
  fecha_corte: "fecha_corte", fecha_de_corte: "fecha_corte", corte: "fecha_corte",
  periodo: "periodo", mes: "periodo",
  saldo_anterior: "saldo_anterior",
  cuota_administracion: "cuota_administracion", cuota_admin: "cuota_administracion", administracion: "cuota_administracion",
  cuota_extraordinaria: "cuota_extraordinaria", cuota_extra: "cuota_extraordinaria", extraordinaria: "cuota_extraordinaria",
  parqueadero: "parqueadero", parqueaderos: "parqueadero",
  multas: "multas", sanciones: "multas", multas_y_sanciones: "multas",
  intereses_mora: "intereses_mora", intereses: "intereses_mora", intereses_de_mora: "intereses_mora",
  pagos_periodo: "pagos_periodo", pagos: "pagos_periodo", pagos_del_periodo: "pagos_periodo",
  saldo_total: "saldo_total", total: "saldo_total", saldo: "saldo_total",
  mora_1_30: "mora_1_30", mora_31_90: "mora_31_90", mora_91_180: "mora_91_180", mora_181_360: "mora_181_360", mora_mas_360: "mora_mas_360"
};
const normal = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

let previa = null;   // resultado de leer el archivo

// "1.250.380", "$ 1.250.380", "(550.000)", "-550000", 1250380 → número entero (o NaN)
export function leerMonto(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return null;
  const negativo = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[$\s()−-]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isNaN(n) ? NaN : (negativo ? -n : n);
}

export function leerFecha(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "invalida";
}

async function leerArchivo(archivo) {
  const XLSX = await import(SHEETJS);
  let wb;
  if (/\.csv$/i.test(archivo.name)) {
    const texto = await archivo.text();
    const primera = texto.split(/\r?\n/)[0] || "";
    const FS = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    wb = XLSX.read(texto, { type: "string", FS, raw: true });
  } else {
    wb = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
  }
  const nombreHoja = wb.SheetNames.find(n => normal(n) === "cartera") || wb.SheetNames.find(n => normal(n) !== "instrucciones") || wb.SheetNames[0];
  const filasCrudas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: null, raw: true });
  return validar(archivo.name, filasCrudas);
}

function validar(nombreArchivo, crudas) {
  const errores = [], avisos = [], filas = [];
  const vistos = new Set();
  const fechas = new Set(), periodos = new Set();
  const desconocidas = new Set();

  crudas.forEach((cruda, i) => {
    const r = {};
    for (const [k, v] of Object.entries(cruda)) {
      const campo = ALIAS[normal(k)];
      if (campo) r[campo] = v; else if (!/^__empty/i.test(k)) desconocidas.add(k);
    }
    const vacia = Object.values(r).every(v => v === null || v === "");
    if (vacia) return;
    const f = { _fila: i + 2, _errores: [] };
    const casa = Number(String(r.unidad ?? "").replace(/\D/g, ""));
    if (!Number.isInteger(casa) || casa < 1 || casa > 40) f._errores.push(`casa "${r.unidad ?? ""}" no válida (1 a 40)`);
    else if (vistos.has(casa)) f._errores.push(`la Casa ${casa} está repetida`);
    f.unidad = casa; vistos.add(casa);
    for (const k of [...MONTOS, ...EDADES]) {
      const n = leerMonto(r[k]);
      if (n === null) { if (k === "saldo_total") f._errores.push("falta el saldo total (si usa fórmulas, abra el archivo en Excel y guárdelo)"); continue; }
      if (Number.isNaN(n)) { f._errores.push(`${ETIQ[k] || k}: "${r[k]}" no es un número`); continue; }
      if (!Number.isInteger(n)) { f._errores.push(`${ETIQ[k] || k}: tiene decimales`); continue; }
      f[k] = n;
    }
    if (!f._errores.length) {
      const calc = ["saldo_anterior", "cuota_administracion", "cuota_extraordinaria", "parqueadero", "multas", "intereses_mora"]
        .reduce((a, k) => a + (f[k] || 0), 0) - (f.pagos_periodo || 0);
      if (calc !== f.saldo_total) f._errores.push(`el saldo total ${pesos(f.saldo_total)} no cuadra con la suma de sus componentes (${pesos(calc)})`);
      const edades = EDADES.filter(k => f[k] !== undefined);
      if (edades.length && f.saldo_total > 0) {
        const s = edades.reduce((a, k) => a + f[k], 0);
        if (s !== f.saldo_total) f._errores.push(`la antigüedad de la deuda (${pesos(s)}) no suma el saldo total`);
      }
    }
    const fc = leerFecha(r.fecha_corte);
    if (fc === "invalida") f._errores.push(`fecha de corte "${r.fecha_corte}" no válida`); else if (fc) fechas.add(fc);
    if (r.periodo) periodos.add(String(r.periodo).trim());
    filas.push(f);
  });

  if (!filas.length) errores.push("No se encontraron filas con datos. Revise que la primera fila tenga los nombres de las columnas de la plantilla.");
  if (filas.length > 40) errores.push("El archivo tiene más de 40 filas.");
  const conSaldo = crudas.some(c => Object.keys(c).some(k => ALIAS[normal(k)] === "saldo_total"));
  if (filas.length && !conSaldo) errores.push("No se encontró la columna saldo_total.");
  if (fechas.size > 1) errores.push(`Hay varias fechas de corte en el archivo (${[...fechas].join(", ")}). Deben ser iguales.`);
  if (periodos.size > 1) errores.push(`Hay varios periodos en el archivo (${[...periodos].join(", ")}). Deben ser iguales.`);
  if (desconocidas.size) avisos.push(`Se ignoraron estas columnas que no están en la plantilla: ${[...desconocidas].join(", ")}.`);
  const faltan = Array.from({ length: 40 }, (_, i) => i + 1).filter(c => !vistos.has(c));
  if (faltan.length && faltan.length < 40) avisos.push(`No vienen ${faltan.length} casa(s): ${faltan.join(", ")}. Se mostrarán sin saldo pendiente.`);
  const total = filas.reduce((a, f) => a + (Number.isInteger(f.saldo_total) ? f.saldo_total : 0), 0);
  return { archivo: nombreArchivo, filas, errores, avisos, total, fecha_corte: [...fechas][0] || "", periodo: [...periodos][0] || "" };
}

// ---------- Vista ----------
export async function vistaCartera() {
  const [res, hist, pago] = await Promise.all([
    rpc("resumen_cartera"),
    consulta(sb.from("cartera_importaciones").select("*").order("creado_en", { ascending: false }).limit(24)),
    consulta(sb.from("configuracion_pagos").select("*").eq("id", 1).maybeSingle())
  ]);
  const vigente = hist.filter(h => h.estado === "publicada").sort((a, b) => b.fecha_corte.localeCompare(a.fecha_corte) || b.id - a.id)[0];
  const detalle = vigente ? await consulta(sb.from("cartera_unidad").select("*").eq("importacion_id", vigente.id).order("unidad_id")) : [];

  return `${indicadores(res)}
  <div class="grid g2">
    <div class="panel">
      <h2>Importar cartera</h2>
      <p class="m">Use la <a href="${PLANTILLA}">plantilla de cartera</a> (Excel). Para practicar, hay un <a href="${EJEMPLO}">archivo de ejemplo con datos de prueba</a> (total: 9.234.000).</p>
      <label for="ca-archivo">Archivo (Excel o CSV)</label>
      <input id="ca-archivo" type="file" accept=".xlsx,.xls,.csv">
      <div id="ca-previa">${previa ? htmlPrevia() : ""}</div>
    </div>
    <div class="panel">
      <h2>Configuración del pago</h2>
      <form id="fPago" novalidate>
        <label for="pg-url">Botón 1 · Enlace de pago por PSE, cualquier banco (https://...)</label>
        <input id="pg-url" name="url_pago" type="url" maxlength="500" value="${esc(pago?.url_pago || "")}" placeholder="https://...">
        <label for="pg-boton">Texto del botón 1</label>
        <input id="pg-boton" name="texto_boton" maxlength="40" value="${esc(pago?.texto_boton || "Pagar por PSE (cualquier banco)")}">
        <label for="pg-banco">Botón 2 · Enlace del banco del convenio (https://...)</label>
        <input id="pg-banco" name="url_banco" type="url" maxlength="500" value="${esc(pago?.url_banco || "")}" placeholder="https://...">
        <label for="pg-boton2">Texto del botón 2</label>
        <input id="pg-boton2" name="texto_boton_banco" maxlength="40" value="${esc(pago?.texto_boton_banco || "Pagar en Davivienda")}">
        <p class="m">Use solo enlaces oficiales que le entregue el banco. Antes de guardar, ábralos y confirme que llevan a la página del banco (con candado y el nombre del banco en la dirección).</p>
        <label for="pg-inst">Instrucciones (use {casa} para el número de la casa)</label>
        <textarea id="pg-inst" name="instrucciones" maxlength="1500">${esc(pago?.instrucciones || "")}</textarea>
        <label for="pg-pronto">Aviso de pronto pago</label>
        <input id="pg-pronto" name="aviso_pronto_pago" maxlength="300" value="${esc(pago?.aviso_pronto_pago || "")}">
        <p class="m">La plataforma no cobra: el botón solo abre la página del banco.</p>
        <div class="acciones-form"><button class="btn" type="submit">Guardar</button></div>
      </form>
    </div>
  </div>
  <div class="panel bloque"><h2>Historial de importaciones</h2><div class="tablewrap"><table>
    <thead><tr><th>Corte</th><th>Periodo</th><th class="num">Casas</th><th class="num">Total</th><th>Archivo</th><th>Origen</th><th>Subida</th><th>Estado</th><th></th></tr></thead>
    <tbody>${hist.map(h => `<tr><td>${fecha(h.fecha_corte)}</td><td>${esc(h.periodo)}</td><td class="num">${h.filas}</td><td class="num">${pesos(h.total)}</td>
      <td>${esc(h.archivo || "")}</td><td>${h.origen === "script" ? "PC administración" : "Panel"}</td><td>${fecha(h.creado_en.slice(0, 10))}</td>
      <td>${h.estado === "publicada" ? (h.id === vigente?.id ? `<span class="pill p-ok">Vigente</span>` : `<span class="pill p-info">Publicada</span>`) : `<span class="pill p-bad">Anulada</span>`}</td>
      <td>${h.estado === "publicada" ? `<button class="btn sm peligro" type="button" data-anular-imp="${h.id}">Anular</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="9" class="m">Aún no se ha importado cartera.</td></tr>`}</tbody></table></div></div>
  ${vigente ? `<div class="panel bloque"><h2>Cuentas por cobrar por antigüedad · corte ${fecha(vigente.fecha_corte)}</h2>
    ${cuadroEdades(detalle)}
    <p class="m">Detalle por casa solo para la administración, sin nombres. El consejo ve únicamente los totales.</p>
    <details><summary>Ver detalle por concepto (todas las casas del archivo)</summary><div class="tablewrap"><table>
      <thead><tr><th>Casa</th>${MONTOS.map(k => `<th class="num">${ETIQ[k]}</th>`).join("")}</tr></thead>
      <tbody>${detalle.map(d => `<tr><td>Casa ${d.unidad_id}</td>${MONTOS.map(k => `<td class="num">${pesos(d[k])}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></details></div>` : ""}`;
}

// Cuadro como el de cuentas por cobrar de los estados financieros: casas con saldo, por antigüedad.
const COLS_EDAD = [["mora_1_30", "1-30 días"], ["mora_31_90", "31-90 días"], ["mora_91_180", "91-180 días"],
                   ["mora_181_360", "181-360 días"], ["mora_mas_360", "Más de 360 días"]];
const sinEdad = d => COLS_EDAD.every(([k]) => d[k] === null || d[k] === undefined);

function cuadroEdades(detalle) {
  const deudoras = detalle.filter(d => Number(d.saldo_total) > 0);
  if (!deudoras.length) return `<div class="aviso ok">Ninguna casa tiene saldo pendiente en este corte.</div>`;
  const hayNoClasif = deudoras.some(sinEdad);
  const suma = k => deudoras.reduce((a, d) => a + Number(d[k] || 0), 0);
  const total = suma("saldo_total");
  const noClasif = deudoras.filter(sinEdad).reduce((a, d) => a + Number(d.saldo_total), 0);
  const pct = v => total ? (v * 100 / total).toLocaleString("es-CO", { maximumFractionDigits: 2 }) + " %" : "";
  return `<div class="tablewrap"><table class="cuadro-edades">
    <thead><tr><th>Casa</th>${COLS_EDAD.map(([, t]) => `<th class="num">${t}</th>`).join("")}${hayNoClasif ? `<th class="num">Sin clasificar</th>` : ""}<th class="num">Total</th></tr></thead>
    <tbody>${deudoras.map(d => `<tr><td>Casa ${d.unidad_id}</td>
      ${COLS_EDAD.map(([k]) => `<td class="num">${Number(d[k]) ? pesos(d[k]) : ""}</td>`).join("")}
      ${hayNoClasif ? `<td class="num">${sinEdad(d) ? pesos(d.saldo_total) : ""}</td>` : ""}
      <td class="num"><b>${pesos(d.saldo_total)}</b></td></tr>`).join("")}</tbody>
    <tfoot>
      <tr><th>Total</th>${COLS_EDAD.map(([k]) => `<th class="num">${pesos(suma(k))}</th>`).join("")}${hayNoClasif ? `<th class="num">${pesos(noClasif)}</th>` : ""}<th class="num">${pesos(total)}</th></tr>
      <tr><td class="m">% del total</td>${COLS_EDAD.map(([k]) => `<td class="num m">${pct(suma(k))}</td>`).join("")}${hayNoClasif ? `<td class="num m">${pct(noClasif)}</td>` : ""}<td class="num m">100 %</td></tr>
    </tfoot></table></div>`;
}

// Totales por antigüedad (administración y consejo): sin casas.
function totalesEdades(res) {
  const e = res.edades;
  if (!e) return "";
  const filas = [...COLS_EDAD.map(([k, t]) => [t, Number(e[k] || 0)]), ...(Number(e.sin_clasificar) ? [["Sin clasificar", Number(e.sin_clasificar)]] : [])];
  const total = filas.reduce((a, [, v]) => a + v, 0);
  if (!total) return "";
  return `<div class="panel bloque-sm"><h3>Cartera por antigüedad</h3><div class="tablewrap"><table>
    <thead><tr>${filas.map(([t]) => `<th class="num">${t}</th>`).join("")}<th class="num">Total</th></tr></thead>
    <tbody><tr>${filas.map(([, v]) => `<td class="num">${pesos(v)}</td>`).join("")}<td class="num"><b>${pesos(total)}</b></td></tr>
      <tr>${filas.map(([, v]) => `<td class="num m">${(v * 100 / total).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %</td>`).join("")}<td class="num m">100 %</td></tr></tbody>
  </table></div></div>`;
}

export function indicadores(res) {
  if (!res) return `<div class="panel nota bloque-sm">Aún no hay cartera publicada.</div>`;
  return `<h2>Cartera · corte ${fecha(res.fecha_corte)} (${esc(res.periodo)})</h2><div class="kpis">
    <div class="panel kpi"><div class="n">${pesos(res.cartera_total)}</div><div class="l">Cartera total por cobrar</div></div>
    <div class="panel kpi"><div class="n">${res.casas_al_dia}/40</div><div class="l">Casas al día</div></div>
    <div class="panel kpi"><div class="n">${res.casas_en_mora}</div><div class="l">Casas con saldo pendiente</div></div>
    <div class="panel kpi"><div class="n">${res.casas_mora_mas_90}</div><div class="l">Casas con deuda de más de 90 días</div></div>
    <div class="panel kpi"><div class="n">${pesos(res.cartera_mas_360)}</div><div class="l">Cartera de más de 360 días</div></div>
    <div class="panel kpi"><div class="n">${pesos(res.saldos_a_favor)}</div><div class="l">Saldos a favor (anticipos)</div></div>
  </div>${totalesEdades(res)}`;
}

function htmlPrevia() {
  const p = previa;
  const conError = p.filas.filter(f => f._errores.length);
  const hayError = p.errores.length || conError.length;
  return `<div class="resumen-import">
      <div><b>${esc(p.archivo)}</b></div><div>${p.filas.length} casa(s)</div><div>Total del archivo: <b>${pesos(p.total)}</b></div>
    </div>
    ${p.errores.map(e => `<div class="aviso error">${esc(e)}</div>`).join("")}
    ${conError.length ? `<div class="aviso error">${conError.length} fila(s) con errores (marcadas en rojo). Corrija el archivo y vuelva a cargarlo.</div>` : ""}
    ${p.avisos.map(a => `<div class="aviso info">${esc(a)}</div>`).join("")}
    <form id="fImportar" novalidate>
      <div class="grid tres">
        <div><label for="ca-fecha">Fecha de corte</label><input id="ca-fecha" name="fecha_corte" type="date" value="${esc(p.fecha_corte)}" required></div>
        <div><label for="ca-periodo">Periodo</label><input id="ca-periodo" name="periodo" maxlength="40" value="${esc(p.periodo)}" placeholder="Septiembre 2026" required></div>
        <div><label for="ca-total">Total de la cartera según el informe contable</label><input id="ca-total" name="total_informe" inputmode="numeric" placeholder="9.234.000" required></div>
      </div>
      <div id="ca-cuadre"></div>
      <div class="tablewrap bloque-sm"><table>
        <thead><tr><th>Fila</th><th>Casa</th>${MONTOS.map(k => `<th class="num">${ETIQ[k]}</th>`).join("")}<th>Revisión</th></tr></thead>
        <tbody>${p.filas.map(f => `<tr class="${f._errores.length ? "fila-error" : ""}"><td>${f._fila}</td><td>${Number.isInteger(f.unidad) && f.unidad ? f.unidad : "?"}</td>
          ${MONTOS.map(k => `<td class="num">${f[k] !== undefined ? pesos(f[k]) : ""}</td>`).join("")}
          <td class="${f._errores.length ? "error-txt" : ""}">${f._errores.length ? esc(f._errores.join("; ")) : "✓"}</td></tr>`).join("")}</tbody>
      </table></div>
      ${p.avisos.some(a => a.startsWith("No vienen")) ? `<label class="check"><input type="checkbox" name="confirmo_faltantes"> Confirmo que las casas que no vienen no tienen saldo pendiente</label>` : ""}
      <div class="acciones-form"><button class="btn" type="submit" ${hayError ? "disabled" : ""}>Publicar cartera</button>
        <button class="btn ghost" type="button" data-descartar-previa>Descartar</button></div>
    </form>`;
}

function revisarCuadre() {
  const cont = document.getElementById("ca-cuadre");
  const input = document.getElementById("ca-total");
  if (!cont || !input) return;
  const t = leerMonto(input.value);
  if (t === null) { cont.innerHTML = ""; return; }
  if (Number.isNaN(t) || !Number.isInteger(t)) { aviso(cont, "Escriba el total en pesos, sin decimales.", "error"); return; }
  aviso(cont, t === previa.total ? `Cuadra: el total del archivo coincide con el informe contable (${pesos(t)}).`
    : `No cuadra: el archivo suma ${pesos(previa.total)} y el informe dice ${pesos(t)} (diferencia ${pesos(previa.total - t)}).`,
    t === previa.total ? "ok" : "error");
}

// ---------- Eventos (los llama admin.js) ----------
export async function manejarCarteraCambio(e, msg) {
  if (e.target.id === "ca-archivo" && e.target.files?.[0]) {
    const cont = document.getElementById("ca-previa");
    aviso(cont, "Leyendo el archivo…");
    try {
      previa = await leerArchivo(e.target.files[0]);
      cont.innerHTML = htmlPrevia();
    } catch (err) {
      console.error(err);
      previa = null;
      aviso(cont, "No se pudo leer el archivo. Use la plantilla en Excel (.xlsx) o un CSV.", "error");
    }
    return true;
  }
  return false;
}

export function manejarCarteraEntrada(e) {
  if (e.target.id === "ca-total") { revisarCuadre(); return true; }
  return false;
}

export async function manejarCarteraClic(b, msg, repintar) {
  if (b.hasAttribute("data-descartar-previa")) { previa = null; await repintar(); return true; }
  if (b.dataset.anularImp) {
    if (!confirm("¿Anular esta importación? Los residentes dejarán de verla y verán el corte anterior. Queda en el historial.")) return true;
    const r = await rpc("admin_anular_importacion", { p_importacion: +b.dataset.anularImp });
    msg(r.mensaje, r.ok ? "ok" : "error"); await repintar(); return true;
  }
  return false;
}

export async function manejarCarteraEnvio(f, msg, repintar) {
  if (f.id === "fPago") {
    const d = Object.fromEntries(new FormData(f));
    const url = (d.url_pago || "").trim();
    const urlBanco = (d.url_banco || "").trim();
    if ((url && !/^https:\/\/\S+$/.test(url)) || (urlBanco && !/^https:\/\/\S+$/.test(urlBanco))) {
      msg("Los enlaces de pago deben empezar por https://", "error"); return true;
    }
    await consulta(sb.from("configuracion_pagos").update({
      url_pago: url || null, texto_boton: (d.texto_boton || "Pagar por PSE").trim() || "Pagar por PSE",
      url_banco: urlBanco || null, texto_boton_banco: (d.texto_boton_banco || "Pagar en Davivienda").trim() || "Pagar en Davivienda",
      instrucciones: (d.instrucciones || "").trim() || null, aviso_pronto_pago: (d.aviso_pronto_pago || "").trim() || null,
      actualizado_en: new Date().toISOString()
    }).eq("id", 1));
    msg("Configuración de pago guardada."); await repintar(); return true;
  }
  if (f.id === "fImportar") {
    const d = Object.fromEntries(new FormData(f));
    const total = leerMonto(d.total_informe);
    if (!d.fecha_corte) { msg("Escriba la fecha de corte.", "error"); return true; }
    if (!d.periodo || d.periodo.trim().length < 3) { msg("Escriba el periodo (por ejemplo: Septiembre 2026).", "error"); return true; }
    if (total === null || Number.isNaN(total) || !Number.isInteger(total)) { msg("Escriba el total de la cartera del informe contable, en pesos.", "error"); return true; }
    if (total !== previa.total) { msg("El total del archivo no coincide con el informe contable. No se puede publicar.", "error"); return true; }
    if (f.elements.confirmo_faltantes && !f.elements.confirmo_faltantes.checked) { msg("Confirme lo de las casas que no vienen en el archivo.", "error"); return true; }
    if (!confirm(`¿Publicar la cartera con corte ${d.fecha_corte} (${previa.filas.length} casas, total ${pesos(total)})? Los residentes la verán de inmediato.`)) return true;
    const filas = previa.filas.map(({ _fila, _errores, ...resto }) => resto);
    const r = await rpc("importar_cartera", {
      p_fecha_corte: d.fecha_corte, p_periodo: d.periodo.trim(), p_total_informe: total, p_archivo: previa.archivo, p_filas: filas
    });
    if (!r.ok) {
      msg(`${r.mensaje} ${(r.errores || []).join(" · ")}`, "error");
      return true;
    }
    previa = null;
    msg(r.mensaje); await repintar(); return true;
  }
  return false;
}
