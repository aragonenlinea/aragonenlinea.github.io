// Informes financieros: tablero con gráficos, cartera del conjunto (solo totales),
// ejecución del presupuesto rubro por rubro y mes a mes, y pagos del mes.
// Lo ven las cuentas activas (propietarios, arrendatarios), el consejo y la administración.
// Los pagos a personas naturales se muestran solo por rubro, sin nombre (la base de datos lo exige).
import { montarPagina, esc, fecha } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso } from "./supabase.js";
import { barraCuenta, casasActivas, pesos } from "./cuenta.js";
import { lugar, dibujar, columnas, lineas, leyenda, corto, activarRecuadros } from "./graficos.js";
import { tableroCartera } from "./tablero-cartera.js";

const caja = document.getElementById("finanzas");
const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TOLERANCIA = 0.05;   // se marca un grupo cuando va más de 5 puntos por encima de lo esperado a la fecha

let estado = null, presupuestos = [], anio = null, mesPagos = null;

const pct = v => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " %";
const celda = v => v === null ? `<td class="num m">—</td>` : `<td class="num">${v ? pesos(v) : ""}</td>`;

const PESTANAS = [["tablero", "Tablero financiero"], ["cartera", "Cartera del conjunto"], ["detalle", "Detalle y pagos"]];
let vista = "tablero";

async function pintar() {
  let html = barraCuenta(estado, "Informes financieros", "finanzas.html")
    + `<div class="pestanas no-imprimir" role="tablist">${PESTANAS.map(([k, t]) =>
      `<button type="button" role="tab" data-vista="${k}" aria-selected="${k === vista}">${t}</button>`).join("")}</div>`;
  if (vista === "cartera") {
    caja.innerHTML = html + tableroCartera(await rpc("historial_cartera"))
      + `<p class="m bloque">Solo totales del conjunto: aquí nunca aparecen casas ni nombres. El estado de cuenta de su casa está en <a href="estado-cuenta.html">Estado de cuenta</a>.</p>`;
    dibujar(caja);
    return;
  }
  if (!presupuestos.length) {
    caja.innerHTML = html + `<div class="panel nota">La administración aún no ha publicado el presupuesto ni los informes mensuales.</div>`;
    return;
  }
  const p = presupuestos.find(x => x.anio === anio);
  const [rubros, informes] = await Promise.all([
    consulta(sb.from("presupuesto_rubros").select("tipo,grupo,rubro,orden,valor_anual").eq("presupuesto_id", p.id).order("orden")),
    consulta(sb.from("informes_mensuales").select("id,anio,mes,total_ingresos,total_gastos,total_pagos").eq("anio", anio).eq("estado", "publicado").order("mes"))
  ]);
  const ids = informes.map(i => i.id);
  const ejec = ids.length ? await consulta(sb.from("ejecucion_mensual").select("informe_id,mes,tipo,rubro,valor").in("informe_id", ids)) : [];

  html += presupuestos.length > 1 ? `<label for="fin-anio">Año</label><select id="fin-anio" class="selector-corto">${presupuestos.map(x =>
    `<option value="${x.anio}" ${x.anio === anio ? "selected" : ""}>${x.anio}</option>`).join("")}</select>` : "";

  if (!informes.length) {
    caja.innerHTML = html + `<div class="panel nota">Presupuesto ${anio} publicado. Aún no hay informes mensuales de ${anio}.</div>` + tablaEjecucion(p, rubros, [], 0);
    return;
  }
  const ultimo = informes.at(-1).mes;
  const conInforme = new Set(informes.map(i => i.mes));
  // valores[tipo|rubro] = [12 meses] (null = mes sin informe)
  const valores = {};
  for (const r of rubros) valores[r.tipo + "|" + r.rubro] = Array.from({ length: 12 }, (_, m) => conInforme.has(m + 1) ? 0 : null);
  for (const e of ejec) {
    const k = e.tipo + "|" + e.rubro;
    if (valores[k]) valores[k][e.mes - 1] = Number(e.valor);
  }

  if (vista === "tablero") {
    html += resumen(p, rubros, valores, informes, ultimo) + tableroFinanciero(rubros, valores, ultimo) + graficoGrupos(rubros, valores, ultimo);
  } else {
    if (!informes.some(i => i.mes === mesPagos)) mesPagos = ultimo;
    const infPagos = informes.find(i => i.mes === mesPagos);
    const pagos = await consulta(sb.from("pagos_mes").select("fecha,rubro,beneficiario,concepto,valor").eq("informe_id", infPagos.id).order("fecha").order("id"));
    html += tablaEjecucion(p, rubros, valores, ultimo) + tablaMeses(informes) + seccionPagos(informes, infPagos, pagos);
  }
  html += `<p class="m bloque">Cifras tomadas de los informes contables mensuales (lo causado en cada mes). Los estados financieros oficiales son los que firma la contadora y se presentan a la asamblea. Si ve una diferencia, radique una PQRS.</p>`;
  caja.innerHTML = html;
  dibujar(caja);
}

