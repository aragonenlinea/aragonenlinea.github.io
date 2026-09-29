// "Tapar datos": la administración marca con recuadros negros lo que no se debe publicar
// (los datos encontrados ya vienen marcados) y la plataforma genera un PDF nuevo donde las
// páginas marcadas se convierten en imagen con los recuadros encima: el texto de debajo deja
// de existir, no queda escondido. Las páginas sin recuadros se copian intactas.
// Todo ocurre en el navegador: el original sin tapar no sale del computador.
import { cargarPdfjs } from "./revisar-pdf.js";

const PDFLIB = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const CALIDAD = 2;          // escala de la imagen de las páginas tapadas (2 ≈ 144 puntos por pulgada)
const MINIMO = 6;           // tamaño mínimo (en pantalla) de un recuadro dibujado

/**
 * Muestra el editor dentro de `cont`.
 * @param bytes      PDF (ya sin datos ocultos)
 * @param hallazgos  [{pagina, cajas: [[x1,y1,x2,y2], …]}] en coordenadas de la página a escala 1
 * @param alTerminar función(resultado|null): resultado = { bytes, paginasTapadas: [n…], recuadros }
 */
export async function abrirTapado(cont, bytes, hallazgos, alTerminar) {
  const pdfjs = await cargarPdfjs();
  const tarea = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await tarea.promise;
  const marcas = new Map();   // página (1…n) → [[x1,y1,x2,y2], …]
  for (const h of hallazgos) for (const c of h.cajas || []) {
    if (!marcas.has(h.pagina)) marcas.set(h.pagina, []);
    marcas.get(h.pagina).push(c);
  }

  cont.innerHTML = `<div class="tapar">
      <div class="tapar-barra">
        <div><b>Tapar datos</b> · <span id="tapar-cuenta"></span>
          <p class="m">Arrastre el mouse sobre lo que se debe tapar (nombres, firmas, cédulas, teléfonos, cuentas). Para quitar un recuadro, haga clic sobre él. Los datos encontrados ya vienen marcados.</p></div>
        <div class="row"><button class="btn" type="button" id="tapar-aplicar">Aplicar tapado</button>
          <button class="btn ghost" type="button" id="tapar-cancelar">Cancelar</button></div>
      </div>
      <div id="tapar-msg"></div>
      <div class="tapar-hojas" id="tapar-hojas"></div>
    </div>`;
  const hojas = cont.querySelector("#tapar-hojas");
  const cuenta = () => {
    const total = [...marcas.values()].reduce((a, l) => a + l.length, 0);
    const pags = [...marcas.values()].filter(l => l.length).length;
    cont.querySelector("#tapar-cuenta").textContent = total ? `${total} recuadro(s) en ${pags} página(s)` : "sin recuadros";
  };
  cuenta();

  const ancho = Math.min(900, hojas.clientWidth || 800);
  const vistas = [];
  const pintarCajas = (n, capa, escala) => {
    capa.querySelectorAll(".tapar-caja").forEach(e => e.remove());
    (marcas.get(n) || []).forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tapar-caja"; b.title = "Quitar este recuadro";
      b.setAttribute("aria-label", `Quitar recuadro ${i + 1} de la página ${n}`);
      Object.assign(b.style, { left: c[0] * escala + "px", top: c[1] * escala + "px",
        width: (c[2] - c[0]) * escala + "px", height: (c[3] - c[1]) * escala + "px" });
      b.addEventListener("click", e => { e.stopPropagation(); marcas.get(n).splice(i, 1); pintarCajas(n, capa, escala); cuenta(); });
      capa.appendChild(b);
    });
  };

  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const v1 = pagina.getViewport({ scale: 1 });
    const escala = ancho / v1.width;
    const hoja = document.createElement("div");
    hoja.className = "tapar-hoja";
    Object.assign(hoja.style, { width: ancho + "px", height: v1.height * escala + "px" });
    const canvas = document.createElement("canvas");
    const capa = document.createElement("div");
    capa.className = "tapar-capa";
    const rotulo = document.createElement("div");
    rotulo.className = "tapar-rotulo"; rotulo.textContent = `Página ${n} de ${pdf.numPages}`;
    hoja.append(canvas, capa);
    hojas.append(rotulo, hoja);
    vistas.push({ n, pagina, escala, canvas, capa, pintada: false });
    pintarCajas(n, capa, escala);

    // Dibujar un recuadro arrastrando.
    let inicio = null, temporal = null;
    const punto = e => { const r = capa.getBoundingClientRect(); return [Math.max(0, Math.min(r.width, e.clientX - r.left)), Math.max(0, Math.min(r.height, e.clientY - r.top))]; };
    capa.addEventListener("pointerdown", e => {
      if (e.target !== capa) return;
      inicio = punto(e); capa.setPointerCapture(e.pointerId);
      temporal = document.createElement("div"); temporal.className = "tapar-caja nueva"; capa.appendChild(temporal);
    });
    capa.addEventListener("pointermove", e => {
      if (!inicio) return;
      const [x, y] = punto(e);
      Object.assign(temporal.style, { left: Math.min(x, inicio[0]) + "px", top: Math.min(y, inicio[1]) + "px",
        width: Math.abs(x - inicio[0]) + "px", height: Math.abs(y - inicio[1]) + "px" });
    });
    capa.addEventListener("pointerup", e => {
      if (!inicio) return;
      const [x, y] = punto(e);
      temporal.remove(); temporal = null;
      if (Math.abs(x - inicio[0]) >= MINIMO && Math.abs(y - inicio[1]) >= MINIMO) {
        if (!marcas.has(n)) marcas.set(n, []);
        marcas.get(n).push([Math.min(x, inicio[0]) / escala, Math.min(y, inicio[1]) / escala, Math.max(x, inicio[0]) / escala, Math.max(y, inicio[1]) / escala]);
        pintarCajas(n, capa, escala); cuenta();
      }
      inicio = null;
    });
  }

  // Pinta las páginas a medida que aparecen en pantalla (documentos largos).
  const observador = new IntersectionObserver(async entradas => {
    for (const en of entradas) {
      if (!en.isIntersecting) continue;
      const v = vistas.find(x => x.capa.parentElement === en.target);
      if (!v || v.pintada) continue;
      v.pintada = true;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = v.pagina.getViewport({ scale: v.escala * dpr });
      v.canvas.width = Math.floor(vp.width); v.canvas.height = Math.floor(vp.height);
      await v.pagina.render({ canvas: v.canvas, canvasContext: v.canvas.getContext("2d"), viewport: vp }).promise;
    }
  }, { rootMargin: "400px 0px" });
  vistas.forEach(v => observador.observe(v.capa.parentElement));

  const terminar = async resultado => { observador.disconnect(); await tarea.destroy(); alTerminar(resultado); };
  cont.querySelector("#tapar-cancelar").addEventListener("click", () => terminar(null));
  cont.querySelector("#tapar-aplicar").addEventListener("click", async e => {
    const tapadas = [...marcas.entries()].filter(([, l]) => l.length).map(([n]) => n).sort((a, b) => a - b);
    const msg = cont.querySelector("#tapar-msg");
    if (!tapadas.length) { msg.innerHTML = `<div class="aviso info">No hay recuadros. Dibuje al menos uno o presione Cancelar.</div>`; return; }
    e.target.disabled = true;
    msg.innerHTML = `<div class="aviso info">Generando el PDF tapado…</div>`;
    try {
      const { PDFDocument } = await import(PDFLIB);
      const origen = await PDFDocument.load(bytes, { updateMetadata: false });
      const nuevo = await PDFDocument.create({ updateMetadata: false });
      // Las páginas sin recuadros se copian todas de una vez: así las letras y demás recursos que
      // comparten se copian una sola vez (copiarlas una por una multiplica el tamaño del archivo).
      // Se arma un documento NUEVO a propósito: si se editara el original, el texto de las páginas
      // tapadas podría seguir guardado dentro del archivo aunque ya no se viera.
      const intactas = [];
      for (let n = 1; n <= pdf.numPages; n++) if (!(marcas.get(n) || []).length) intactas.push(n - 1);
      const copiadas = new Map((await nuevo.copyPages(origen, intactas)).map((p, i) => [intactas[i] + 1, p]));
      for (let n = 1; n <= pdf.numPages; n++) {
        const cajas = marcas.get(n) || [];
        if (!cajas.length) { nuevo.addPage(copiadas.get(n)); continue; }
        const pagina = await pdf.getPage(n);
        const vp = pagina.getViewport({ scale: CALIDAD });
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.ceil(vp.width); lienzo.height = Math.ceil(vp.height);
        const ctx = lienzo.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        await pagina.render({ canvas: lienzo, canvasContext: ctx, viewport: vp }).promise;
        ctx.fillStyle = "#000000";
        for (const [x1, y1, x2, y2] of cajas) ctx.fillRect(x1 * CALIDAD, y1 * CALIDAD, (x2 - x1) * CALIDAD, (y2 - y1) * CALIDAD);
        const jpg = await new Promise(r => lienzo.toBlob(r, "image/jpeg", 0.9));
        const imagen = await nuevo.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
        const v1 = pagina.getViewport({ scale: 1 });
        const hoja = nuevo.addPage([v1.width, v1.height]);
        hoja.drawImage(imagen, { x: 0, y: 0, width: v1.width, height: v1.height });
        lienzo.width = lienzo.height = 0;   // libera memoria
      }
      nuevo.setProducer(""); nuevo.setCreator("");
      const salida = await nuevo.save({ useObjectStreams: false });
      const recuadros = tapadas.reduce((a, n) => a + marcas.get(n).length, 0);
      await terminar({ bytes: salida, paginasTapadas: tapadas, recuadros });
    } catch (err) {
      console.error(err);
      e.target.disabled = false;
      msg.innerHTML = `<div class="aviso error">No se pudo generar el PDF tapado. Intente de nuevo; si el documento es muy largo, tape por partes.</div>`;
    }
  });
}
