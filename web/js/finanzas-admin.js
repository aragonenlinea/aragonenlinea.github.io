// Pestaña "Finanzas" del panel: importar el presupuesto anual y el informe de cada mes (ejecución por
// rubro y pagos realizados) desde Excel, con vista previa y validaciones; historial y anulación.
// Las mismas validaciones se repiten en la base de datos (importar_presupuesto, importar_informe_mes).
import { esc, fecha } from "./comun.js";
import { sb, rpc, consulta, aviso } from "./supabase.js";
import { pesos } from "./cuenta.js";
import { leerMonto, leerFecha } from "./cartera-admin.js";

const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
const RAW = "https://github.com/aragonenlinea/aragonenlinea.github.io/raw/main/plantillas/";
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const normal = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const claveRubro = s => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const leerTipo = v => { const n = normal(v); return /^ingreso/.test(n) ? "ingreso" : /^(gasto|egreso)/.test(n) ? "gasto" : null; };
// Igual que privado.beneficiario_es_entidad: solo empresas o entidades, nunca nombres de personas.
const ENTIDAD = /(^|[^A-Z])(S\.?\s?A\.?\s?S\.?|LTDA\.?|S\.?\s?A\.?|S\.?\s?EN\s?C\.?|E\.?\s?S\.?\s?P\.?|SOCIEDAD|COOPERATIVA|CORPORACI[OÓ]N|FUNDACI[OÓ]N|EMPRESAS?|BANCO|DAVIVIENDA|DIAN|MUNICIPIO|ALCALD[IÍ]A|GOBERNACI[OÓ]N|SUPERINTENDENCIA|ELECTROHUILA|EMPRESAS P[UÚ]BLICAS|CLARO|MOVISTAR|TIGO|SEGUROS|ASEGURADORA)([^A-Z]|$)/;
const esEntidad = t => !t || !String(t).trim() || ENTIDAD.test(String(t).toUpperCase());

const ALIAS_PRES = { tipo: "tipo", grupo: "grupo", capitulo: "grupo", rubro: "rubro", cuenta: "rubro", nombre: "rubro",
  valor_anual: "valor_anual", presupuesto: "valor_anual", presupuesto_anual: "valor_anual", valor: "valor_anual" };
const ALIAS_EJEC = { tipo: "tipo", rubro: "rubro", cuenta: "rubro", valor: "valor", ejecutado: "valor", valor_mes: "valor" };
const ALIAS_PAGO = { fecha: "fecha", rubro: "rubro", beneficiario: "beneficiario", tercero: "beneficiario", proveedor: "beneficiario",
  concepto: "concepto", detalle: "concepto", descripcion: "concepto", valor: "valor" };

let previaPres = null, previaInf = null;

// año y mes a partir del nombre del archivo: "informe_2026_07_julio.xlsx" → 2026, 7
const anioDe = n => +(String(n).match(/(20\d\d)/)?.[1] || new Date().getFullYear());
const mesDe = n => { const m = String(n).match(/20\d\d[_\- ](\d{1,2})(?!\d)/); return m && +m[1] >= 1 && +m[1] <= 12 ? +m[1] : null; };

async function libro(archivo) {
  const XLSX = await import(SHEETJS);
  const wb = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
  const hoja = nombre => {
    const h = wb.SheetNames.find(n => normal(n) === nombre);
    return h ? XLSX.utils.sheet_to_json(wb.Sheets[h], { defval: null, raw: true }) : null;
  };
  const primera = () => XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find(n => normal(n) !== "instrucciones") || wb.SheetNames[0]], { defval: null, raw: true });
  return { hoja, primera };
}

function mapear(cruda, alias) {
  const r = {};
  for (const [k, v] of Object.entries(cruda)) { const c = alias[normal(k)]; if (c && r[c] === undefined) r[c] = v; }
  return r;
}

