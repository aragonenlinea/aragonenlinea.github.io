// Tablero de cartera: totales, antigüedad y evolución corte a corte (sin casas ni nombres).
// Con "detalle" (solo la administración) agrega el mapa de las 40 casas.
import { esc, fecha } from "./comun.js";
import { pesos } from "./cuenta.js";
import { lugar, lineas, apiladas, leyenda, corto } from "./graficos.js";

export const EDADES = [["mora_1_30", "1-30 días", "r1"], ["mora_31_90", "31-90 días", "r2"], ["mora_91_180", "91-180 días", "r3"],
                       ["mora_181_360", "181-360 días", "r4"], ["mora_mas_360", "Más de 360 días", "r5"], ["sin_clasificar", "Sin clasificar", "r0"]];
const pct = v => (v * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " %";
const corte = h => h.periodo || fecha(h.fecha_corte);
const mas90 = e => Number(e.mora_91_180 || 0) + Number(e.mora_181_360 || 0) + Number(e.mora_mas_360 || 0);

function variacion(actual, anterior, subirEsMalo = true) {
  if (anterior === undefined || anterior === null) return "";
  const d = actual - anterior;
  if (!d) return `<div class="tendencia">Igual que el corte anterior</div>`;
  const malo = subirEsMalo ? d > 0 : d < 0;
  return `<div class="tendencia ${malo ? "mal" : "bien"}">${d > 0 ? "▲ Subió" : "▼ Bajó"} ${pesos(Math.abs(d))} frente al corte anterior</div>`;
}

export function tableroCartera(historial, detalle = null) {
  if (!historial?.length) return `<div class="panel nota">Aún no hay cartera publicada.</div>`;
  const h = historial.at(-1), prev = historial.at(-2);
  const e = h.edades || {};
  const total = Number(h.cartera_total);
  const deuda90 = mas90(e);

  const kpis = `<div class="kpis">
    <div class="panel kpi destacado"><div class="n">${pesos(total)}</div><div class="l">Cartera por cobrar al ${fecha(h.fecha_corte)}</div>${variacion(total, prev?.cartera_total)}</div>
    <div class="panel kpi"><div class="n">${h.casas_al_dia}<small>/40</small></div><div class="l">Casas al día</div>
      <div class="medidor" aria-hidden="true"><div data-ancho="${h.casas_al_dia / 40 * 100}"></div></div></div>
    <div class="panel kpi"><div class="n">${h.casas_en_mora}</div><div class="l">Casas con saldo pendiente</div>${prev ? `<div class="tendencia">${prev.casas_en_mora} en el corte anterior</div>` : ""}</div>
    <div class="panel kpi"><div class="n">${total ? pct(deuda90 / total) : "0 %"}</div><div class="l">De la deuda tiene más de 90 días (${pesos(deuda90)}, ${h.casas_mora_mas_90} casas)</div></div>
    ${Number(h.saldos_a_favor) ? `<div class="panel kpi"><div class="n">${pesos(h.saldos_a_favor)}</div><div class="l">Pagado por anticipado (saldos a favor)</div></div>` : ""}
  </div>`;

  const filasEdad = EDADES.map(([k, t, c]) => [t, Number(e[k] || 0), c]).filter(([t, v]) => v || t !== "Sin clasificar");
  const maxEdad = Math.max(1, ...filasEdad.map(([, v]) => v));
  const antiguedad = `<div class="panel">
    <h3>¿Qué tan vieja es la deuda?</h3>
    <p class="m">Corte al ${fecha(h.fecha_corte)}. Entre más vieja, más difícil de recuperar.</p>
    <div class="barras">${filasEdad.map(([t, v, c]) => `<div class="barra-fila" tabindex="0" data-tip="${esc(`${t}: ${pesos(v)} (${total ? pct(v / total) : "0 %"} de la cartera)`)}">
      <div class="barra-nombre">${t}</div>
      <div class="barra-pista"><div class="barra-valor ${c}" data-ancho="${v / maxEdad * 100}"></div></div>
      <div class="barra-texto">${pesos(v)} · ${total ? pct(v / total) : "0 %"}</div></div>`).join("")}</div>
  </div>`;

  const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const cats = historial.map(x => MES_CORTO[+x.fecha_corte.slice(5, 7) - 1] + " " + x.fecha_corte.slice(2, 4));
  const nombres = historial.map(corte);
  const evolucion = historial.length < 2
    ? `<div class="panel"><h3>Evolución de la cartera</h3><div class="nota">La evolución se verá cuando haya dos o más cortes publicados.</div></div>`
    : `<div class="panel"><h3>Evolución de la cartera</h3><p class="m">Total por cobrar en cada corte.</p>
      ${lugar(lineas({ titulo: "Evolución de la cartera por corte", categorias: cats,
        series: [{ nombre: "Cartera por cobrar", clase: "c1", valores: historial.map(x => Number(x.cartera_total)) }],
        tip: i => `${nombres[i]}: ${pesos(historial[i].cartera_total)} · ${historial[i].casas_en_mora} casas con saldo` }), 240)}</div>`;

  const capas = EDADES.map(([k, t, c]) => ({ nombre: t, clase: c, valores: historial.map(x => Number(x.edades?.[k] || 0)) }))
    .filter(c => c.valores.some(v => v));
  const apilado = historial.length < 2 || !capas.length ? "" : `<div class="panel bloque"><h3>Antigüedad de la deuda, corte a corte</h3>
    ${leyenda(capas)}
    ${lugar(apiladas({ titulo: "Antigüedad de la deuda por corte", categorias: cats, capas,
      tip: i => `${nombres[i]}: ` + capas.filter(c => c.valores[i]).map(c => `${c.nombre} ${corto(c.valores[i])}`).join(" · ") }), 260)}</div>`;

  return `<h2>Cartera · corte al ${fecha(h.fecha_corte)}</h2>${kpis}
    <div class="grid g2 bloque-sm">${antiguedad}${evolucion}</div>${apilado}${detalle ? mapaCasas(detalle, h) : ""}`;
}

// Mapa de las 40 casas (solo administración): color según la deuda más vieja de cada casa.
const ESTADOS = [["t-ok", "Al día o a favor"], ["t-1", "Debe 1-30 días"], ["t-2", "Debe 31-90 días"], ["t-3", "Debe más de 90 días"], ["t-sc", "Debe (sin antigüedad)"]];
function estadoCasa(d) {
  if (!d || Number(d.saldo_total) <= 0) return "t-ok";
  if (mas90(d) > 0) return "t-3";
  if (Number(d.mora_31_90 || 0) > 0) return "t-2";
  if (Number(d.mora_1_30 || 0) > 0) return "t-1";
  return "t-sc";
}
function mapaCasas(detalle, h) {
  const por = new Map(detalle.map(d => [d.unidad_id, d]));
  const icono = { "t-ok": "✓", "t-1": "•", "t-2": "!", "t-3": "‼", "t-sc": "?" };
  return `<div class="panel bloque"><h3>Mapa de las 40 casas · corte al ${fecha(h.fecha_corte)}</h3>
    <p class="m">Solo lo ve la administración. Toque una casa para ver su saldo.</p>
    <div class="leyenda">${ESTADOS.map(([c, t]) => `<span><i class="casilla ${c}" aria-hidden="true">${icono[c]}</i>${t}</span>`).join("")}</div>
    <div class="mapa-casas">${Array.from({ length: 40 }, (_, i) => {
      const d = por.get(i + 1), c = estadoCasa(d), s = Number(d?.saldo_total || 0);
      const txt = s > 0 ? `Casa ${i + 1}: debe ${pesos(s)}` : s < 0 ? `Casa ${i + 1}: saldo a favor ${pesos(-s)}` : `Casa ${i + 1}: al día`;
      return `<div class="casa-mapa ${c}" tabindex="0" data-tip="${esc(txt + (c !== "t-ok" ? " · " + ESTADOS.find(x => x[0] === c)[1].toLowerCase() : ""))}">
        <b>${i + 1}</b><span>${s > 0 ? corto(s) : icono[c]}</span></div>`;
    }).join("")}</div></div>`;
}
