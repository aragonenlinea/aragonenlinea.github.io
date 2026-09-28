// Pestaña "Documentos" del panel: publicar actas, estados financieros e informes para los
// copropietarios (o solo para el consejo) en el espacio privado, y retirarlos.
// Antes de subir, el PDF se limpia de datos ocultos y se revisa en busca de datos personales
// (revisar-pdf.js). El archivo se guarda con un nombre aleatorio: el nombre original no se sube.
import { esc, fecha, hoyISO } from "./comun.js";
import { sb, rpc, consulta, aviso } from "./supabase.js";
import { CATEGORIAS_DOC, tamanoArchivo } from "./cuenta.js";
import { revisarPdf } from "./revisar-pdf.js";

let previa = null;   // { nombre, bytes, paginas, hallazgos, paginasSinTexto, metadatos }

export async function vistaDocumentos() {
  const docs = await consulta(sb.from("documentos_privados")
    .select("id,titulo,categoria,fecha,audiencia,paginas,tamano,hallazgos,origen,estado,creado_en,retirado_en")
    .order("fecha", { ascending: false }).order("id", { ascending: false }).limit(200));
  return `<div class="grid g2">
    <div class="panel">
      <h2>Publicar un documento</h2>
      <p class="m">Actas, estados financieros, informes de gestión, contratos o pólizas en PDF (hasta 50 MB). Solo los verán los propietarios, el consejo y la administración, o solo el consejo si así lo marca.</p>
      <label for="doc-archivo">Archivo PDF</label>
      <input id="doc-archivo" type="file" accept="application/pdf,.pdf">
      <div id="doc-previa">${previa ? htmlPrevia() : ""}</div>
    </div>
    <div class="panel nota">
      <h2>Antes de subir</h2>
      <ul class="lista-simple">
        <li>Tape <b>nombres de deudores</b> (por ejemplo, el anexo de cartera de los estados financieros), cédulas, teléfonos, correos, direcciones, firmas y cuentas bancarias de personas.</li>
        <li>Use <code>herramientas/tapar_pdf.py</code> o pídale el documento ya tapado a quien lo elabora. Tachar con un marcador en el PDF <b>no</b> sirve: el texto sigue debajo.</li>
        <li>La plataforma borra sola los datos ocultos del archivo (autor, programa) y le avisa si encuentra correos, celulares o cédulas. Los nombres y las firmas no los puede detectar: esa revisión es suya.</li>
        <li>Los arrendatarios no ven estos documentos.</li>
      </ul>
    </div>
  </div>
  <div class="panel bloque"><h2>Documentos</h2><div class="tablewrap"><table>
    <thead><tr><th>Fecha</th><th>Título</th><th>Categoría</th><th>Lo ven</th><th class="num">Págs.</th><th class="num">Tamaño</th><th>Subido</th><th>Estado</th><th></th></tr></thead>
    <tbody>${docs.map(d => `<tr><td>${fecha(d.fecha)}</td><td>${esc(d.titulo)}${d.hallazgos ? ` <span class="pill p-info" title="Posibles datos personales revisados y confirmados al publicar">${d.hallazgos} revisado(s)</span>` : ""}</td>
      <td>${esc(d.categoria)}</td><td>${d.audiencia === "consejo" ? `<span class="pill p-info">Solo consejo</span>` : "Copropietarios"}</td>
      <td class="num">${d.paginas ?? ""}</td><td class="num">${tamanoArchivo(d.tamano)}</td>
      <td>${fecha(d.creado_en.slice(0, 10))}${d.origen === "script" ? " · PC" : ""}</td>
      <td>${d.estado === "publicado" ? `<span class="pill p-ok">Publicado</span>` : `<span class="pill p-bad">Retirado</span>`}</td>
      <td class="row">${d.estado === "publicado" ? `<a class="btn sm ghost" href="visor.html?privado=${d.id}" target="_blank" rel="noopener">Ver</a>
        <button class="btn sm peligro" type="button" data-retirar-doc="${d.id}">Retirar</button>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="9" class="m">Aún no hay documentos publicados.</td></tr>`}</tbody>
  </table></div></div>`;
}

function htmlPrevia() {
  const p = previa;
  const escaneado = p.paginasSinTexto === p.paginas;
  return `<div class="resumen-import"><div><b>${esc(p.nombre)}</b></div><div>${p.paginas} página(s)</div><div>${tamanoArchivo(p.bytes.length)}</div></div>
    ${p.metadatos.length ? `<div class="aviso ok">Se borraron los datos ocultos del archivo (${esc(p.metadatos.join(" · "))}).</div>` : ""}
    ${p.hallazgos.length ? `<div class="aviso error"><b>Posibles datos personales (${p.hallazgos.length}).</b> Revise cada uno. Si es un dato de una persona, tápelo y vuelva a cargar el archivo.
        <ul class="lista-simple">${p.hallazgos.slice(0, 30).map(h => `<li>Página ${h.pagina}: ${esc(h.tipo)} «${esc(h.valor)}»</li>`).join("")}</ul>
        ${p.hallazgos.length > 30 ? `<p>… y ${p.hallazgos.length - 30} más.</p>` : ""}</div>`
      : `<div class="aviso ok">No se encontraron correos, celulares ni cédulas${p.paginasSinTexto ? " en las páginas con texto" : ""}.</div>`}
    ${p.paginasSinTexto ? `<div class="aviso info">${escaneado ? "El PDF es escaneado (imagen): la plataforma no puede leerlo." : `${p.paginasSinTexto} página(s) son imagen y no se pudieron leer.`} Revíselo página por página antes de publicar.</div>` : ""}
    <form id="fDocumento" novalidate>
      <label for="doc-titulo">Título</label>
      <input id="doc-titulo" name="titulo" maxlength="150" required placeholder="Ej.: Acta de asamblea ordinaria 2026">
      <div class="grid tres">
        <div><label for="doc-cat">Categoría</label><select id="doc-cat" name="categoria" required><option value="">Elija…</option>${CATEGORIAS_DOC.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
        <div><label for="doc-fecha">Fecha del documento</label><input id="doc-fecha" name="fecha" type="date" max="${hoyISO()}" required></div>
        <div><label for="doc-aud">Quién lo ve</label><select id="doc-aud" name="audiencia">
          <option value="copropietarios">Propietarios, consejo y administración</option>
          <option value="consejo">Solo consejo y administración</option></select></div>
      </div>
      <label for="doc-desc">Descripción (opcional)</label>
      <textarea id="doc-desc" name="descripcion" maxlength="500" placeholder="Ej.: Incluye el informe de gestión y la aprobación del presupuesto."></textarea>
      <label class="check"><input type="checkbox" name="revisado"> Revisé el documento y se taparon los datos personales (nombres de deudores, cédulas, teléfonos, firmas, cuentas bancarias).</label>
      ${p.hallazgos.length ? `<label class="check"><input type="checkbox" name="hallazgos_ok"> Revisé uno por uno los ${p.hallazgos.length} posibles datos personales de arriba: ninguno es de una persona.</label>` : ""}
      ${p.paginasSinTexto ? `<label class="check"><input type="checkbox" name="imagenes_ok"> Revisé a ojo las páginas que son imagen.</label>` : ""}
      <div class="acciones-form"><button class="btn" type="submit">Publicar documento</button>
        <button class="btn ghost" type="button" data-descartar-doc>Descartar</button></div>
    </form>`;
}

// ---------- Eventos (los llama admin.js) ----------
export async function manejarDocumentosCambio(e, msg) {
  if (e.target.id !== "doc-archivo" || !e.target.files?.[0]) return false;
  const cont = document.getElementById("doc-previa");
  const archivo = e.target.files[0];
  aviso(cont, "Revisando el PDF… (puede tardar unos segundos si es largo)");
  try {
    const r = await revisarPdf(archivo);
    previa = { nombre: archivo.name, ...r };
    cont.innerHTML = htmlPrevia();
  } catch (err) {
    console.error(err);
    previa = null;
    aviso(cont, err.message || "No se pudo revisar el PDF.", "error");
  }
  return true;
}

export async function manejarDocumentosClic(b, msg, repintar) {
  if (b.hasAttribute("data-descartar-doc")) { previa = null; await repintar(); return true; }
  if (b.dataset.retirarDoc) {
    if (!confirm("¿Retirar este documento? Nadie lo volverá a ver y el archivo se borra. El registro queda en el historial.")) return true;
    const r = await rpc("retirar_documento", { p_id: +b.dataset.retirarDoc });
    if (r.ok && r.ruta) await sb.storage.from("privados").remove([r.ruta]);   // si falla, el archivo igual queda inaccesible
    msg(r.mensaje, r.ok ? "ok" : "error"); await repintar(); return true;
  }
  return false;
}

export async function manejarDocumentosEnvio(f, msg, repintar) {
  if (f.id !== "fDocumento") return false;
  const d = Object.fromEntries(new FormData(f));
  const titulo = (d.titulo || "").trim();
  if (titulo.length < 3) { msg("Escriba el título del documento.", "error"); return true; }
  if (!d.categoria) { msg("Elija la categoría.", "error"); return true; }
  if (!d.fecha) { msg("Escriba la fecha del documento.", "error"); return true; }
  if (!f.elements.revisado.checked) { msg("Confirme que revisó el documento y que se taparon los datos personales.", "error"); return true; }
  if (f.elements.hallazgos_ok && !f.elements.hallazgos_ok.checked) { msg("Revise los posibles datos personales encontrados y confírmelo, o tápelos y vuelva a cargar el archivo.", "error"); return true; }
  if (f.elements.imagenes_ok && !f.elements.imagenes_ok.checked) { msg("Confirme que revisó a ojo las páginas que son imagen.", "error"); return true; }
  const para = d.audiencia === "consejo" ? "solo el consejo" : "los propietarios y el consejo";
  if (!confirm(`¿Publicar "${titulo}"? Lo verán ${para} de inmediato.`)) return true;

  const ruta = `docs/${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`;
  const { error } = await sb.storage.from("privados").upload(ruta, new Blob([previa.bytes], { type: "application/pdf" }),
    { contentType: "application/pdf", upsert: false });
  if (error) { msg("No se pudo subir el archivo: " + (error.message || error), "error"); return true; }
  let r;
  try {
    r = await rpc("registrar_documento", {
      p_titulo: titulo, p_categoria: d.categoria, p_fecha: d.fecha, p_descripcion: (d.descripcion || "").trim() || null,
      p_audiencia: d.audiencia, p_ruta: ruta, p_tamano: previa.bytes.length, p_paginas: previa.paginas,
      p_revisado: true, p_hallazgos: previa.hallazgos.length
    });
  } catch (err) { r = { ok: false, mensaje: err.message }; }
  if (!r.ok) {
    await sb.storage.from("privados").remove([ruta]);   // no deja archivos sueltos sin registrar
    msg(r.mensaje, "error"); return true;
  }
  previa = null;
  msg(r.mensaje); await repintar(); return true;
}
