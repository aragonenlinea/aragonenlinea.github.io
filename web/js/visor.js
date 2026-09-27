// Visor de documentos (visor.html?doc=documentos/archivo.pdf).
// Muestra el PDF dentro del sitio con PDF.js, sin necesidad de descargarlo.
// Descargar es opcional (botón "Descargar").
import { montarPagina, cargar, esc, fecha } from "./comun.js";

// Versión fija de PDF.js en cdnjs. Para actualizarla, cambie solo este número.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289";

const caja = document.getElementById("visor");
let pdf = null;
let zoom = 1;          // 1 = ancho de la pantalla
const paginas = [];    // { canvas, pintada }

// Solo se aceptan PDF de la carpeta documentos/ del propio sitio.
function rutaValida(doc) {
  return /^documentos\/[a-z0-9][a-z0-9._-]*\.pdf$/i.test(doc || "") && !doc.includes("..");
}

function barra(titulo, doc, detalle) {
  return `<div class="visor-barra">
    <div class="visor-titulo">
      <a class="btn sm ghost" href="documentos.html" id="volver">← Documentos</a>
      <div><h1>${esc(titulo)}</h1>${detalle ? `<p class="m">${detalle}</p>` : ""}</div>
    </div>
    <div class="row visor-acciones">
      <button class="btn sm ghost" type="button" data-zoom="-1" aria-label="Reducir">−</button>
      <span class="m" id="zoomTxt">100 %</span>
      <button class="btn sm ghost" type="button" data-zoom="1" aria-label="Ampliar">+</button>
      <a class="btn sm" href="${esc(doc)}" download>Descargar</a>
    </div>
  </div>
  <div id="hojas" class="visor-hojas" aria-live="polite"><p class="m">Cargando documento…</p></div>`;
}

async function pintar(n) {
  const p = paginas[n];
  if (!p || p.pintada === zoom) return;
  p.pintada = zoom;
  const page = await pdf.getPage(n + 1);
  const base = page.getViewport({ scale: 1 });
  const ancho = document.getElementById("hojas").clientWidth;
  const escala = (ancho / base.width) * zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = page.getViewport({ scale: escala * dpr });
  p.canvas.width = Math.floor(vp.width);
  p.canvas.height = Math.floor(vp.height);
  p.canvas.style.width = Math.floor(vp.width / dpr) + "px";
  p.canvas.style.height = Math.floor(vp.height / dpr) + "px";
  const ctx = p.canvas.getContext("2d");
  await page.render({ canvas: p.canvas, canvasContext: ctx, viewport: vp }).promise;
}

let vista = null;

function prepararHojas() {
  const hojas = document.getElementById("hojas");
  hojas.innerHTML = "";
  paginas.length = 0;
  if (vista) vista.disconnect();
  vista = new IntersectionObserver(entradas => {
    for (const e of entradas) if (e.isIntersecting) pintar(+e.target.dataset.n);
  }, { rootMargin: "600px 0px" });
  for (let n = 0; n < pdf.numPages; n++) {
    const canvas = document.createElement("canvas");
    canvas.className = "visor-hoja";
    canvas.dataset.n = n;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Página ${n + 1} de ${pdf.numPages}`);
    hojas.appendChild(canvas);
    paginas.push({ canvas, pintada: 0 });
    vista.observe(canvas);
  }
  // Tamaño provisional para que el desplazamiento funcione antes de pintar
  pdf.getPage(1).then(page => {
    const v = page.getViewport({ scale: 1 });
    const alto = hojas.clientWidth * zoom * (v.height / v.width);
    for (const p of paginas) if (!p.pintada) { p.canvas.style.width = (hojas.clientWidth * zoom) + "px"; p.canvas.style.height = alto + "px"; }
  });
}

function cambiarZoom(paso) {
  const niveles = [1, 1.5, 2, 3];
  const i = Math.max(0, Math.min(niveles.length - 1, niveles.indexOf(zoom) + paso));
  if (niveles[i] === zoom) return;
  zoom = niveles[i];
  document.getElementById("zoomTxt").textContent = Math.round(zoom * 100) + " %";
  for (const p of paginas) p.pintada = 0;
  prepararHojas();
}

async function iniciar() {
  await montarPagina();
  const doc = new URLSearchParams(location.search).get("doc");
  if (!rutaValida(doc)) {
    caja.innerHTML = `<div class="panel error"><h1>Documento no encontrado</h1><p>La dirección no corresponde a un documento del sitio.</p><a class="btn" href="documentos.html">Ver documentos</a></div>`;
    return;
  }

  // Busca el título en la lista de documentos; si no está, usa el nombre del archivo.
  let titulo = doc.split("/").pop().replace(/\.pdf$/i, "").replace(/-/g, " ");
  let detalle = "";
  try {
    const d = (await cargar("documentos")).find(x => x.archivo === doc);
    if (d) { titulo = d.titulo; detalle = d.fecha ? `Fecha: ${fecha(d.fecha)}` : ""; }
  } catch (e) { /* sin lista, se usa el nombre del archivo */ }
  document.title = `${titulo} | Aragón en línea`;
  caja.innerHTML = barra(titulo, doc, detalle);

  if (document.referrer.startsWith(location.origin)) {
    document.getElementById("volver").addEventListener("click", e => { e.preventDefault(); history.back(); });
  }
  caja.addEventListener("click", e => {
    const b = e.target.closest("[data-zoom]");
    if (b && pdf) cambiarZoom(+b.dataset.zoom);
  });

  try {
    const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
    pdf = await pdfjs.getDocument({
      url: doc,
      isEvalSupported: false,
      cMapUrl: `${PDFJS}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS}/standard_fonts/`
    }).promise;
    prepararHojas();
    let espera;
    window.addEventListener("resize", () => {
      clearTimeout(espera);
      espera = setTimeout(() => { for (const p of paginas) p.pintada = 0; prepararHojas(); }, 250);
    });
  } catch (err) {
    console.error(err);
    document.getElementById("hojas").innerHTML = `<div class="panel error"><p>No se pudo mostrar el documento aquí.</p>
      <div class="row"><a class="btn" href="${esc(doc)}" target="_blank" rel="noopener">Abrir en el navegador</a><a class="btn ghost" href="${esc(doc)}" download>Descargar</a></div></div>`;
  }
}

iniciar();