function entero(v, errores, etiqueta, { minimo = null, obligatorio = true } = {}) {
  const n = leerMonto(v);
  if (n === null) { if (obligatorio) errores.push(`falta ${etiqueta}`); return null; }
  if (Number.isNaN(n)) { errores.push(`${etiqueta}: "${v}" no es un número`); return null; }
  if (!Number.isInteger(n)) { errores.push(`${etiqueta}: tiene decimales`); return null; }
  if (minimo !== null && n < minimo) { errores.push(`${etiqueta}: no puede ser negativo`); return null; }
  return n;
}

// ---------- Presupuesto ----------
async function leerPresupuesto(archivo) {
  const { hoja, primera } = await libro(archivo);
  const crudas = hoja("presupuesto") || primera();
  const filas = [], vistos = new Set(), errores = [];
  crudas.forEach((c, i) => {
    const r = mapear(c, ALIAS_PRES);
    if (!r.rubro && !r.grupo && (r.valor_anual === null || r.valor_anual === undefined)) return;
    const f = { _fila: i + 2, _errores: [] };
    f.tipo = leerTipo(r.tipo);
    if (!f.tipo) f._errores.push(`tipo "${r.tipo ?? ""}" no válido (ingreso o gasto)`);
    f.grupo = String(r.grupo ?? "").trim(); if (f.grupo.length < 2) f._errores.push("falta el grupo");
    f.rubro = String(r.rubro ?? "").trim(); if (f.rubro.length < 2) f._errores.push("falta el rubro");
    f.valor_anual = entero(r.valor_anual, f._errores, "valor anual", { minimo: 0 });
    const k = f.tipo + "|" + claveRubro(f.rubro);
    if (vistos.has(k)) f._errores.push("rubro repetido");
    vistos.add(k);
    filas.push(f);
  });
  if (!filas.length) errores.push("No se encontraron rubros. Revise que la primera fila tenga los títulos tipo, grupo, rubro, valor_anual.");
  const suma = t => filas.filter(f => f.tipo === t).reduce((a, f) => a + (f.valor_anual || 0), 0);
  return { archivo: archivo.name, anio: anioDe(archivo.name), filas, errores, ingresos: suma("ingreso"), gastos: suma("gasto") };
}

function htmlPreviaPres(vigentes) {
  const p = previaPres;
  const conError = p.filas.filter(f => f._errores.length);
  const reemplaza = vigentes.some(x => x.anio === p.anio);
  return `<div class="resumen-import"><div><b>${esc(p.archivo)}</b></div><div>${p.filas.length} rubros</div>
      <div>Ingresos: <b>${pesos(p.ingresos)}</b></div><div>Gastos: <b>${pesos(p.gastos)}</b></div></div>
    ${p.errores.map(e => `<div class="aviso error">${esc(e)}</div>`).join("")}
    ${conError.length ? `<div class="aviso error">${conError.length} fila(s) con errores (en rojo). Corrija el archivo y vuelva a cargarlo.</div>` : ""}
    <form id="fPresupuesto" novalidate>
      <div class="grid tres">
        <div><label for="fp-anio">Año</label><input id="fp-anio" name="anio" type="number" min="2020" max="2100" value="${p.anio}" required></div>
        <div><label for="fp-aprob">Fecha de la asamblea que lo aprobó</label><input id="fp-aprob" name="aprobado_en" type="date"></div>
        <div><label for="fp-nota">Nota (opcional)</label><input id="fp-nota" name="nota" maxlength="300" placeholder="Asamblea ordinaria, acta 01-${p.anio}"></div>
      </div>
      ${reemplaza ? `<div class="aviso info">Ya hay un presupuesto publicado de ${p.anio}: el nuevo lo reemplaza y el anterior queda anulado en el historial.</div>` : ""}
      <details class="bloque-sm"><summary>Ver los ${p.filas.length} rubros</summary><div class="tablewrap"><table>
        <thead><tr><th>Fila</th><th>Tipo</th><th>Grupo</th><th>Rubro</th><th class="num">Valor anual</th><th>Revisión</th></tr></thead>
        <tbody>${p.filas.map(f => `<tr class="${f._errores.length ? "fila-error" : ""}"><td>${f._fila}</td><td>${esc(f.tipo || "?")}</td><td>${esc(f.grupo)}</td><td>${esc(f.rubro)}</td>
          <td class="num">${f.valor_anual !== null ? pesos(f.valor_anual) : ""}</td><td class="${f._errores.length ? "error-txt" : ""}">${f._errores.length ? esc(f._errores.join("; ")) : "✓"}</td></tr>`).join("")}</tbody>
      </table></div></details>
      <div class="acciones-form"><button class="btn" type="submit" ${p.errores.length || conError.length ? "disabled" : ""}>Publicar presupuesto</button>
        <button class="btn ghost" type="button" data-descartar-fin="pres">Descartar</button></div>
    </form>`;
}

