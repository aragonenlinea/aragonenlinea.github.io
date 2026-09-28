// Gráficos sencillos en SVG, sin librerías: columnas, columnas apiladas y líneas.
// Cómo se usa: en el HTML se pone lugar(columnas({...})); después de insertar el HTML en la
// página se llama dibujar(contenedor). Cada gráfico se dibuja al ancho real de su caja y se
// vuelve a dibujar si cambia el tamaño de la ventana (así se lee bien en celular).
// Los colores vienen de clases CSS (la política de seguridad de la página no permite estilos en línea).
import { esc } from "./comun.js";

const dibujos = new Map();
let contador = 0;

export function lugar(dibujo, alto = 260) {
  const id = "g" + (++contador);
  dibujos.set(id, { dibujo, alto });
  return `<div class="grafico-svg" data-grafico="${id}"></div>`;
}

export function dibujar(raiz = document) {
  // Anchos de barras HTML (data-ancho / data-izq en %).
  raiz.querySelectorAll("[data-ancho]").forEach(e => { e.style.width = e.dataset.ancho + "%"; });
  raiz.querySelectorAll("[data-izq]").forEach(e => { e.style.left = e.dataset.izq + "%"; });
  raiz.querySelectorAll("[data-grafico]").forEach(el => {
    const g = dibujos.get(el.dataset.grafico);
    if (g) el.innerHTML = g.dibujo(Math.max(280, Math.floor(el.clientWidth)), g.alto);
  });
}
let espera = null;
window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => dibujar(document), 150); });

// $19,8 M · $450 mil · $900
export const corto = v => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3).toLocaleString("es-CO")} mil`;
  return `${s}$${Math.round(a).toLocaleString("es-CO")}`;
};

// Escala "bonita": 4 o 5 divisiones con pasos de 1, 2, 2,5 o 5 × 10^n.
function escala(min, max) {
  if (max === min) max = min + 1;
  const bruto = (max - min) / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= bruto);
  const ini = Math.floor(min / paso) * paso, fin = Math.ceil(max / paso) * paso;
  const marcas = [];
  for (let v = ini; v <= fin + paso / 2; v += paso) marcas.push(Math.round(v));
  return { ini, fin, marcas };
}

export function leyenda(series) {
  return `<div class="leyenda">${series.map(s =>
    `<span><i class="sw ${s.clase}${s.discontinua ? " sw-linea" : ""}" aria-hidden="true"></i>${esc(s.nombre)}</span>`).join("")}</div>`;
}

// Columna con la punta redondeada (4 px) y la base recta sobre el eje.
function columna(x, y0, y1, w, clase, r = 4) {
  const arriba = Math.min(y0, y1), abajo = Math.max(y0, y1), h = abajo - arriba;
  if (h < 0.5) return "";
  const rr = Math.min(r, h, w / 2);
  const d = y1 <= y0
    ? `M${x},${abajo}V${arriba + rr}Q${x},${arriba} ${x + rr},${arriba}H${x + w - rr}Q${x + w},${arriba} ${x + w},${arriba + rr}V${abajo}Z`
    : `M${x},${arriba}V${abajo - rr}Q${x},${abajo} ${x + rr},${abajo}H${x + w - rr}Q${x + w},${abajo} ${x + w},${abajo - rr}V${arriba}Z`;
  return `<path class="${clase}" d="${d}"/>`;
}

function marco(ancho, alto, categorias, min, max, formato) {
  const m = { izq: 58, der: 12, arr: 10, aba: 26 };
  const e = escala(Math.min(0, min), Math.max(0, max));
  const W = ancho - m.izq - m.der, H = alto - m.arr - m.aba;
  const y = v => m.arr + H - (v - e.ini) / (e.fin - e.ini) * H;
  const banda = W / categorias.length;
  const x = i => m.izq + i * banda;
  // Si no caben todas las etiquetas del eje, se muestran una sí y otra no.
  const minimo = Math.max(...categorias.map(c => String(c).length)) * 6.5 + 10;
  const salto = banda < minimo ? Math.ceil(minimo / banda) : 1;
  const ejes = e.marcas.map(v => `<line class="rejilla${v === 0 ? " cero" : ""}" x1="${m.izq}" x2="${ancho - m.der}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="eje" x="${m.izq - 6}" y="${y(v) + 4}" text-anchor="end">${esc(formato(v))}</text>`).join("")
    + categorias.map((c, i) => i % salto ? "" : `<text class="eje" x="${x(i) + banda / 2}" y="${alto - 8}" text-anchor="middle">${esc(c)}</text>`).join("");
  return { m, W, H, y, x, banda, ejes };
}

const svg = (ancho, alto, titulo, cuerpo) =>
  `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img" aria-label="${esc(titulo)}">${cuerpo}</svg>`;

// Zona invisible por categoría (más grande que la marca) que muestra el recuadro con los valores.
const zona = (x, y, w, h, tip) => `<rect class="zona" x="${x}" y="${y}" width="${w}" height="${h}" data-tip="${esc(tip)}"/>`;

