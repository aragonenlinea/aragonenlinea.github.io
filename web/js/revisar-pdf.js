// Revisión de un PDF en el navegador antes de subirlo al espacio privado:
//  1. Borra los datos ocultos del archivo (autor, título, programa, XMP) con pdf-lib.
//  2. Lee el texto de cada página con PDF.js y busca posibles datos personales:
//     correos y celulares que no sean institucionales (web/datos/datos_permitidos.json)
//     y números de cédula escritos junto a "C.C.", "cédula", "identificado", etc.
// No detecta nombres de personas, firmas ni fotos: eso sigue siendo revisión humana.
// Es la misma idea de herramientas/revisar_pdfs.py; en documentos financieros no se marcan
// las cifras en pesos (12.345.678) como cédulas si no tienen una de esas palabras al lado.
import { cargar } from "./comun.js";

const PDFLIB = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289";
export const MAXIMO = 50 * 1024 * 1024;   // límite del espacio privado en Supabase

const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const CELULAR = /(?<![\d.])3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;
const CEDULA = /(?:\bc\.?\s?c\.?|c[ée]dula(?:\s+de\s+ciudadan[íi]a)?|identificad[oa]\s+con|identificaci[óo]n|documento\s+de\s+identidad|\bT\.?I\.?)\s*(?:No\.?|n[úu]mero|#)?\s*[:.]?\s*(\d{1,3}(?:[.\s]\d{3}){1,3}|\d{6,11})/gi;
const digitos = s => String(s).replace(/\D/g, "");

let permitidos = null;
async function listaPermitidos() {
  if (!permitidos) {
    try { permitidos = await cargar("datos_permitidos"); } catch (e) { permitidos = { correos: [], telefonos: [], numeros: [] }; }
  }
  return {
    correos: new Set((permitidos.correos || []).map(c => c.toLowerCase())),
    telefonos: new Set((permitidos.telefonos || []).map(digitos)),
    numeros: new Set((permitidos.numeros || []).map(digitos))
  };
}

// Devuelve { bytes, paginas, hallazgos: [{pagina, tipo, valor}], paginasSinTexto, metadatos: [...] }
// o lanza un Error con un mensaje para la persona.
export async function revisarPdf(archivo) {
  if (!/\.pdf$/i.test(archivo.name) && archivo.type !== "application/pdf") throw new Error("El archivo debe ser un PDF.");
  if (archivo.size > MAXIMO) throw new Error("El PDF pesa más de 50 MB. Redúzcalo (por ejemplo, guardándolo con menor calidad) y vuelva a intentarlo.");
  const original = new Uint8Array(await archivo.arrayBuffer());

  // 1. Datos ocultos
  const { PDFDocument, PDFName } = await import(PDFLIB);
  let doc;
  try {
    doc = await PDFDocument.load(original, { updateMetadata: false });
  } catch (e) {
    if (/encrypt/i.test(e.message || "")) throw new Error("El PDF está protegido con contraseña o permisos. Quite la protección y vuelva a cargarlo.");
    throw new Error("No se pudo abrir el PDF. Puede estar dañado; ábralo y guárdelo de nuevo como PDF.");
  }
  const metadatos = [["Autor", doc.getAuthor()], ["Título", doc.getTitle()], ["Asunto", doc.getSubject()],
                     ["Palabras clave", doc.getKeywords()], ["Programa", doc.getCreator()]]
    .filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).trim()}`);
  doc.setAuthor(""); doc.setTitle(""); doc.setSubject(""); doc.setKeywords([]); doc.setCreator(""); doc.setProducer("");
  if (doc.catalog.has(PDFName.of("Metadata"))) { doc.catalog.delete(PDFName.of("Metadata")); metadatos.push("Datos XMP"); }
  const bytes = await doc.save({ useObjectStreams: false });

  // 2. Texto de cada página
  const { hallazgos, paginasImagen, paginas } = await buscarDatos(bytes);
  return { bytes, paginas, hallazgos, paginasSinTexto: paginasImagen.length, paginasImagen, metadatos };
}

export async function cargarPdfjs() {
  const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  return pdfjs;
}

// Busca correos, celulares y cédulas en el texto de cada página y guarda dónde están
// (recuadros en coordenadas de la página a escala 1, con el origen arriba a la izquierda),
// para poder taparlos después. Las páginas casi sin texto se reportan como imagen.
const regla = document.createElement("canvas").getContext("2d");
regla.font = "100px Arial, Helvetica, sans-serif";
const medir = s => regla.measureText(s).width;

export async function buscarDatos(bytes) {
  const pdfjs = await cargarPdfjs();
  const tarea = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await tarea.promise;
  const ok = await listaPermitidos();
  const hallazgos = [], paginasImagen = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const vista = pagina.getViewport({ scale: 1 });
    const items = (await pagina.getTextContent()).items;
    // Texto de la página y en qué posición del texto empieza cada pedazo.
    let texto = "";
    const rangos = [];
    for (const it of items) {
      rangos.push({ ini: texto.length, fin: texto.length + it.str.length, it });
      texto += it.str + (it.hasEOL ? "\n" : " ");
    }
    if (texto.replace(/\s/g, "").length < 20) { paginasImagen.push(n); continue; }
    // Recuadro del texto entre las posiciones ini y fin. Dentro de cada pedazo, la posición se estima
    // midiendo el texto con una letra común (las letras no ocupan todas lo mismo) y con un margen.
    const cajas = (ini, fin) => rangos.filter(r => r.fin > ini && r.ini < fin && r.it.str.length).map(r => {
      const [a, b, c, d, e, f] = r.it.transform;
      const alto = Math.hypot(c, d) || r.it.height || 10;
      const ancho = r.it.width || alto * r.it.str.length * 0.5;
      const total = medir(r.it.str) || 1;
      const x1 = e + ancho * medir(r.it.str.slice(0, Math.max(ini, r.ini) - r.ini)) / total;
      const x2 = e + ancho * medir(r.it.str.slice(0, Math.min(fin, r.fin) - r.ini)) / total;
      const margen = alto * 0.35;
      // Esquinas del recuadro (en PDF el origen está abajo; en pantalla, arriba). PDF.js 6 solo convierte puntos.
      const [p, q] = vista.convertToViewportPoint(x1 - margen, f - alto * 0.3);
      const [s, u] = vista.convertToViewportPoint(x2 + margen, f + alto * 1.05);
      return [Math.min(p, s), Math.min(q, u), Math.max(p, s), Math.max(q, u)];
    });
    const porValor = new Map();
    const agregar = (tipo, valor, ini, fin) => {
      const k = tipo + "|" + valor;
      if (!porValor.has(k)) { const h = { pagina: n, tipo, valor, cajas: [] }; porValor.set(k, h); hallazgos.push(h); }
      porValor.get(k).cajas.push(...cajas(ini, fin));
    };
    for (const m of texto.matchAll(CORREO)) if (!ok.correos.has(m[0].toLowerCase())) agregar("correo", m[0], m.index, m.index + m[0].length);
    for (const m of texto.matchAll(CELULAR)) if (!ok.telefonos.has(digitos(m[0]))) agregar("celular", m[0].trim(), m.index, m.index + m[0].length);
    for (const m of texto.matchAll(CEDULA)) {
      if (ok.numeros.has(digitos(m[1]))) continue;
      const ini = m.index + m[0].lastIndexOf(m[1]);
      agregar("cédula", m[0].replace(/\s+/g, " ").trim(), ini, ini + m[1].length);
    }
  }
  const paginas = pdf.numPages;
  await tarea.destroy();
  return { hallazgos, paginasImagen, paginas };
}