// Gráficos del tablero: ingresos y gastos por mes, acumulado frente al presupuesto,
// cuotas de administración por mes y los rubros de mayor gasto.
function tableroFinanciero(rubros, valores, ultimo) {
  const meses = MES_CORTO.slice(0, ultimo);
  const porMes = tipo => Array.from({ length: ultimo }, (_, m) => rubros.filter(r => r.tipo === tipo)
    .reduce((a, r) => valores[r.tipo + "|" + r.rubro][m] === null ? a : (a ?? 0) + valores[r.tipo + "|" + r.rubro][m], null));
  const ing = porMes("ingreso"), gas = porMes("gasto");
  const nombreMes = i => MES[i][0].toUpperCase() + MES[i].slice(1);

  const serIng = { nombre: "Ingresos", clase: "c1" }, serGas = { nombre: "Gastos", clase: "c2" };
  const g1 = `<div class="panel"><h3>Ingresos y gastos de cada mes</h3>${leyenda([serIng, serGas])}
    ${lugar(columnas({ titulo: "Ingresos y gastos por mes", categorias: meses, series: [{ ...serIng, valores: ing }, { ...serGas, valores: gas }],
      tip: i => ing[i] === null ? `${nombreMes(i)}: sin informe` : `${nombreMes(i)}: ingresos ${pesos(ing[i])} · gastos ${pesos(gas[i])} · ${ing[i] - gas[i] >= 0 ? "excedente" : "déficit"} ${pesos(Math.abs(ing[i] - gas[i]))}` }))}
    <p class="m">Los meses con más gasto que ingreso cierran en déficit. Toque un mes para ver los valores.</p></div>`;

  const pGas = presupuestoTipo(rubros, "gasto"), pIng = presupuestoTipo(rubros, "ingreso");
  const acu = arr => { let s = 0; return MES_CORTO.map((_, m) => m < ultimo ? (s += arr[m] || 0) : null); };
  const aIng = acu(ing), aGas = acu(gas);
  const aPres = MES_CORTO.map((_, m) => Math.round(pGas * (m + 1) / 12));
  const serPres = { nombre: "Gasto permitido por el presupuesto", clase: "c-pres", discontinua: true };
  const g2 = `<div class="panel"><h3>Lo acumulado en el año frente al presupuesto</h3>${leyenda([{ nombre: "Ingresos acumulados", clase: "c1" }, { nombre: "Gastos acumulados", clase: "c2" }, serPres])}
    ${lugar(lineas({ titulo: "Acumulado del año frente al presupuesto", categorias: MES_CORTO,
      series: [{ ...serPres, valores: aPres }, { nombre: "Ingresos acumulados", clase: "c1", valores: aIng }, { nombre: "Gastos acumulados", clase: "c2", valores: aGas }],
      tip: i => `${nombreMes(i)}: ` + (i < ultimo ? `ingresos ${pesos(aIng[i])} · gastos ${pesos(aGas[i])} · ` : "") + `presupuesto de gasto a la fecha ${pesos(aPres[i])}` }))}
    <p class="m">Si la línea de gastos pasa por encima de la línea punteada, se está gastando más rápido de lo aprobado. Presupuesto del año: gastos ${pesos(pGas)}, ingresos ${pesos(pIng)}.</p></div>`;

  const sinTildes = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cuota = rubros.find(r => r.tipo === "ingreso" && /cuotas? de administracion/i.test(sinTildes(r.rubro)));
  let g3 = "";
  if (cuota) {
    const v = valores["ingreso|" + cuota.rubro].slice(0, ultimo);
    const ref = Math.round(Number(cuota.valor_anual) / 12);
    g3 = `<div class="panel"><h3>Cuotas de administración de cada mes</h3>${leyenda([{ nombre: "Cuotas del mes", clase: "c1" }, { nombre: `Presupuesto mensual (${corto(ref)})`, clase: "c-pres", discontinua: true }])}
      ${lugar(columnas({ titulo: "Cuotas de administración por mes", categorias: meses, series: [{ nombre: "Cuotas", clase: "c1", valores: v }],
        referencia: { valor: ref }, tip: i => v[i] === null ? `${nombreMes(i)}: sin informe` : `${nombreMes(i)}: ${pesos(v[i])} (presupuesto mensual ${pesos(ref)})` }))}
      <p class="m">Valor registrado en el informe contable de cada mes frente a lo presupuestado.</p></div>`;
  }

  const totalGas = aGas[ultimo - 1] || 0;
  const top = rubros.filter(r => r.tipo === "gasto").map(r => ({ r, v: acumulado(valores["gasto|" + r.rubro], ultimo) }))
    .filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
  const g4 = !top.length ? "" : `<div class="panel"><h3>¿En qué se va la plata?</h3><p class="m">Los ${top.length} rubros de mayor gasto en ${anio}, hasta ${MES[ultimo - 1]}.</p>
    <div class="barras">${top.map(({ r, v }) => `<div class="barra-fila" tabindex="0" data-tip="${esc(`${r.rubro}: ${pesos(v)} · ${pct(v / totalGas)} del gasto · presupuesto del año ${pesos(r.valor_anual)}`)}">
      <div class="barra-nombre">${esc(r.rubro)}</div>
      <div class="barra-pista"><div class="barra-valor c2" data-ancho="${v / top[0].v * 100}"></div></div>
      <div class="barra-texto">${pesos(v)} · ${pct(v / totalGas)} del gasto</div></div>`).join("")}</div></div>`;

  return `<div class="grid g2 bloque-sm">${g1}${g2}</div><div class="grid g2 bloque">${g3}${g4}</div>`;
}

