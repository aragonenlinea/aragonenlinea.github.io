// Pestaña "Proveedores y pólizas" del panel: avisos, tablas y formularios para registrar y editar.
// Nada se borra: se marca inactivo (proveedor), terminado o anulado (contrato) o anulada (póliza).
import { esc } from "./comun.js";
import { sb, consulta } from "./supabase.js";
import { pesos } from "./cuenta.js";
import { cargarDatos, avisos, htmlAvisos, htmlPolizas, htmlContratos, htmlProveedores, htmlDocsProveedor, SERVICIOS, TIPOS_POLIZA, TIPOS_DOC_PROVEEDOR } from "./proveedores-comun.js";

let edicion = null;    // { tipo: "poliza" | "contrato" | "proveedor", id: número o null (nuevo) }
let datos = null;

const boton = (tipo, id) => `<button class="btn sm ghost" type="button" data-editar-prov="${tipo}:${id}">Editar</button>`;
const opcion = (v, t, actual) => `<option value="${esc(v)}" ${String(actual ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`;
const val = v => esc(v ?? "");

function selectorDocumento(actual, categorias) {
  const docs = datos.documentos.filter(d => categorias.includes(d.categoria) || d.id === actual);
  return `<select name="documento_id"><option value="">Sin documento</option>${docs.map(d => opcion(d.id, `${d.titulo} (${d.fecha})${d.audiencia === "consejo" ? " · solo consejo" : ""}`, actual)).join("")}</select>
    <p class="m">El PDF se sube primero en la pestaña Documentos (con Tapar datos y el sello para las firmas). Se recomienda publicarlo como «solo consejo».</p>`;
}