/** Columnas agrupadas. series: [{nombre, clase, valores:[...]}]; referencia: {valor, nombre} (línea horizontal). */
export function columnas({ titulo, categorias, series, referencia = null, formato = corto, tip }) {
  return (ancho, alto) => {
    const todos = series.flatMap(s => s.valores).filter(v => v !== null).concat(referencia ? [referencia.valor] : []);
    const f = marco(ancho, alto, categorias, Math.min(...todos), Math.max(...todos), formato);
    const hueco = 2, grupo = f.banda * 0.72, w = (grupo - hueco * (series.length - 1)) / series.length;
    let marcas = "";
    categorias.forEach((c, i) => {
      series.forEach((s, j) => {
        const v = s.valores[i];
        if (v === null || v === undefined) return;
        marcas += columna(f.x(i) + (f.banda - grupo) / 2 + j * (w + hueco), f.y(0), f.y(v), w, "m " + s.clase);
      });
    });
    const ref = referencia ? `<line class="referencia" x1="${f.m.izq}" x2="${ancho - f.m.der}" y1="${f.y(referencia.valor)}" y2="${f.y(referencia.valor)}"/>` : "";
    const zonas = categorias.map((c, i) => zona(f.x(i), f.m.arr, f.banda, f.H, tip(i))).join("");
    return svg(ancho, alto, titulo, f.ejes + marcas + ref + zonas);
  };
}

/** Columnas apiladas. capas: [{nombre, clase, valores}] de abajo hacia arriba. */
export function apiladas({ titulo, categorias, capas, formato = corto, tip }) {
  return (ancho, alto) => {
    const totales = categorias.map((_, i) => capas.reduce((a, c) => a + Math.max(0, c.valores[i] || 0), 0));
    const f = marco(ancho, alto, categorias, 0, Math.max(...totales), formato);
    const w = Math.min(64, f.banda * 0.6);
    let marcas = "";
    categorias.forEach((c, i) => {
      let base = 0;
      const visibles = capas.filter(k => (k.valores[i] || 0) > 0);
      visibles.forEach((k, j) => {
        const v = k.valores[i];
        const x = f.x(i) + (f.banda - w) / 2;
        const y0 = f.y(base), y1 = f.y(base + v);
        // Segmento con 2 px de separación (color de fondo); solo el de arriba lleva la punta redondeada.
        marcas += j === visibles.length - 1 ? columna(x, y0, y1, w, "m seg " + k.clase)
          : `<rect class="m seg ${k.clase}" x="${x}" y="${y1}" width="${w}" height="${Math.max(0, y0 - y1)}"/>`;
        base += v;
      });
    });
    const zonas = categorias.map((c, i) => zona(f.x(i), f.m.arr, f.banda, f.H, tip(i))).join("");
    return svg(ancho, alto, titulo, f.ejes + marcas + zonas);
  };
}

/** Líneas. series: [{nombre, clase, valores (null = sin dato), discontinua}] */
export function lineas({ titulo, categorias, series, formato = corto, tip, etiquetaFinal = true }) {
  return (ancho, alto) => {
    const todos = series.flatMap(s => s.valores).filter(v => v !== null && v !== undefined);
    const f = marco(ancho, alto, categorias, Math.min(0, ...todos), Math.max(...todos), formato);
    const cx = i => f.x(i) + f.banda / 2;
    let trazos = "", puntos = "", finales = [];
    for (const s of series) {
      const pts = s.valores.map((v, i) => v === null || v === undefined ? null : [cx(i), f.y(v)]);
      const d = pts.reduce((a, p, i) => p ? a + (a && pts[i - 1] ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1) : a, "");
      trazos += `<path class="linea ${s.clase}${s.discontinua ? " discontinua" : ""}" d="${d}"/>`;
      if (!s.discontinua) puntos += pts.map(p => p ? `<circle class="punto ${s.clase}" cx="${p[0]}" cy="${p[1]}" r="4"/>` : "").join("");
      const ult = pts.map((p, i) => [p, i]).filter(([p]) => p).at(-1);
      if (ult && etiquetaFinal) finales.push({ y: ult[0][1], x: ult[0][0], texto: formato(s.valores[ult[1]]) });
    }
    // Etiqueta del último valor de cada línea, sin que se monten.
    finales.sort((a, b) => a.y - b.y);
    for (let i = 1; i < finales.length; i++) if (finales[i].y - finales[i - 1].y < 14) finales[i].y = finales[i - 1].y + 14;
    const etiquetas = finales.map(e => `<text class="valor" x="${Math.min(e.x + 8, ancho - 4)}" y="${e.y - 8}" text-anchor="${e.x + 70 > ancho ? "end" : "start"}">${esc(e.texto)}</text>`).join("");
    const zonas = categorias.map((c, i) => zona(f.x(i), f.m.arr, f.banda, f.H, tip(i))).join("");
    return svg(ancho, alto, titulo, f.ejes + trazos + puntos + etiquetas + zonas);
  };
}

// ---------- Recuadro con los valores al pasar el mouse, tocar o enfocar ----------
const recuadro = document.createElement("div");
recuadro.className = "tip"; recuadro.setAttribute("role", "tooltip"); recuadro.hidden = true;
document.body.appendChild(recuadro);   // los módulos corren cuando la página ya cargó

function mostrar(el, x, y) {
  recuadro.textContent = el.dataset.tip; recuadro.hidden = false;
  const ancho = recuadro.offsetWidth;
  recuadro.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - ancho - 8)) + "px";
  recuadro.style.top = (y + 16 + window.scrollY) + "px";
}
export function activarRecuadros(caja) {
  caja.addEventListener("mousemove", e => {
    const el = e.target.closest?.("[data-tip]");
    if (el) mostrar(el, e.clientX, e.clientY); else recuadro.hidden = true;
  });
  caja.addEventListener("mouseleave", () => { recuadro.hidden = true; });
  caja.addEventListener("click", e => {
    const el = e.target.closest?.("[data-tip]");
    if (el) mostrar(el, e.clientX, e.clientY);
  });
  caja.addEventListener("focusin", e => {
    const el = e.target.closest?.("[data-tip]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    mostrar(el, r.left, r.bottom - 8);
  });
  caja.addEventListener("focusout", () => { recuadro.hidden = true; });
}