const acumulado = (arr, hasta) => arr.slice(0, hasta).reduce((a, v) => a + (v || 0), 0);
const sumaTipo = (rubros, valores, tipo, hasta) => rubros.filter(r => r.tipo === tipo).reduce((a, r) => a + acumulado(valores[r.tipo + "|" + r.rubro], hasta), 0);
const presupuestoTipo = (rubros, tipo) => rubros.filter(r => r.tipo === tipo).reduce((a, r) => a + Number(r.valor_anual), 0);

function resumen(p, rubros, valores, informes, ultimo) {
  const ing = sumaTipo(rubros, valores, "ingreso", ultimo), gas = sumaTipo(rubros, valores, "gasto", ultimo);
  const pIng = presupuestoTipo(rubros, "ingreso"), pGas = presupuestoTipo(rubros, "gasto");
  const faltan = Array.from({ length: ultimo }, (_, m) => m + 1).filter(m => !informes.some(i => i.mes === m));
  return `<h2>Presupuesto ${p.anio} · ejecución a ${MES[ultimo - 1]}</h2>
    <p class="m">${p.aprobado_en ? `Aprobado el ${fecha(p.aprobado_en)}. ` : ""}${esc(p.nota || "")}</p>
    ${faltan.length ? `<div class="aviso info">Falta el informe de: ${faltan.map(m => MES[m - 1]).join(", ")}.</div>` : ""}
    <div class="kpis">
      <div class="panel kpi"><div class="n">${pesos(ing)}</div><div class="l">Ingresos a ${MES[ultimo - 1]} · ${pIng ? pct(ing / pIng) : "—"} del presupuesto del año</div>
        ${pIng ? `<div class="tendencia ${ing / pIng >= ultimo / 12 ? "bien" : "mal"}">${ing / pIng >= ultimo / 12 ? "▲ Por encima" : "▼ Por debajo"} de lo esperado</div>` : ""}</div>
      <div class="panel kpi"><div class="n">${pesos(gas)}</div><div class="l">Gastos a ${MES[ultimo - 1]} · ${pGas ? pct(gas / pGas) : "—"} del presupuesto del año</div>
        ${pGas ? `<div class="tendencia ${gas / pGas <= ultimo / 12 ? "bien" : "mal"}">${gas / pGas <= ultimo / 12 ? "▼ Dentro" : "▲ Por encima"} de lo esperado</div>` : ""}</div>
      <div class="panel kpi destacado"><div class="n">${pesos(ing - gas)}</div><div class="l">${ing - gas >= 0 ? "Excedente" : "Déficit"} acumulado (ingresos − gastos)</div></div>
      <div class="panel kpi"><div class="n">${pct(ultimo / 12)}</div><div class="l">Lo esperado a la fecha (${ultimo} de 12 meses)</div></div>
    </div>`;
}