function formulario() {
  const { tipo, id } = edicion;
  const titulo = { poliza: "póliza", contrato: "contrato", proveedor: "proveedor" }[tipo];
  let campos = "";
  if (tipo === "proveedor") {
    const p = datos.proveedores.find(x => x.id === id) || { tipo: "empresa", estado: "activo" };
    campos = `<div class="grid tres">
        <div><label for="pv-tipo">Tipo</label><select id="pv-tipo" name="tipo">${opcion("empresa", "Empresa", p.tipo)}${opcion("persona_natural", "Persona natural", p.tipo)}</select></div>
        <div><label for="pv-serv">Servicio</label><select id="pv-serv" name="servicio">${SERVICIOS.map(s => opcion(s, s, p.servicio)).join("")}</select></div>
        <div><label for="pv-est">Estado</label><select id="pv-est" name="estado">${opcion("activo", "Activo", p.estado)}${opcion("inactivo", "Inactivo", p.estado)}</select></div>
      </div>
      <label for="pv-nom">Nombre de la empresa (si es persona natural: solo el servicio, sin nombre)</label>
      <input id="pv-nom" name="nombre" maxlength="120" required value="${val(p.nombre)}" placeholder="Ej.: Seguridad Atlas LTDA · o · Mantenimiento de piscina">
      <div class="solo-empresa grid tres">
        <div><label for="pv-nit">NIT</label><input id="pv-nit" name="nit" maxlength="15" value="${val(p.nit)}" placeholder="900.123.456-7"></div>
        <div><label for="pv-tel">Teléfono de la empresa</label><input id="pv-tel" name="telefono" maxlength="40" value="${val(p.telefono)}"></div>
        <div><label for="pv-cor">Correo de la empresa</label><input id="pv-cor" name="correo" type="email" maxlength="120" value="${val(p.correo)}"></div>
      </div>
      <p class="m solo-persona">De una persona natural no se guardan nombre, cédula ni teléfono: esos datos quedan en el contrato físico de la administración.</p>
      <label for="pv-fun">Funciones u obligaciones principales</label>
      <textarea id="pv-fun" name="funciones" maxlength="2000">${val(p.funciones)}</textarea>`;
    if (id) campos += seccionDocsProveedor(id);
  } else if (tipo === "contrato") {
    const c = datos.contratos.find(x => x.id === id) || { supervisor: "Administración", estado: "vigente" };
    const rubros = Object.keys(datos.rubros);
    campos = `<div class="grid tres">
        <div><label for="ct-prov">Proveedor</label><select id="ct-prov" name="proveedor_id" required><option value="">Elija…</option>${datos.proveedores.map(p => opcion(p.id, p.nombre, c.proveedor_id)).join("")}</select></div>
        <div><label for="ct-ini">Inicio</label><input id="ct-ini" name="fecha_inicio" type="date" required value="${val(c.fecha_inicio)}"></div>
        <div><label for="ct-fin">Terminación (vacío: sin fecha)</label><input id="ct-fin" name="fecha_fin" type="date" value="${val(c.fecha_fin)}"></div>
      </div>
      <label for="ct-obj">Objeto del contrato</label><input id="ct-obj" name="objeto" maxlength="300" required value="${val(c.objeto)}">
      <div class="grid tres">
        <div><label for="ct-vm">Valor mensual (pesos)</label><input id="ct-vm" name="valor_mensual" inputmode="numeric" value="${c.valor_mensual != null ? pesos(c.valor_mensual).replace("$", "") : ""}"></div>
        <div><label for="ct-vt">Valor total (pesos)</label><input id="ct-vt" name="valor_total" inputmode="numeric" value="${c.valor_total != null ? pesos(c.valor_total).replace("$", "") : ""}"></div>
        <div><label for="ct-rub">Rubro del presupuesto ${datos.anio}</label><select id="ct-rub" name="rubro"><option value="">Sin rubro</option>${[...new Set([...rubros, ...(c.rubro ? [c.rubro] : [])])].map(r => opcion(r, r, c.rubro)).join("")}</select></div>
        <div><label for="ct-sup">Supervisa por el conjunto</label><select id="ct-sup" name="supervisor">${opcion("Administración", "Administración", c.supervisor)}${opcion("Consejo", "Consejo", c.supervisor)}</select></div>
        <div><label for="ct-est">Estado</label><select id="ct-est" name="estado">${opcion("vigente", "Vigente", c.estado)}${opcion("terminado", "Terminado", c.estado)}${opcion("anulado", "Anulado", c.estado)}</select></div>
      </div>
      <label for="ct-pol">Pólizas que se le exigen al contratista</label><input id="ct-pol" name="polizas_exigidas" maxlength="500" value="${val(c.polizas_exigidas)}" placeholder="Ej.: cumplimiento 20 %, responsabilidad civil, salarios y prestaciones">
      <label>Contrato en PDF</label>${selectorDocumento(c.documento_id, ["Contratos"])}
      <label for="ct-not">Notas</label><textarea id="ct-not" name="notas" maxlength="1000">${val(c.notas)}</textarea>`;
  } else {
    const p = datos.polizas.find(x => x.id === id) || { estado: "vigente" };
    campos = `<div class="grid tres">
        <div><label for="po-tipo">Tipo</label><select id="po-tipo" name="tipo">${TIPOS_POLIZA.map(t => opcion(t, t, p.tipo)).join("")}</select></div>
        <div><label for="po-aseg">Aseguradora</label><input id="po-aseg" name="aseguradora" maxlength="120" required value="${val(p.aseguradora)}"></div>
        <div><label for="po-num">Número de póliza</label><input id="po-num" name="numero" maxlength="60" value="${val(p.numero)}"></div>
        <div><label for="po-des">Vigente desde</label><input id="po-des" name="vigencia_desde" type="date" required value="${val(p.vigencia_desde)}"></div>
        <div><label for="po-has">Vigente hasta</label><input id="po-has" name="vigencia_hasta" type="date" required value="${val(p.vigencia_hasta)}"></div>
        <div><label for="po-est">Estado</label><select id="po-est" name="estado">${opcion("vigente", "Vigente", p.estado)}${opcion("anulada", "Anulada", p.estado)}</select></div>
        <div><label for="po-val">Valor asegurado (pesos)</label><input id="po-val" name="valor_asegurado" inputmode="numeric" value="${p.valor_asegurado != null ? pesos(p.valor_asegurado).replace("$", "") : ""}"></div>
        <div><label for="po-pri">Prima (pesos)</label><input id="po-pri" name="prima" inputmode="numeric" value="${p.prima != null ? pesos(p.prima).replace("$", "") : ""}"></div>
        <div><label for="po-prov">De un contratista (si no, es del conjunto)</label><select id="po-prov" name="proveedor_id"><option value="">Del conjunto</option>${datos.proveedores.map(x => opcion(x.id, x.nombre, p.proveedor_id)).join("")}</select></div>
      </div>
      <label for="po-cub">Qué cubre</label><input id="po-cub" name="cubre" maxlength="500" value="${val(p.cubre)}">
      <label>Póliza en PDF</label>${selectorDocumento(p.documento_id, ["Pólizas"])}
      <label for="po-not">Notas</label><textarea id="po-not" name="notas" maxlength="1000">${val(p.notas)}</textarea>`;
  }
  return `<div class="panel bloque" id="prov-form-zona"><h2>${id ? "Editar" : "Registrar"} ${titulo}</h2>
    <form id="fProveedores" data-tipo="${tipo}" novalidate>${campos}
      <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar-prov>Cancelar</button></div>
    </form></div>`;
}