// ---------- Informe mensual ----------
async function leerInforme(archivo) {
  const { hoja, primera } = await libro(archivo);
  const crudasE = hoja("ejecucion") || primera();
  const crudasP = hoja("pagos") || [];
  const ejecucion = [], pagos = [], errores = [], vistos = new Set();
  crudasE.forEach((c, i) => {
    const r = mapear(c, ALIAS_EJEC);
    if (!r.rubro && (r.valor === null || r.valor === undefined)) return;
    const f = { _fila: i + 2, _errores: [] };
    f.tipo = leerTipo(r.tipo);
    if (!f.tipo) f._errores.push(`tipo "${r.tipo ?? ""}" no válido (ingreso o gasto)`);
    f.rubro = String(r.rubro ?? "").trim(); if (f.rubro.length < 2) f._errores.push("falta el rubro");
    f.valor = entero(r.valor, f._errores, "valor", { obligatorio: false }) ?? 0;
    const k = f.tipo + "|" + claveRubro(f.rubro);
    if (vistos.has(k)) f._errores.push("rubro repetido");
    vistos.add(k);
    ejecucion.push(f);
  });
  crudasP.forEach((c, i) => {
    const r = mapear(c, ALIAS_PAGO);
    if (!r.rubro && !r.concepto && (r.valor === null || r.valor === undefined)) return;
    const f = { _fila: i + 2, _errores: [] };
    f.rubro = String(r.rubro ?? "").trim(); if (f.rubro.length < 2) f._errores.push("falta el rubro");
    f.beneficiario = String(r.beneficiario ?? "").trim();
    if (!esEntidad(f.beneficiario)) f._errores.push(`"${f.beneficiario}" parece el nombre de una persona: deje el beneficiario vacío`);
    f.concepto = String(r.concepto ?? "").trim().slice(0, 200);
    const fe = leerFecha(r.fecha);
    if (fe === "invalida") f._errores.push(`fecha "${r.fecha}" no válida`); else f.fecha = fe || "";
    f.valor = entero(r.valor, f._errores, "valor");
    pagos.push(f);
  });
  if (!ejecucion.length) errores.push('No se encontró la hoja "Ejecucion" con rubros. Use la plantilla de informe mensual.');
  const suma = t => ejecucion.filter(f => f.tipo === t).reduce((a, f) => a + (f.valor || 0), 0);
  const inf = { archivo: archivo.name, anio: anioDe(archivo.name), mes: mesDe(archivo.name), ejecucion, pagos, errores,
    ingresos: suma("ingreso"), gastos: suma("gasto"), totalPagos: pagos.reduce((a, f) => a + (f.valor || 0), 0), rubrosPres: null };
  await revisarContraPresupuesto(inf);
  return inf;
}