// Barras por grupo de gasto: cuánto del presupuesto del año se ha ejecutado, con la marca de lo esperado.
function graficoGrupos(rubros, valores, ultimo) {
  const esperado = ultimo / 12;
  const grupos = [];
  for (const r of rubros.filter(x => x.tipo === "gasto")) {
    let g = grupos.find(x => x.nombre === r.grupo);
    if (!g) grupos.push(g = { nombre: r.grupo, presupuesto: 0, ejecutado: 0 });
    g.presupuesto += Number(r.valor_anual);
    g.ejecutado += acumulado(valores[r.tipo + "|" + r.rubro], ultimo);
  }
  const visibles = grupos.filter(g => g.presupuesto > 0 || g.ejecutado > 0);
  if (!visibles.length) return "";
  return `<div class="panel bloque grafico">
    <h2>Gastos por grupo · ejecutado frente al presupuesto del año</h2>
    <p class="m"><span class="marca-leyenda" aria-hidden="true"></span> La raya marca lo esperado a ${MES[ultimo - 1]} (${pct(esperado)}). Se señala el grupo que va más de 5 puntos por encima. El detalle está en la tabla de abajo.</p>
    <div class="barras">${visibles.map(g => {
      const v = g.presupuesto ? g.ejecutado / g.presupuesto : null;
      const alto = v === null ? g.ejecutado > 0 : v > esperado + TOLERANCIA;
      const texto = v === null ? `${pesos(g.ejecutado)} · sin presupuesto` : `${pct(v)} · ${pesos(g.ejecutado)} de ${pesos(g.presupuesto)}`;
      const tip = `${g.nombre}: ejecutado ${pesos(g.ejecutado)}${g.presupuesto ? ` de ${pesos(g.presupuesto)} (${pct(v)}). Esperado a ${MES[ultimo - 1]}: ${pesos(Math.round(g.presupuesto * esperado))}` : " sin presupuesto"}.`;
      return `<div class="barra-fila" tabindex="0" data-tip="${esc(tip)}">
        <div class="barra-nombre">${esc(g.nombre)}</div>
        <div class="barra-pista"><div class="barra-valor ${alto ? "alto" : ""}" data-ancho="${Math.min(100, (v ?? 1) * 100)}"></div>
          <div class="barra-esperado" data-izq="${esperado * 100}"></div></div>
        <div class="barra-texto">${texto}${alto ? ` <span class="alerta-txt">▲ por encima de lo esperado</span>` : ""}</div>
      </div>`;
    }).join("")}</div>
  </div>`;
}

