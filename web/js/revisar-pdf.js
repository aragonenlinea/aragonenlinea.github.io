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
  const pdfjs = await import(`${PDFJS}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  const tarea = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const pdf = await tarea.promise;
  const ok = await listaPermitidos();
  const hallazgos = [];
  let paginasSinTexto = 0;
  for (let n = 1; n <= pdf.numPages; n++) {
    const contenido = await (await pdf.getPage(n)).getTextContent();
    const texto = contenido.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("");
    if (texto.replace(/\s/g, "").length < 20) { paginasSinTexto++; continue; }
    const vistos = new Set();
    const agregar = (tipo, valor) => { const k = tipo + valor; if (!vistos.has(k)) { vistos.add(k); hallazgos.push({ pagina: n, tipo, valor }); } };
    for (const [c] of texto.matchAll(CORREO)) if (!ok.correos.has(c.toLowerCase())) agregar("correo", c);
    for (const [t] of texto.matchAll(CELULAR)) if (!ok.telefonos.has(digitos(t))) agregar("celular", t.trim());
    for (const m of texto.matchAll(CEDULA)) if (!ok.numeros.has(digitos(m[1]))) agregar("cédula", m[0].replace(/\s+/g, " ").trim());
  }
  const paginas = pdf.numPages;
  await tarea.destroy();
  return { bytes, paginas, hallazgos, paginasSinTexto, metadatos };
}