// Documentos del proveedor dentro del formulario de edición (se agregan y quitan al momento).
function seccionDocsProveedor(id) {
  const disponibles = datos.documentos.filter(x => x.categoria === "Proveedores" && !datos.docsProveedor.some(pd => pd.proveedor_id === id && pd.documento_id === x.id));
  return `<fieldset class="docs-proveedor-form bloque-sm"><legend>Documentos del proveedor</legend>
    ${htmlDocsProveedor(datos, id, true)}
    <div class="grid tres">
      <div><label for="pd-tipo">Tipo</label><select id="pd-tipo" data-pdoc="tipo">${TIPOS_DOC_PROVEEDOR.map(t => opcion(t, t)).join("")}</select></div>
      <div><label for="pd-doc">Documento (PDF)</label><select id="pd-doc" data-pdoc="documento"><option value="">Elija…</option>${disponibles.map(x => opcion(x.id, `${x.titulo} (${x.fecha})`)).join("")}</select></div>
      <div><label for="pd-vence">Vence el (si aplica)</label><input id="pd-vence" data-pdoc="vence" type="date"></div>
    </div>
    <label for="pd-notas">Notas (opcional)</label><input id="pd-notas" data-pdoc="notas" maxlength="300" placeholder="Ej.: planilla de septiembre">
    <div class="acciones-form"><button class="btn sm" type="button" data-agregar-pdoc="${id}">Agregar documento</button></div>
    <p class="m">Suba primero el PDF en la pestaña Documentos, categoría <b>«Proveedores»</b>, de preferencia «solo consejo». Tape cédulas, teléfonos y firmas de personas. No se guardan certificados bancarios.</p>
  </fieldset>`;
}

export async function vistaProveedores() {
  datos = await cargarDatos();
  const smmlv = datos.conf.smmlv;
  return `${edicion ? formulario() : ""}
    <div class="panel bloque-sm"><h2>Avisos</h2>${htmlAvisos(avisos(datos))}
      <form id="fSmmlv" class="fila-smmlv" novalidate>
        <label for="sm-val">Salario mínimo mensual ${datos.conf.smmlv_anio || new Date().getFullYear()} (para la póliza de manejo: 4 SMMLV)</label>
        <div class="row"><input id="sm-val" name="smmlv" inputmode="numeric" value="${smmlv ? pesos(smmlv).replace("$", "") : ""}" placeholder="Valor del decreto del año">
          <input name="smmlv_anio" type="number" min="2020" max="2100" value="${datos.conf.smmlv_anio || new Date().getFullYear()}" aria-label="Año">
          <button class="btn sm" type="submit">Guardar</button></div>
      </form>
    </div>
    <div class="panel bloque"><div class="row espacio"><h2>Pólizas</h2><button class="btn sm" type="button" data-editar-prov="poliza:">Registrar póliza</button></div>${htmlPolizas(datos, boton)}</div>
    <div class="panel bloque"><div class="row espacio"><h2>Contratos</h2><button class="btn sm" type="button" data-editar-prov="contrato:">Registrar contrato</button></div>${htmlContratos(datos, boton)}</div>
    <div class="bloque"><div class="row espacio"><h2>Proveedores</h2><button class="btn sm" type="button" data-editar-prov="proveedor:">Registrar proveedor</button></div>${htmlProveedores(datos, boton)}</div>`;
}

