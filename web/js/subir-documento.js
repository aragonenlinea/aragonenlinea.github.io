// Subir un PDF desde cualquier formulario del panel (póliza, contrato, proveedor) sin pasar por la
// pestaña Documentos. Hace lo mismo que esa pestaña: borra los datos ocultos, busca datos personales,
// permite «Tapar datos» (recuadros negros y sello «Original firmado»), pide la confirmación de revisión,
// sube el archivo al espacio privado con nombre aleatorio y lo registra en Documentos.
// No usa <form> propio (va dentro de otros formularios): todo son botones type="button".
import { esc, hoyISO } from "./comun.js";
import { sb, rpc } from "./supabase.js";
import { tamanoArchivo } from "./cuenta.js";
import { revisarPdf } from "./revisar-pdf.js";
import { abrirTapado } from "./tapar-pdf.js";

let contador = 0;

/**
 * @param raiz      elemento donde se dibuja
 * @param opciones  { categoria, audiencia = "consejo", titulo (texto o función que lo da), etiqueta, alSubir({ id, titulo }) }
 */
export function montarSubida(raiz, { categoria, audiencia = "consejo", titulo = "", etiqueta = "Subir PDF", alSubir }) {
  const n = ++contador;
  let p = null;   // { nombre, bytes, paginas, hallazgos, paginasImagen, metadatos, tapadas, recuadros, original }

  function inicio() {
    raiz.innerHTML = `<div class="subida">
      <label for="sub-arch-${n}">${esc(etiqueta)}</label>
      <input id="sub-arch-${n}" type="file" accept="application/pdf,.pdf" data-subida-archivo>
      <div data-subida-zona></div></div>`;
    raiz.querySelector("[data-subida-archivo]").addEventListener("change", async e => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;
      zona().innerHTML = `<div class="aviso info">Revisando el PDF…</div>`;
      try { p = { nombre: archivo.name, ...(await revisarPdf(archivo)) }; revision(); }
      catch (err) { p = null; zona().innerHTML = `<div class="aviso error">${esc(err.message || "No se pudo revisar el PDF.")}</div>`; }
    });
  }
  const zona = () => raiz.querySelector("[data-subida-zona]");

  function revision() {
    const tapadas = p.tapadas || [];
    const imagenes = (p.paginasImagen || []).filter(x => !tapadas.includes(x));
    zona().innerHTML = `<p class="m">${esc(p.nombre)} · ${p.paginas} página(s) · ${tamanoArchivo(p.bytes.length)}</p>
      ${p.metadatos.length ? `<div class="aviso ok">Se borraron los datos ocultos del archivo.</div>` : ""}
      ${tapadas.length ? `<div class="aviso ok">Tapado en ${tapadas.length === 1 ? "la página" : "las páginas"} ${tapadas.join(", ")}: lo tapado ya no existe en el archivo.</div>` : ""}
      ${p.hallazgos.length ? `<div class="aviso error"><b>Posibles datos personales (${p.hallazgos.length}):</b> ${p.hallazgos.slice(0, 8).map(h => `página ${h.pagina}: ${esc(h.tipo)} «${esc(h.valor)}»`).join(" · ")}${p.hallazgos.length > 8 ? "…" : ""}</div>` : ""}
      ${imagenes.length ? `<div class="aviso info">${imagenes.length} página(s) son imagen: revíselas a ojo.</div>` : ""}
      <div class="row"><button class="btn sm ${p.hallazgos.length ? "" : "ghost"}" type="button" data-subida-tapar>${tapadas.length ? "Tapar algo más" : "Tapar datos y firmas"}</button>
        ${tapadas.length ? `<button class="btn sm ghost" type="button" data-subida-deshacer>Deshacer el tapado</button>` : ""}</div>
      <div data-subida-editor></div>
      <div class="grid tres">
        <div><label for="sub-tit-${n}">Título del documento</label><input id="sub-tit-${n}" data-subida-titulo maxlength="150" value="${esc(typeof titulo === "function" ? titulo() : titulo)}"></div>
        <div><label for="sub-fec-${n}">Fecha del documento</label><input id="sub-fec-${n}" data-subida-fecha type="date" max="${hoyISO()}" value="${hoyISO()}"></div>
        <div><label>Quién lo ve</label><p class="m">${audiencia === "consejo" ? "Solo consejo y administración" : "Propietarios, consejo y administración"} · categoría «${esc(categoria)}»</p></div>
      </div>
      <label class="check"><input type="checkbox" data-subida-revisado> Revisé el documento y se taparon los datos personales y las firmas que no se deben publicar.</label>
      ${p.hallazgos.length ? `<label class="check"><input type="checkbox" data-subida-hallazgos> Revisé uno por uno los posibles datos personales: ninguno es de una persona.</label>` : ""}
      ${imagenes.length ? `<label class="check"><input type="checkbox" data-subida-imagenes> Revisé a ojo las páginas que son imagen.</label>` : ""}
      <div class="row"><button class="btn sm" type="button" data-subida-subir>Subir documento</button><button class="btn sm ghost" type="button" data-subida-otro>Elegir otro archivo</button></div>
      <div data-subida-msg></div>`;
  }

  const mensaje = (t, tipo = "error") => { const m = raiz.querySelector("[data-subida-msg]"); if (m) m.innerHTML = `<div class="aviso ${tipo}">${esc(t)}</div>`; };

  // Enter en el título no debe enviar el formulario de afuera (póliza, contrato, proveedor).
  raiz.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input")) e.preventDefault(); });

  raiz.addEventListener("click", async e => {
    const b = e.target.closest("button");
    if (!b || !raiz.contains(b)) return;
    if (b.hasAttribute("data-subida-otro")) { p = null; inicio(); return; }
    if (b.hasAttribute("data-subida-deshacer")) {
      zona().innerHTML = `<div class="aviso info">Volviendo al original…</div>`;
      const r = await revisarPdf(new File([p.original], p.nombre, { type: "application/pdf" }));
      p = { nombre: p.nombre, ...r }; revision(); return;
    }
    if (b.hasAttribute("data-subida-tapar")) {
      const editor = raiz.querySelector("[data-subida-editor]");
      const pendientes = p.tapadas?.length ? [] : p.hallazgos;
      await abrirTapado(editor, p.bytes, pendientes, async res => {
        editor.innerHTML = "";
        if (!res) return;
        const r = await revisarPdf(new File([res.bytes], p.nombre, { type: "application/pdf" }));
        p = { ...p, ...r, metadatos: p.metadatos, original: p.original || p.bytes,
              tapadas: [...new Set([...(p.tapadas || []), ...res.paginasTapadas])].sort((a, c) => a - c), recuadros: (p.recuadros || 0) + res.recuadros };
        revision();
      });
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (b.hasAttribute("data-subida-subir")) {
      const tit = raiz.querySelector("[data-subida-titulo]").value.trim();
      const fec = raiz.querySelector("[data-subida-fecha]").value;
      const marcado = s => raiz.querySelector(s)?.checked ?? true;
      if (tit.length < 3) { mensaje("Escriba el título del documento."); return; }
      if (!fec) { mensaje("Escriba la fecha del documento."); return; }
      if (!marcado("[data-subida-revisado]")) { mensaje("Confirme que revisó el documento."); return; }
      if (!marcado("[data-subida-hallazgos]")) { mensaje("Revise los posibles datos personales (o tápelos) y confírmelo."); return; }
      if (!marcado("[data-subida-imagenes]")) { mensaje("Confirme que revisó a ojo las páginas que son imagen."); return; }
      b.disabled = true;
      mensaje("Subiendo…", "info");
      const ruta = `docs/${new Date().getFullYear()}/${crypto.randomUUID()}.pdf`;
      const { error } = await sb.storage.from("privados").upload(ruta, new Blob([p.bytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
      if (error) { b.disabled = false; mensaje("No se pudo subir el archivo: " + (error.message || error)); return; }
      let r;
      try {
        r = await rpc("registrar_documento", { p_titulo: tit, p_categoria: categoria, p_fecha: fec, p_descripcion: null, p_audiencia: audiencia,
          p_ruta: ruta, p_tamano: p.bytes.length, p_paginas: p.paginas, p_revisado: true, p_hallazgos: p.hallazgos.length });
      } catch (err) { r = { ok: false, mensaje: err.message }; }
      if (!r.ok) { await sb.storage.from("privados").remove([ruta]); b.disabled = false; mensaje(r.mensaje); return; }
      raiz.innerHTML = `<div class="aviso ok">Documento subido: <b>${esc(tit)}</b>.</div>`;
      try { await alSubir?.({ id: r.id, titulo: tit }); } catch (err) { raiz.insertAdjacentHTML("beforeend", `<div class="aviso error">${esc(err.message)}</div>`); }
    }
  });

  inicio();
}