// Marca los rubros que no están en el presupuesto publicado del año elegido.
async function revisarContraPresupuesto(inf) {
  const p = await consulta(sb.from("presupuestos").select("id").eq("anio", inf.anio).eq("estado", "publicado").maybeSingle());
  inf.sinPresupuesto = !p;
  const rubros = p ? await consulta(sb.from("presupuesto_rubros").select("tipo,rubro").eq("presupuesto_id", p.id)) : [];
  const claves = new Set(rubros.map(r => r.tipo + "|" + claveRubro(r.rubro)));
  for (const f of inf.ejecucion) {
    f._errores = f._errores.filter(e => !e.startsWith("no está en el presupuesto"));
    if (p && f.tipo && !claves.has(f.tipo + "|" + claveRubro(f.rubro))) f._errores.push(`no está en el presupuesto ${inf.anio}`);
  }
}

function htmlPreviaInf() {
  const p = previaInf;
  const malas = [...p.ejecucion, ...p.pagos].filter(f => f._errores.length).length;
  const bloqueado = p.errores.length || malas || p.sinPresupuesto;
  return `<div class="resumen-import"><div><b>${esc(p.archivo)}</b></div>
      <div>Ingresos: <b>${pesos(p.ingresos)}</b></div><div>Gastos: <b>${pesos(p.gastos)}</b></div>
      <div>${p.pagos.length ? `Pagos: <b>${pesos(p.totalPagos)}</b> (${p.pagos.length})` : "Sin hoja de pagos"}</div></div>
    ${p.errores.map(e => `<div class="aviso error">${esc(e)}</div>`).join("")}
    ${p.sinPresupuesto ? `<div class="aviso error">No hay presupuesto publicado de ${p.anio}. Publíquelo primero (o corrija el año).</div>` : ""}
    ${malas ? `<div class="aviso error">${malas} fila(s) con errores (en rojo). Corrija el archivo y vuelva a cargarlo.</div>` : ""}
    <form id="fInforme" novalidate>
      <div class="grid tres">
        <div><label for="fi-anio">Año</label><input id="fi-anio" name="anio" type="number" min="2020" max="2100" value="${p.anio}" required></div>
        <div><label for="fi-mes">Mes</label><select id="fi-mes" name="mes" required><option value="">Elija…</option>${MES.map((m, i) =>
          `<option value="${i + 1}" ${p.mes === i + 1 ? "selected" : ""}>${m}</option>`).join("")}</select></div>
        <div></div>
        <div><label for="fi-ing">Total ingresos del informe contable</label><input id="fi-ing" name="total_ingresos" inputmode="numeric" data-cuadre="ingresos" required></div>
        <div><label for="fi-gas">Total gastos del informe contable</label><input id="fi-gas" name="total_gastos" inputmode="numeric" data-cuadre="gastos" required></div>
        ${p.pagos.length ? `<div><label for="fi-pag">Total pagos del mes (flujo de caja)</label><input id="fi-pag" name="total_pagos" inputmode="numeric" data-cuadre="totalPagos" required></div>` : "<div></div>"}
      </div>
      <div id="fi-cuadre"></div>
      <details class="bloque-sm" ${malas ? "open" : ""}><summary>Ver la ejecución (${p.ejecucion.length} rubros)</summary><div class="tablewrap"><table>
        <thead><tr><th>Fila</th><th>Tipo</th><th>Rubro</th><th class="num">Valor del mes</th><th>Revisión</th></tr></thead>
        <tbody>${p.ejecucion.map(f => `<tr class="${f._errores.length ? "fila-error" : ""}"><td>${f._fila}</td><td>${esc(f.tipo || "?")}</td><td>${esc(f.rubro)}</td>
          <td class="num">${pesos(f.valor)}</td><td class="${f._errores.length ? "error-txt" : ""}">${f._errores.length ? esc(f._errores.join("; ")) : "✓"}</td></tr>`).join("")}</tbody>
      </table></div></details>
      ${p.pagos.length ? `<details class="bloque-sm" ${malas ? "open" : ""}><summary>Ver los pagos (${p.pagos.length})</summary><div class="tablewrap"><table>
        <thead><tr><th>Fila</th><th>Fecha</th><th>Rubro</th><th>Beneficiario</th><th>Concepto</th><th class="num">Valor</th><th>Revisión</th></tr></thead>
        <tbody>${p.pagos.map(f => `<tr class="${f._errores.length ? "fila-error" : ""}"><td>${f._fila}</td><td>${f.fecha ? fecha(f.fecha) : ""}</td><td>${esc(f.rubro)}</td>
          <td>${esc(f.beneficiario)}</td><td>${esc(f.concepto)}</td><td class="num">${f.valor !== null ? pesos(f.valor) : ""}</td>
          <td class="${f._errores.length ? "error-txt" : ""}">${f._errores.length ? esc(f._errores.join("; ")) : "✓"}</td></tr>`).join("")}</tbody>
      </table></div></details>` : ""}
      <p class="m">Beneficiario: solo empresas o entidades (SAS, LTDA, DIAN…). Los pagos a personas se identifican por el rubro y el beneficiario se deja vacío.</p>
      <div class="acciones-form"><button class="btn" type="submit" ${bloqueado ? "disabled" : ""}>Publicar informe</button>
        <button class="btn ghost" type="button" data-descartar-fin="inf">Descartar</button></div>
    </form>`;
}