// Avisos para la pestaña Pendientes del panel.
export async function resumenProveedores() {
  try {
    const lista = avisos(await cargarDatos());
    const urgentes = lista.filter(a => a.nivel === 2).length;
    if (!lista.length) return "";
    return `<div class="panel bloque-sm ${urgentes ? "error" : "nota"}"><h2>Proveedores y pólizas</h2>
      <p>${urgentes ? `<b>${urgentes} aviso(s) urgente(s)</b>` : ""}${urgentes && lista.length > urgentes ? " y " : ""}${lista.length > urgentes ? `${lista.length - urgentes} por atender pronto` : ""}.</p>
      <button class="btn sm" type="button" data-tab="proveedores">Ver avisos</button></div>`;
  } catch (e) { return ""; }
}

// ---------- Eventos (los llama admin.js) ----------
const monto = v => { const s = String(v ?? "").replace(/[$\s.]/g, "").replace(",", "."); if (!s) return null; const n = Number(s); return Number.isInteger(n) && n >= 0 ? n : NaN; };

export function manejarProveedoresCambio(e) {
  if (e.target.id !== "pv-tipo") return false;
  ajustarTipoProveedor(e.target.form);
  return true;
}
function ajustarTipoProveedor(f) {
  if (!f || f.dataset.tipo !== "proveedor") return;
  const persona = f.tipo.value === "persona_natural";
  f.querySelectorAll(".solo-empresa").forEach(x => { x.hidden = persona; });
  f.querySelectorAll(".solo-persona").forEach(x => { x.hidden = !persona; });
}