function tablaEjecucion(p, rubros, valores, ultimo) {
  const meses = Array.from({ length: ultimo }, (_, m) => m);
  const esperado = ultimo / 12;
  const cabeza = `<tr><th>Rubro</th>${meses.map(m => `<th class="num">${MES_CORTO[m]}</th>`).join("")}
    <th class="num">Acumulado</th><th class="num">Presupuesto ${p.anio}</th><th class="num">% ejecutado</th><th class="num">Por ejecutar</th></tr>`;
  const filaDatos = (nombre, arr, pres, clase, tipo) => {
    const acu = acumulado(arr, ultimo);
    const v = pres ? acu / pres : null;
    const marca = tipo === "gasto" && ultimo && ((v === null && acu > 0) || (v !== null && v > esperado + TOLERANCIA))
      ? ` <span class="alerta-txt" title="Por encima de lo esperado a la fecha">▲</span>` : "";
    return `<tr class="${clase}"><td>${esc(nombre)}</td>${meses.map(m => celda(arr[m])).join("")}
      <td class="num"><b>${pesos(acu)}</b></td><td class="num">${pesos(pres)}</td>
      <td class="num">${v === null ? (acu ? "Sin presupuesto" : "") : pct(v)}${marca}</td><td class="num">${pesos(pres - acu)}</td></tr>`;
  };
  const sumaArr = lista => Array.from({ length: 12 }, (_, m) => lista.every(a => a[m] === null) ? null : lista.reduce((s, a) => s + (a[m] || 0), 0));
  const vacio = Array(12).fill(null);
  const arrDe = r => (ultimo ? valores[r.tipo + "|" + r.rubro] : vacio);
  let cuerpo = "";
  const totales = {};
  for (const [tipo, titulo] of [["ingreso", "Ingresos"], ["gasto", "Gastos"]]) {
    const deTipo = rubros.filter(r => r.tipo === tipo);
    if (!deTipo.length) continue;
    cuerpo += `<tr class="fila-tipo"><th colspan="${meses.length + 5}">${titulo}</th></tr>`;
    const grupos = [...new Set(deTipo.map(r => r.grupo))];
    for (const g of grupos) {
      const lista = deTipo.filter(r => r.grupo === g && (Number(r.valor_anual) || acumulado(arrDe(r), ultimo) || arrDe(r).some(v => v)));
      if (!lista.length) continue;
      cuerpo += filaDatos(g, sumaArr(lista.map(arrDe)), lista.reduce((a, r) => a + Number(r.valor_anual), 0), "fila-grupo", tipo);
      cuerpo += lista.map(r => filaDatos(r.rubro, arrDe(r), Number(r.valor_anual), "", tipo)).join("");
    }
    totales[tipo] = sumaArr(deTipo.map(arrDe));
    cuerpo += filaDatos(`Total ${titulo.toLowerCase()}`, totales[tipo], presupuestoTipo(rubros, tipo), "fila-total", "");
  }
  if (totales.ingreso && totales.gasto) {
    const res = totales.ingreso.map((v, m) => v === null ? null : v - (totales.gasto[m] || 0));
    cuerpo += `<tr class="fila-total"><td>Resultado (ingresos − gastos)</td>${meses.map(m => res[m] === null ? `<td class="num m">—</td>` : `<td class="num">${pesos(res[m])}</td>`).join("")}
      <td class="num"><b>${pesos(acumulado(res, ultimo))}</b></td><td class="num">${pesos(presupuestoTipo(rubros, "ingreso") - presupuestoTipo(rubros, "gasto"))}</td><td></td><td></td></tr>`;
  }
  return `<div class="panel bloque"><h2>Ejecución rubro por rubro, mes a mes</h2>
    <p class="m">Valores en pesos. "—": mes sin informe publicado. ▲: gasto por encima de lo esperado a la fecha (más de 5 puntos).</p>
    <div class="tablewrap"><table class="tabla-ejecucion"><thead>${cabeza}</thead><tbody>${cuerpo}</tbody></table></div></div>`;
}