function revisarCuadre() {
  const cont = document.getElementById("fi-cuadre");
  if (!cont || !previaInf) return;
  const partes = [];
  let error = false;
  for (const input of document.querySelectorAll("[data-cuadre]")) {
    const t = leerMonto(input.value);
    if (t === null) continue;
    const etiqueta = { ingresos: "Ingresos", gastos: "Gastos", totalPagos: "Pagos" }[input.dataset.cuadre];
    const archivo = previaInf[input.dataset.cuadre];
    if (Number.isNaN(t) || !Number.isInteger(t)) { partes.push(`${etiqueta}: escriba el total en pesos, sin decimales.`); error = true; }
    else if (t === archivo) partes.push(`${etiqueta}: cuadra (${pesos(t)}).`);
    else { partes.push(`${etiqueta}: NO cuadra. El archivo suma ${pesos(archivo)} y el informe dice ${pesos(t)} (diferencia ${pesos(archivo - t)}).`); error = true; }
  }
  aviso(cont, partes.join(" "), error ? "error" : "ok");
}

// ---------- Vista ----------
export async function vistaFinanzas() {
  const [pres, infs] = await Promise.all([
    consulta(sb.from("presupuestos").select("id,anio,aprobado_en,nota,estado,archivo,creado_en").order("anio", { ascending: false }).order("creado_en", { ascending: false }).limit(20)),
    consulta(sb.from("informes_mensuales").select("id,anio,mes,total_ingresos,total_gastos,total_pagos,estado,archivo,origen,creado_en").order("anio", { ascending: false }).order("mes", { ascending: false }).order("creado_en", { ascending: false }).limit(40))
  ]);
  const vigentes = pres.filter(p => p.estado === "publicado");
  const estadoPill = e => e === "publicado" ? `<span class="pill p-ok">Publicado</span>` : `<span class="pill p-bad">Anulado</span>`;
  return `<p class="m">Los residentes, arrendatarios y el consejo ven esto en <a href="finanzas.html">Informes financieros</a>.</p>
  <div class="grid g2">
    <div class="panel">
      <h2>1. Presupuesto del año</h2>
      <p class="m">Una vez al año, después de la asamblea. Use la <a href="${RAW}plantilla_presupuesto.xlsx">plantilla de presupuesto</a>: una fila por rubro con el valor aprobado.</p>
      <label for="fp-archivo">Archivo (Excel)</label>
      <input id="fp-archivo" type="file" accept=".xlsx,.xls">
      <div id="fp-previa">${previaPres ? htmlPreviaPres(vigentes) : ""}</div>
    </div>
    <div class="panel">
      <h2>2. Informe de cada mes</h2>
      <p class="m">Cada mes, cuando la contadora entregue el informe. Use la <a href="${RAW}plantilla_informe_mensual.xlsx">plantilla de informe mensual</a>: hoja "Ejecucion" (lo causado en el mes por rubro) y hoja "Pagos" (opcional, lo pagado en el mes).</p>
      <label for="fi-archivo">Archivo (Excel)</label>
      <input id="fi-archivo" type="file" accept=".xlsx,.xls">
      <div id="fi-previa">${previaInf ? htmlPreviaInf() : ""}</div>
    </div>
  </div>
  <div class="panel bloque"><h2>Presupuestos</h2><div class="tablewrap"><table>
    <thead><tr><th>Año</th><th>Aprobado</th><th>Nota</th><th>Archivo</th><th>Subido</th><th>Estado</th><th></th></tr></thead>
    <tbody>${pres.map(p => `<tr><td>${p.anio}</td><td>${p.aprobado_en ? fecha(p.aprobado_en) : ""}</td><td>${esc(p.nota || "")}</td><td>${esc(p.archivo || "")}</td>
      <td>${fecha(p.creado_en.slice(0, 10))}</td><td>${estadoPill(p.estado)}</td>
      <td>${p.estado === "publicado" ? `<button class="btn sm peligro" type="button" data-anular-fin="presupuesto" data-id="${p.id}">Anular</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="7" class="m">Aún no hay presupuestos.</td></tr>`}</tbody></table></div></div>
  <div class="panel bloque"><h2>Informes mensuales</h2><div class="tablewrap"><table>
    <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Pagos</th><th>Archivo</th><th>Origen</th><th>Subido</th><th>Estado</th><th></th></tr></thead>
    <tbody>${infs.map(i => `<tr><td>${MES[i.mes - 1]} ${i.anio}</td><td class="num">${pesos(i.total_ingresos)}</td><td class="num">${pesos(i.total_gastos)}</td>
      <td class="num">${i.total_pagos === null ? "" : pesos(i.total_pagos)}</td><td>${esc(i.archivo || "")}</td><td>${i.origen === "script" ? "PC administración" : "Panel"}</td>
      <td>${fecha(i.creado_en.slice(0, 10))}</td><td>${estadoPill(i.estado)}</td>
      <td>${i.estado === "publicado" ? `<button class="btn sm peligro" type="button" data-anular-fin="informe" data-id="${i.id}">Anular</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="9" class="m">Aún no hay informes.</td></tr>`}</tbody></table></div></div>`;
}

// ---------- Eventos (los llama admin.js) ----------
export async function manejarFinanzasCambio(e, msg, repintar) {
  if (e.target.id === "fp-archivo" && e.target.files?.[0]) {
    aviso(document.getElementById("fp-previa"), "Leyendo el archivo…");
    try { previaPres = await leerPresupuesto(e.target.files[0]); }
    catch (err) { console.error(err); previaPres = null; aviso(document.getElementById("fp-previa"), "No se pudo leer el archivo. Use la plantilla en Excel (.xlsx).", "error"); return true; }
    await repintar(); return true;
  }
  if (e.target.id === "fi-archivo" && e.target.files?.[0]) {
    aviso(document.getElementById("fi-previa"), "Leyendo el archivo…");
    try { previaInf = await leerInforme(e.target.files[0]); }
    catch (err) { console.error(err); previaInf = null; aviso(document.getElementById("fi-previa"), "No se pudo leer el archivo. Use la plantilla en Excel (.xlsx).", "error"); return true; }
    await repintar(); return true;
  }
  if (e.target.id === "fi-anio" && previaInf) {
    const a = +e.target.value;
    if (a >= 2020 && a <= 2100 && a !== previaInf.anio) {
      previaInf.anio = a; previaInf.mes = +document.getElementById("fi-mes").value || previaInf.mes;
      await revisarContraPresupuesto(previaInf);
      document.getElementById("fi-previa").innerHTML = htmlPreviaInf();
    }
    return true;
  }
  if (e.target.id === "fi-mes" && previaInf) { previaInf.mes = +e.target.value || null; return true; }
  if (e.target.id === "fp-anio" && previaPres) { previaPres.anio = +e.target.value || previaPres.anio; return true; }
  return false;
}

export function manejarFinanzasEntrada(e) {
  if (e.target.dataset?.cuadre) { revisarCuadre(); return true; }
  return false;
}

export async function manejarFinanzasClic(b, msg, repintar) {
  if (b.dataset.descartarFin) {
    if (b.dataset.descartarFin === "pres") previaPres = null; else previaInf = null;
    await repintar(); return true;
  }
  if (b.dataset.anularFin) {
    const que = b.dataset.anularFin === "presupuesto" ? "este presupuesto" : "este informe";
    if (!confirm(`¿Anular ${que}? Los residentes dejarán de verlo. Queda en el historial.`)) return true;
    const r = await rpc("admin_anular_financiero", { p_tipo: b.dataset.anularFin, p_id: +b.dataset.id });
    msg(r.mensaje, r.ok ? "ok" : "error"); await repintar(); return true;
  }
  return false;
}

export async function manejarFinanzasEnvio(f, msg, repintar) {
  if (f.id === "fPresupuesto") {
    const d = Object.fromEntries(new FormData(f));
    const anio = +d.anio;
    if (!(anio >= 2020 && anio <= 2100)) { msg("Escriba el año del presupuesto.", "error"); return true; }
    const p = previaPres;
    if (!confirm(`¿Publicar el presupuesto ${anio} (${p.filas.length} rubros, gastos ${pesos(p.gastos)})? Los residentes lo verán de inmediato.`)) return true;
    const r = await rpc("importar_presupuesto", {
      p_anio: anio, p_aprobado_en: d.aprobado_en || null, p_nota: (d.nota || "").trim() || null, p_archivo: p.archivo,
      p_rubros: p.filas.map(x => ({ tipo: x.tipo, grupo: x.grupo, rubro: x.rubro, valor_anual: x.valor_anual }))
    });
    if (!r.ok) { msg(`${r.mensaje} ${(r.errores || []).join(" · ")}`, "error"); return true; }
    previaPres = null; msg(r.mensaje); await repintar(); return true;
  }
  if (f.id === "fInforme") {
    const d = Object.fromEntries(new FormData(f));
    const p = previaInf;
    const anio = +d.anio, mes = +d.mes;
    if (!(anio >= 2020 && anio <= 2100) || !(mes >= 1 && mes <= 12)) { msg("Elija el año y el mes del informe.", "error"); return true; }
    const ti = leerMonto(d.total_ingresos), tg = leerMonto(d.total_gastos), tp = p.pagos.length ? leerMonto(d.total_pagos) : null;
    if (ti !== p.ingresos || tg !== p.gastos || (p.pagos.length && tp !== p.totalPagos)) {
      msg("Los totales del archivo no coinciden con los del informe contable. No se puede publicar.", "error"); return true;
    }
    if (!confirm(`¿Publicar el informe de ${MES[mes - 1]} ${anio}? Si ya había uno de ese mes, queda reemplazado.`)) return true;
    const r = await rpc("importar_informe_mes", {
      p_anio: anio, p_mes: mes, p_total_ingresos: ti, p_total_gastos: tg, p_total_pagos: tp, p_archivo: p.archivo,
      p_ejecucion: p.ejecucion.map(x => ({ tipo: x.tipo, rubro: x.rubro, valor: x.valor })),
      p_pagos: p.pagos.map(x => ({ fecha: x.fecha || "", rubro: x.rubro, beneficiario: x.beneficiario, concepto: x.concepto, valor: x.valor }))
    });
    if (!r.ok) { msg(`${r.mensaje} ${(r.errores || []).join(" · ")}`, "error"); return true; }
    previaInf = null; msg(r.mensaje); await repintar(); return true;
  }
  return false;
}