export async function manejarProveedoresClic(b, msg, repintar) {
  if (b.dataset.editarProv !== undefined) {
    const [tipo, id] = b.dataset.editarProv.split(":");
    if (tipo === "contrato" && !datos?.proveedores.length) { msg("Primero registre el proveedor.", "error"); return true; }
    edicion = { tipo, id: id ? Number(id) : null };
    await repintar();
    ajustarTipoProveedor(document.getElementById("fProveedores"));
    document.getElementById("prov-form-zona")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  if (b.hasAttribute("data-cancelar-prov")) { edicion = null; await repintar(); return true; }
  if (b.dataset.agregarPdoc) {
    const campo = n => document.querySelector(`[data-pdoc="${n}"]`)?.value || "";
    if (!campo("documento")) { msg("Elija el documento (súbalo antes en Documentos, categoría «Proveedores»).", "error"); return true; }
    await consulta(sb.from("proveedor_documentos").insert({ proveedor_id: Number(b.dataset.agregarPdoc), documento_id: Number(campo("documento")),
      tipo: campo("tipo"), vence_el: campo("vence") || null, notas: campo("notas").trim() || null }));
    msg("Documento agregado al proveedor."); await repintar(); ajustarTipoProveedor(document.getElementById("fProveedores")); return true;
  }
  if (b.dataset.quitarPdoc) {
    if (!confirm("¿Quitar este documento del proveedor? El PDF sigue en Documentos.")) return true;
    await consulta(sb.from("proveedor_documentos").delete().eq("id", Number(b.dataset.quitarPdoc)));
    msg("Documento quitado del proveedor."); await repintar(); ajustarTipoProveedor(document.getElementById("fProveedores")); return true;
  }
  return false;
}

export async function manejarProveedoresEnvio(f, msg, repintar) {
  if (f.id === "fSmmlv") {
    const v = monto(f.smmlv.value), anio = Number(f.smmlv_anio.value);
    if (!v || Number.isNaN(v)) { msg("Escriba el salario mínimo en pesos, sin decimales.", "error"); return true; }
    await consulta(sb.from("configuracion_conjunto").update({ smmlv: v, smmlv_anio: anio, actualizado_en: new Date().toISOString() }).eq("id", 1));
    msg("Salario mínimo guardado."); await repintar(); return true;
  }
  if (f.id !== "fProveedores") return false;
  const d = Object.fromEntries(new FormData(f));
  const tipo = f.dataset.tipo;
  const vacio = v => (v ?? "").trim() || null;
  let tabla, fila;
  if (tipo === "proveedor") {
    const persona = d.tipo === "persona_natural";
    if ((d.nombre || "").trim().length < 2) { msg("Escriba el nombre de la empresa o, si es persona natural, el servicio.", "error"); return true; }
    tabla = "proveedores";
    fila = { nombre: d.nombre.trim(), tipo: d.tipo, servicio: d.servicio, estado: d.estado, funciones: vacio(d.funciones),
             nit: persona ? null : vacio(d.nit), telefono: persona ? null : vacio(d.telefono), correo: persona ? null : vacio(d.correo) };
    if (fila.nit && !/^[0-9.]{5,15}(-[0-9])?$/.test(fila.nit)) { msg("El NIT debe tener solo números, puntos y el dígito de verificación (ej.: 900.123.456-7).", "error"); return true; }
  } else if (tipo === "contrato") {
    const vm = monto(d.valor_mensual), vt = monto(d.valor_total);
    if (!d.proveedor_id || !d.fecha_inicio || (d.objeto || "").trim().length < 3) { msg("Elija el proveedor y escriba el objeto y la fecha de inicio.", "error"); return true; }
    if (Number.isNaN(vm) || Number.isNaN(vt)) { msg("Los valores deben ser pesos, sin decimales.", "error"); return true; }
    if (d.fecha_fin && d.fecha_fin < d.fecha_inicio) { msg("La terminación no puede ser antes del inicio.", "error"); return true; }
    tabla = "contratos";
    fila = { proveedor_id: Number(d.proveedor_id), objeto: d.objeto.trim(), fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin || null,
             valor_mensual: vm, valor_total: vt, rubro: d.rubro || null, supervisor: d.supervisor, estado: d.estado,
             polizas_exigidas: vacio(d.polizas_exigidas), documento_id: d.documento_id ? Number(d.documento_id) : null, notas: vacio(d.notas) };
  } else {
    const va = monto(d.valor_asegurado), pr = monto(d.prima);
    if ((d.aseguradora || "").trim().length < 2 || !d.vigencia_desde || !d.vigencia_hasta) { msg("Escriba la aseguradora y las fechas de vigencia.", "error"); return true; }
    if (d.vigencia_hasta < d.vigencia_desde) { msg("La vigencia no puede terminar antes de empezar.", "error"); return true; }
    if (Number.isNaN(va) || Number.isNaN(pr)) { msg("Los valores deben ser pesos, sin decimales.", "error"); return true; }
    tabla = "polizas";
    fila = { tipo: d.tipo, aseguradora: d.aseguradora.trim(), numero: vacio(d.numero), cubre: vacio(d.cubre), valor_asegurado: va, prima: pr,
             vigencia_desde: d.vigencia_desde, vigencia_hasta: d.vigencia_hasta, estado: d.estado,
             proveedor_id: d.proveedor_id ? Number(d.proveedor_id) : null, documento_id: d.documento_id ? Number(d.documento_id) : null, notas: vacio(d.notas) };
  }
  if (edicion.id) await consulta(sb.from(tabla).update(fila).eq("id", edicion.id));
  else await consulta(sb.from(tabla).insert(fila));
  msg(edicion.id ? "Cambios guardados." : "Registrado.");
  edicion = null;
  await repintar();
  return true;
}