function tablaMeses(informes) {
  return `<div class="panel bloque"><h2>Resumen por mes</h2><div class="tablewrap"><table>
    <thead><tr><th>Mes</th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Resultado</th><th class="num">Pagos realizados</th></tr></thead>
    <tbody>${informes.map(i => `<tr><td>${MES[i.mes - 1][0].toUpperCase() + MES[i.mes - 1].slice(1)}</td><td class="num">${pesos(i.total_ingresos)}</td>
      <td class="num">${pesos(i.total_gastos)}</td><td class="num">${pesos(i.total_ingresos - i.total_gastos)}</td>
      <td class="num">${i.total_pagos === null ? `<span class="m">No cargados</span>` : pesos(i.total_pagos)}</td></tr>`).join("")}</tbody>
  </table></div></div>`;
}

function seccionPagos(informes, inf, pagos) {
  const selector = `<label for="fin-mes">Mes</label><select id="fin-mes" class="selector-corto">${informes.map(i =>
    `<option value="${i.mes}" ${i.mes === inf?.mes ? "selected" : ""}>${MES[i.mes - 1]} ${i.anio}</option>`).join("")}</select>`;
  const cuerpo = !pagos.length ? `<div class="panel nota">La administración no cargó el detalle de pagos de ${MES[inf.mes - 1]}.</div>`
    : `<div class="tablewrap"><table>
      <thead><tr><th>Fecha</th><th>Rubro</th><th>Beneficiario</th><th>Concepto</th><th class="num">Valor</th></tr></thead>
      <tbody>${pagos.map(x => `<tr><td>${x.fecha ? fecha(x.fecha) : ""}</td><td>${esc(x.rubro)}</td><td>${x.beneficiario ? esc(x.beneficiario) : `<span class="m">—</span>`}</td>
        <td>${esc(x.concepto || "")}</td><td class="num">${pesos(x.valor)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th colspan="4">Total pagado en ${MES[inf.mes - 1]}</th><th class="num">${pesos(pagos.reduce((a, x) => a + Number(x.valor), 0))}</th></tr></tfoot>
    </table></div>
    <p class="m">Los pagos a personas (administrador, contadora, abogado, etc.) se muestran por su rubro, sin nombre, por protección de datos personales.</p>`;
  return `<div class="panel bloque"><h2>Pagos realizados en el mes</h2>${selector}${cuerpo}</div>`;
}

activarRecuadros(caja);

caja.addEventListener("click", async e => {
  const b = e.target.closest("[data-vista]");
  if (!b || b.dataset.vista === vista) return;
  vista = b.dataset.vista;
  try { await pintar(); } catch (err) { aviso(caja, err.message, "error"); }
});

caja.addEventListener("change", async e => {
  if (e.target.id === "fin-anio") { anio = +e.target.value; mesPagos = null; }
  else if (e.target.id === "fin-mes") mesPagos = +e.target.value;
  else return;
  try { await pintar(); } catch (err) { aviso(caja, err.message, "error"); }
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    if (!estado.autorizacion_vigente) { location.replace("mi-hogar.html?hogar=1"); return; }
    if (!estado.es_admin && !estado.es_consejo && !casasActivas(estado).length) {
      caja.innerHTML = barraCuenta(estado, "Informes financieros", "finanzas.html")
        + `<div class="panel nota">Los informes financieros los ven los propietarios y arrendatarios con cuenta aprobada. <a href="mi-hogar.html?hogar=1">Ir a Mi hogar</a></div>`;
      return;
    }
    presupuestos = await consulta(sb.from("presupuestos").select("id,anio,aprobado_en,nota").eq("estado", "publicado").order("anio", { ascending: false }));
    anio = presupuestos[0]?.anio ?? null;
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
