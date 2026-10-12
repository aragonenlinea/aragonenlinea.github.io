// Pestañas "Pólizas" y "Proveedores y contratos" del panel: avisos, garantías, tablas y formularios.
// Los PDF (póliza, contrato, documentos del proveedor o de la aseguradora) se pueden subir desde el mismo
// formulario, con la revisión, «Tapar datos» y el sello de siempre (subir-documento.js).
// Nada se borra: se marca inactivo (proveedor), terminado o anulado (contrato), anulada (póliza) o desactivada (garantía).
import { esc, hoyISO } from "./comun.js";
import { sb, consulta } from "./supabase.js";
import { pesos } from "./cuenta.js";
import { montarSubida } from "./subir-documento.js";
import { cargarDatos, avisos, htmlAvisos, htmlPolizas, htmlContratos, htmlProveedores, htmlDocsProveedor, htmlGarantias, htmlRequisitos,
         SERVICIOS, TIPOS_POLIZA, TIPOS_DOC_PROVEEDOR, COBERTURAS, AMBITOS, TIPOS_MINIMO, NIVELES } from "./proveedores-comun.js";

let edicion = null;    // { tipo: "poliza" | "requisito" | "contrato" | "proveedor", id: número o null (nuevo), vista }
let datos = null;
let vistaActual = "";
let avisar = () => {};

const boton = (tipo, id) => `<button class="btn sm ghost" type="button" data-editar-prov="${tipo}:${id}">Editar</button>`;
const opcion = (v, t, actual) => `<option value="${esc(v)}" ${String(actual ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`;
const val = v => esc(v ?? "");
const enPesos = v => v != null ? pesos(v).replace("$", "").trim() : "";
const nombreProv = id => datos.proveedores.find(p => p.id === id)?.nombre || "";

function selectorDocumento(actual, categoria, titulo) {
  const docs = datos.documentos.filter(d => d.categoria === categoria || d.id === actual);
  return `<select name="documento_id"><option value="">Sin documento</option>${docs.map(d => opcion(d.id, `${d.titulo} (${d.fecha})${d.audiencia === "consejo" ? " · solo consejo" : ""}`, actual)).join("")}</select>
    <div class="bloque-sm" data-subida="doc" data-categoria="${esc(categoria)}" data-titulo="${esc(titulo)}"></div>`;
}

// ---------- Formularios ----------
function formProveedor(id) {
  const p = datos.proveedores.find(x => x.id === id) || { tipo: "empresa", estado: "activo", servicio: vistaActual === "polizas" ? "Seguros" : "Vigilancia" };
  return `<div class="grid tres">
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
    <textarea id="pv-fun" name="funciones" maxlength="2000">${val(p.funciones)}</textarea>
    ${id ? seccionDocsProveedor(id, "del proveedor") : `<p class="m">Después de guardar podrá subir aquí mismo sus documentos (RUT, Cámara de Comercio, seguridad social…).</p>`}`;
}

function formContrato(id) {
  const c = datos.contratos.find(x => x.id === id) || { supervisor: "Administración", estado: "vigente" };
  const rubros = Object.keys(datos.rubros);
  const provs = datos.proveedores.filter(p => p.servicio !== "Seguros" || p.id === c.proveedor_id);
  return `<div class="grid tres">
      <div><label for="ct-prov">Proveedor</label><select id="ct-prov" name="proveedor_id" required><option value="">Elija…</option>${provs.map(p => opcion(p.id, p.nombre, c.proveedor_id)).join("")}</select></div>
      <div><label for="ct-ini">Inicio</label><input id="ct-ini" name="fecha_inicio" type="date" required value="${val(c.fecha_inicio)}"></div>
      <div><label for="ct-fin">Terminación (vacío: sin fecha)</label><input id="ct-fin" name="fecha_fin" type="date" value="${val(c.fecha_fin)}"></div>
    </div>
    <label for="ct-obj">Objeto del contrato</label><input id="ct-obj" name="objeto" maxlength="300" required value="${val(c.objeto)}">
    <div class="grid tres">
      <div><label for="ct-vm">Valor mensual (pesos)</label><input id="ct-vm" name="valor_mensual" inputmode="numeric" value="${enPesos(c.valor_mensual)}"></div>
      <div><label for="ct-vt">Valor total (pesos)</label><input id="ct-vt" name="valor_total" inputmode="numeric" value="${enPesos(c.valor_total)}"></div>
      <div><label for="ct-rub">Rubro del presupuesto ${datos.anio}</label><select id="ct-rub" name="rubro"><option value="">Sin rubro</option>${[...new Set([...rubros, ...(c.rubro ? [c.rubro] : [])])].map(r => opcion(r, r, c.rubro)).join("")}</select></div>
      <div><label for="ct-sup">Supervisa por el conjunto</label><select id="ct-sup" name="supervisor">${opcion("Administración", "Administración", c.supervisor)}${opcion("Consejo", "Consejo", c.supervisor)}</select></div>
      <div><label for="ct-est">Estado</label><select id="ct-est" name="estado">${opcion("vigente", "Vigente", c.estado)}${opcion("terminado", "Terminado", c.estado)}${opcion("anulado", "Anulado", c.estado)}</select></div>
    </div>
    <p class="m">El valor total (o el mensual con la fecha de terminación) sirve para calcular las garantías exigidas al contratista en la pestaña Pólizas.</p>
    <label for="ct-pol">Pólizas que se le exigen al contratista (lo que dice el contrato)</label><input id="ct-pol" name="polizas_exigidas" maxlength="500" value="${val(c.polizas_exigidas)}" placeholder="Ej.: cumplimiento 20 %, responsabilidad civil, salarios y prestaciones">
    <label>Contrato en PDF</label>${selectorDocumento(c.documento_id, "Contratos", `Contrato ${c.proveedor_id ? nombreProv(c.proveedor_id) : ""}`.trim())}
    <label for="ct-not">Notas</label><textarea id="ct-not" name="notas" maxlength="1000">${val(c.notas)}</textarea>`;
}

const filaCobertura = (c = {}) => `<div class="grid tres fila-cobertura" data-cob-fila>
    <div><label>Cobertura</label><select data-cob="cobertura">${COBERTURAS.map(x => opcion(x, x, c.cobertura)).join("")}</select></div>
    <div><label>Valor asegurado (pesos)</label><input data-cob="valor" inputmode="numeric" value="${enPesos(c.valor_asegurado)}"></div>
    <div><label>Deducible (opcional)</label><div class="row"><input data-cob="deducible" maxlength="200" value="${val(c.deducible)}" placeholder="Ej.: 10 % mínimo 1 SMMLV"><button class="btn sm ghost" type="button" data-quitar-cob>Quitar</button></div></div>
  </div>`;

function formPoliza(id) {
  const p = datos.polizas.find(x => x.id === id) || { estado: "vigente" };
  const aseguradoras = datos.proveedores.filter(x => x.servicio === "Seguros" && (x.estado === "activo" || x.id === p.aseguradora_id));
  // Póliza antigua (solo con el nombre escrito): se propone registrar la aseguradora con ese nombre.
  const actual = p.aseguradora_id ?? (p.aseguradora ? (aseguradoras.find(a => a.nombre.toLowerCase() === p.aseguradora.toLowerCase())?.id ?? "nueva") : (aseguradoras.length ? "" : "nueva"));
  const coberturas = datos.coberturas.filter(c => c.poliza_id === id);
  const aseg = datos.con031 ? `<div><label for="po-aseg">Aseguradora</label><select id="po-aseg" name="aseguradora_id"><option value="">Elija…</option>
        ${aseguradoras.map(a => opcion(a.id, a.nombre, actual)).join("")}${opcion("nueva", "Otra aseguradora (registrarla)", actual)}</select></div>`
    : `<div><label for="po-aseg-txt">Aseguradora</label><input id="po-aseg-txt" name="aseguradora" maxlength="120" required value="${val(p.aseguradora)}"></div>`;
  return `<div class="grid tres">
      <div><label for="po-tipo">Tipo</label><select id="po-tipo" name="tipo">${TIPOS_POLIZA.map(t => opcion(t, t, p.tipo)).join("")}</select></div>
      ${aseg}
      <div><label for="po-num">Número de póliza</label><input id="po-num" name="numero" maxlength="60" value="${val(p.numero)}"></div>
    </div>
    ${datos.con031 ? `<fieldset class="docs-proveedor-form bloque-sm solo-nueva-aseg"><legend>Nueva aseguradora</legend>
      <p class="m">Queda registrada en la base general de proveedores (servicio «Seguros»).</p>
      <div class="grid tres">
        <div><label for="na-nom">Nombre</label><input id="na-nom" name="aseg_nombre" maxlength="120" value="${p.aseguradora_id ? "" : val(p.aseguradora)}" placeholder="Ej.: Seguros del Estado S.A."></div>
        <div><label for="na-nit">NIT</label><input id="na-nit" name="aseg_nit" maxlength="15" placeholder="860.000.000-1"></div>
        <div><label for="na-tel">Teléfono</label><input id="na-tel" name="aseg_telefono" maxlength="40"></div>
        <div><label for="na-cor">Correo</label><input id="na-cor" name="aseg_correo" type="email" maxlength="120"></div>
      </div></fieldset>` : ""}
    <div class="grid tres">
      <div><label for="po-des">Vigente desde</label><input id="po-des" name="vigencia_desde" type="date" required value="${val(p.vigencia_desde)}"></div>
      <div><label for="po-has">Vigente hasta</label><input id="po-has" name="vigencia_hasta" type="date" required value="${val(p.vigencia_hasta)}"></div>
      <div><label for="po-est">Estado</label><select id="po-est" name="estado">${opcion("vigente", "Vigente", p.estado)}${opcion("anulada", "Anulada", p.estado)}</select></div>
      <div><label for="po-val">Valor asegurado total (pesos)</label><input id="po-val" name="valor_asegurado" inputmode="numeric" value="${enPesos(p.valor_asegurado)}"></div>
      <div><label for="po-pri">Prima (pesos)</label><input id="po-pri" name="prima" inputmode="numeric" value="${enPesos(p.prima)}"></div>
      <div><label for="po-prov">Del conjunto o de un contratista</label><select id="po-prov" name="proveedor_id"><option value="">Del conjunto</option>${datos.proveedores.filter(x => x.servicio !== "Seguros" || x.id === p.proveedor_id).map(x => opcion(x.id, x.nombre, p.proveedor_id)).join("")}</select></div>
    </div>
    <label for="po-cub">Qué cubre (resumen)</label><input id="po-cub" name="cubre" maxlength="500" value="${val(p.cubre)}">
    ${datos.con031 ? `<fieldset class="docs-proveedor-form bloque-sm"><legend>Coberturas y valores asegurados</legend>
      <p class="m">Con estos valores se arma el cuadro «Garantías exigidas vs. contratadas». Copie cada amparo de la carátula de la póliza.</p>
      <div data-coberturas>${(coberturas.length ? coberturas : [{}]).map(filaCobertura).join("")}</div>
      <div class="acciones-form"><button class="btn sm ghost" type="button" data-agregar-cob>Agregar cobertura</button></div></fieldset>` : ""}
    <label>Póliza en PDF</label>${selectorDocumento(p.documento_id, "Pólizas", `Póliza ${p.tipo || ""} ${p.numero || ""}`.trim())}
    ${datos.con031 ? (p.aseguradora_id ? seccionDocsProveedor(p.aseguradora_id, `de la aseguradora (${nombreProv(p.aseguradora_id)})`)
      : `<p class="m">Después de guardar podrá subir aquí mismo los documentos de la aseguradora (RUT, Cámara de Comercio…).</p>`) : ""}
    <label for="po-not">Notas</label><textarea id="po-not" name="notas" maxlength="1000">${val(p.notas)}</textarea>`;
}

function formRequisito(id) {
  const r = datos.requisitos.find(x => x.id === id) || { ambito: "Todos los contratistas", minimo_tipo: "obligatoria", nivel: "conjunto", activo: true };
  return `<div class="grid tres">
      <div><label for="rq-amb">A quién se le exige</label><select id="rq-amb" name="ambito">${AMBITOS.map(a => opcion(a, a, r.ambito)).join("")}</select></div>
      <div><label for="rq-cob">Garantía (cobertura)</label><select id="rq-cob" name="cobertura">${COBERTURAS.map(c => opcion(c, c, r.cobertura)).join("")}</select></div>
      <div><label for="rq-niv">Origen</label><select id="rq-niv" name="nivel">${Object.entries(NIVELES).map(([k, t]) => opcion(k, t, r.nivel)).join("")}</select></div>
      <div><label for="rq-tip">Cómo se mide el mínimo</label><select id="rq-tip" name="minimo_tipo">${Object.entries(TIPOS_MINIMO).map(([k, t]) => opcion(k, t, r.minimo_tipo)).join("")}</select></div>
      <div><label for="rq-val">Valor del mínimo (%, o número de SMMLV)</label><input id="rq-val" name="minimo_valor" inputmode="decimal" value="${val(r.minimo_valor)}"></div>
      <div><label for="rq-act">Estado</label><select id="rq-act" name="activo">${opcion("true", "Activa", String(r.activo))}${opcion("false", "Desactivada", String(r.activo))}</select></div>
    </div>
    <label for="rq-vig">Vigencia exigida</label><input id="rq-vig" name="vigencia" maxlength="200" value="${val(r.vigencia)}" placeholder="Ej.: plazo del contrato y cuatro meses más">
    <label for="rq-fue">Fuente (norma, artículo del RPH o decisión del consejo)</label><input id="rq-fue" name="fuente" maxlength="200" required value="${val(r.fuente)}" placeholder="Ej.: Acta de consejo 12 de 2026">
    <label for="rq-not">Nota</label><textarea id="rq-not" name="nota" maxlength="500">${val(r.nota)}</textarea>
    <p class="m">Las garantías de la ley y del RPH solo se cambian si cambia la norma o el reglamento. Las del conjunto las decide el consejo: anote el acta en la fuente.</p>`;
}

function formulario() {
  const { tipo, id } = edicion;
  const titulo = { poliza: "póliza", requisito: "garantía exigida", contrato: "contrato", proveedor: "proveedor" }[tipo];
  const campos = { poliza: formPoliza, requisito: formRequisito, contrato: formContrato, proveedor: formProveedor }[tipo](id);
  return `<div class="panel bloque" id="prov-form-zona"><h2>${id ? "Editar" : "Registrar"} ${titulo}</h2>
    <form id="fProveedores" data-tipo="${tipo}" novalidate>${campos}
      <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar-prov>${id ? "Cerrar" : "Cancelar"}</button></div>
    </form></div>`;
}

// Documentos de un proveedor o aseguradora: se suben o se eligen y quedan asociados al momento.
function seccionDocsProveedor(id, titulo) {
  const disponibles = datos.documentos.filter(x => x.categoria === "Proveedores" && !datos.docsProveedor.some(pd => pd.proveedor_id === id && pd.documento_id === x.id));
  return `<fieldset class="docs-proveedor-form bloque-sm" data-docs-proveedor="${id}" data-titulo="${esc(titulo)}"><legend>Documentos ${esc(titulo)}</legend>
    ${htmlDocsProveedor(datos, id, true)}
    <div class="grid tres">
      <div><label for="pd-tipo">Tipo de documento</label><select id="pd-tipo" data-pdoc="tipo">${TIPOS_DOC_PROVEEDOR.map(t => opcion(t, t)).join("")}</select></div>
      <div><label for="pd-vence">Vence el (si aplica)</label><input id="pd-vence" data-pdoc="vence" type="date"></div>
      <div><label for="pd-notas">Notas (opcional)</label><input id="pd-notas" data-pdoc="notas" maxlength="300" placeholder="Ej.: planilla de septiembre"></div>
    </div>
    <div data-subida="pdoc" data-proveedor="${id}"></div>
    <details class="bloque-sm"><summary>O elegir un PDF ya subido en Documentos</summary>
      <div class="row"><select data-pdoc="documento" aria-label="Documento ya subido"><option value="">Elija…</option>${disponibles.map(x => opcion(x.id, `${x.titulo} (${x.fecha})`)).join("")}</select>
      <button class="btn sm" type="button" data-agregar-pdoc="${id}">Agregar</button></div></details>
    <p class="m">Primero elija el tipo y, si aplica, la fecha de vencimiento; luego suba el PDF. Tape cédulas, teléfonos y firmas de personas. No se guardan certificados bancarios.</p>
  </fieldset>`;
}

async function refrescarDocsProveedor(id) {
  const [docs, documentos] = await Promise.all([
    consulta(sb.from("proveedor_documentos").select("*").order("tipo")),
    consulta(sb.from("documentos_privados").select("id,titulo,categoria,fecha,audiencia").eq("estado", "publicado").order("fecha", { ascending: false }))
  ]);
  datos.docsProveedor = docs; datos.documentos = documentos;
  const zona = document.querySelector(`[data-docs-proveedor="${id}"]`);
  if (!zona) return;
  zona.outerHTML = seccionDocsProveedor(id, zona.dataset.titulo);
  despuesDePintar(document.getElementById("prov-form-zona"));
}

// Se llama después de pintar la pestaña: muestra u oculta campos y monta las subidas de PDF.
export function despuesDePintar(cont) {
  if (!cont) return;
  const f = cont.querySelector("#fProveedores");
  ajustarTipoProveedor(f); ajustarAseguradora(f);
  cont.querySelectorAll("[data-subida]:not([data-montada])").forEach(el => {
    el.dataset.montada = "1";
    if (el.dataset.subida === "doc") {
      montarSubida(el, { categoria: el.dataset.categoria, titulo: el.dataset.titulo, etiqueta: "O suba el PDF aquí (se revisa y se tapa igual que en Documentos)",
        alSubir: ({ id, titulo }) => {
          datos.documentos.unshift({ id, titulo, categoria: el.dataset.categoria, fecha: hoyISO(), audiencia: "consejo" });
          const sel = el.closest("form").querySelector("select[name=documento_id]");
          sel.insertAdjacentHTML("beforeend", opcion(id, `${titulo} · recién subido`));
          sel.value = String(id);
          el.insertAdjacentHTML("beforeend", `<p class="m">Quedó elegido arriba. Pulse <b>Guardar</b> para dejarlo asociado.</p>`);
        } });
    } else {
      const pid = Number(el.dataset.proveedor);
      const campo = n => el.closest("fieldset").querySelector(`[data-pdoc="${n}"]`)?.value || "";
      montarSubida(el, { categoria: "Proveedores", titulo: () => `${campo("tipo")} - ${nombreProv(pid)}`, etiqueta: "Subir el PDF del documento",
        alSubir: async ({ id }) => {
          await consulta(sb.from("proveedor_documentos").insert({ proveedor_id: pid, documento_id: id, tipo: campo("tipo"),
            vence_el: campo("vence") || null, notas: campo("notas").trim() || null }));
          avisar(`Documento agregado: ${nombreProv(pid)}`);
          await refrescarDocsProveedor(pid);
        } });
    }
  });
}

// ---------- Vistas ----------
function preparar(vista) {
  if (edicion && edicion.vista !== vista) edicion = null;
  vistaActual = vista;
}

export async function vistaPolizas() {
  preparar("polizas");
  datos = await cargarDatos();
  const anio = datos.conf.smmlv_anio || new Date().getFullYear();
  return `${edicion ? formulario() : ""}
    <div class="panel bloque-sm"><h2>Avisos de pólizas</h2>${htmlAvisos(avisos(datos, "polizas"), "polizas")}
      <div class="grid g2 bloque-sm">
        <form id="fSmmlv" novalidate>
          <label for="sm-val">Salario mínimo mensual ${anio}</label>
          <div class="row"><input id="sm-val" name="smmlv" inputmode="numeric" value="${enPesos(datos.conf.smmlv)}" placeholder="Valor del decreto del año">
            <input name="smmlv_anio" type="number" min="2020" max="2100" value="${anio}" aria-label="Año">
            <button class="btn sm" type="submit">Guardar</button></div>
        </form>
        ${datos.con031 ? `<form id="fAvaluo" novalidate>
          <label for="av-val">Último avalúo de los bienes comunes (incendio y terremoto)</label>
          <div class="row"><input id="av-val" name="avaluo_valor" inputmode="numeric" value="${enPesos(datos.conf.avaluo_valor)}" placeholder="Valor del avalúo">
            <input name="avaluo_fecha" type="date" max="${hoyISO()}" value="${val(datos.conf.avaluo_fecha)}" aria-label="Fecha del avalúo">
            <button class="btn sm" type="submit">Guardar</button></div>
        </form>` : ""}
      </div>
    </div>
    <div class="panel bloque"><h2>Garantías exigidas vs. pólizas contratadas</h2>
      <p class="m">Lo que piden la Ley 675, el reglamento (RPH) y el conjunto, frente a lo que cubren las pólizas vigentes: la del conjunto y la de cada contratista con contrato vigente.</p>
      ${htmlGarantias(datos)}</div>
    <div class="panel bloque"><div class="row espacio"><h2>Pólizas</h2><button class="btn sm" type="button" data-editar-prov="poliza:">Registrar póliza</button></div>${htmlPolizas(datos, boton)}</div>
    ${datos.con031 ? `<div class="panel bloque"><div class="row espacio"><h2>Garantías exigidas</h2><button class="btn sm ghost" type="button" data-editar-prov="requisito:">Agregar garantía</button></div>
      <p class="m">Precargadas con su fuente. Ajústelas solo por cambio de norma o por decisión del consejo; no se borran, se desactivan.</p>${htmlRequisitos(datos, boton)}</div>` : ""}
    <div class="bloque"><h2>Aseguradoras</h2>${htmlProveedores(datos, boton, "Seguros")}</div>`;
}

export async function vistaProveedores() {
  preparar("proveedores");
  datos = await cargarDatos();
  return `${edicion ? formulario() : ""}
    <div class="panel bloque-sm"><h2>Avisos</h2>${htmlAvisos(avisos(datos, "proveedores"), "proveedores")}
      <p class="m">Las pólizas de los contratistas y su comparación con lo exigido están en la pestaña <button class="btn sm ghost" type="button" data-tab="polizas">Pólizas</button></p></div>
    <div class="panel bloque"><div class="row espacio"><h2>Contratos</h2><button class="btn sm" type="button" data-editar-prov="contrato:">Registrar contrato</button></div>${htmlContratos(datos, boton)}</div>
    <div class="bloque"><div class="row espacio"><h2>Proveedores</h2><button class="btn sm" type="button" data-editar-prov="proveedor:">Registrar proveedor</button></div>${htmlProveedores(datos, boton)}</div>`;
}

// Avisos para la pestaña Pendientes del panel.
export async function resumenProveedores() {
  try {
    const d = await cargarDatos();
    const bloque = (titulo, lista, tab) => {
      if (!lista.length) return "";
      const urgentes = lista.filter(a => a.nivel === 2).length;
      return `<div class="panel bloque-sm ${urgentes ? "error" : "nota"}"><h2>${titulo}</h2>
        <p>${urgentes ? `<b>${urgentes} aviso(s) urgente(s)</b>` : ""}${urgentes && lista.length > urgentes ? " y " : ""}${lista.length > urgentes ? `${lista.length - urgentes} por atender pronto` : ""}.</p>
        <button class="btn sm" type="button" data-tab="${tab}">Ver avisos</button></div>`;
    };
    return bloque("Pólizas", avisos(d, "polizas"), "polizas") + bloque("Proveedores y contratos", avisos(d, "proveedores"), "proveedores");
  } catch (e) { return ""; }
}

// ---------- Eventos (los llama admin.js) ----------
const monto = v => { const s = String(v ?? "").replace(/[$\s.]/g, "").replace(",", "."); if (!s) return null; const n = Number(s); return Number.isInteger(n) && n >= 0 ? n : NaN; };

export function manejarProveedoresCambio(e) {
  if (e.target.id === "pv-tipo") { ajustarTipoProveedor(e.target.form); return true; }
  if (e.target.id === "po-aseg") { ajustarAseguradora(e.target.form); return true; }
  return false;
}
function ajustarTipoProveedor(f) {
  if (!f || f.dataset.tipo !== "proveedor") return;
  const persona = f.tipo.value === "persona_natural";
  f.querySelectorAll(".solo-empresa").forEach(x => { x.hidden = persona; });
  f.querySelectorAll(".solo-persona").forEach(x => { x.hidden = !persona; });
}
function ajustarAseguradora(f) {
  if (!f || f.dataset.tipo !== "poliza" || !f.aseguradora_id) return;
  f.querySelectorAll(".solo-nueva-aseg").forEach(x => { x.hidden = f.aseguradora_id.value !== "nueva"; });
}

export async function manejarProveedoresClic(b, msg, repintar) {
  avisar = msg;
  if (b.dataset.editarProv !== undefined) {
    const [tipo, id] = b.dataset.editarProv.split(":");
    if (tipo === "contrato" && !datos?.proveedores.some(p => p.servicio !== "Seguros")) { msg("Primero registre el proveedor.", "error"); return true; }
    edicion = { tipo, id: id ? Number(id) : null, vista: vistaActual };
    await repintar();
    document.getElementById("prov-form-zona")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  if (b.hasAttribute("data-cancelar-prov")) { edicion = null; await repintar(); return true; }
  if (b.hasAttribute("data-agregar-cob")) {
    const cont = b.closest("form").querySelector("[data-coberturas]");
    if (cont.querySelectorAll("[data-cob-fila]").length >= 14) { msg("Máximo 14 coberturas por póliza.", "error"); return true; }
    cont.insertAdjacentHTML("beforeend", filaCobertura());
    return true;
  }
  if (b.hasAttribute("data-quitar-cob")) { b.closest("[data-cob-fila]").remove(); return true; }
  if (b.dataset.agregarPdoc) {
    const fs = b.closest("fieldset");
    const campo = n => fs.querySelector(`[data-pdoc="${n}"]`)?.value || "";
    if (!campo("documento")) { msg("Elija el documento, o súbalo con el botón de arriba.", "error"); return true; }
    const pid = Number(b.dataset.agregarPdoc);
    await consulta(sb.from("proveedor_documentos").insert({ proveedor_id: pid, documento_id: Number(campo("documento")),
      tipo: campo("tipo"), vence_el: campo("vence") || null, notas: campo("notas").trim() || null }));
    msg("Documento agregado."); await refrescarDocsProveedor(pid); return true;
  }
  if (b.dataset.quitarPdoc) {
    if (!confirm("¿Quitar este documento? El PDF sigue en Documentos.")) return true;
    const pid = Number(b.closest("[data-docs-proveedor]")?.dataset.docsProveedor);
    await consulta(sb.from("proveedor_documentos").delete().eq("id", Number(b.dataset.quitarPdoc)));
    msg("Documento quitado."); await refrescarDocsProveedor(pid); return true;
  }
  return false;
}

export async function manejarProveedoresEnvio(f, msg, repintar) {
  avisar = msg;
  if (f.id === "fSmmlv") {
    const v = monto(f.smmlv.value), anio = Number(f.smmlv_anio.value);
    if (!v || Number.isNaN(v)) { msg("Escriba el salario mínimo en pesos, sin decimales.", "error"); return true; }
    await consulta(sb.from("configuracion_conjunto").update({ smmlv: v, smmlv_anio: anio, actualizado_en: new Date().toISOString() }).eq("id", 1));
    msg("Salario mínimo guardado."); await repintar(); return true;
  }
  if (f.id === "fAvaluo") {
    const v = monto(f.avaluo_valor.value);
    if (!v || Number.isNaN(v)) { msg("Escriba el valor del avalúo en pesos, sin decimales.", "error"); return true; }
    if (!f.avaluo_fecha.value) { msg("Escriba la fecha del avalúo.", "error"); return true; }
    await consulta(sb.from("configuracion_conjunto").update({ avaluo_valor: v, avaluo_fecha: f.avaluo_fecha.value, actualizado_en: new Date().toISOString() }).eq("id", 1));
    msg("Avalúo guardado."); await repintar(); return true;
  }
  if (f.id !== "fProveedores") return false;
  const d = Object.fromEntries(new FormData(f));
  const tipo = f.dataset.tipo;
  const vacio = v => (v ?? "").trim() || null;
  const nit = v => !v || /^[0-9.]{5,15}(-[0-9])?$/.test(v);
  let tabla, fila, coberturas = null;
  if (tipo === "proveedor") {
    const persona = d.tipo === "persona_natural";
    if ((d.nombre || "").trim().length < 2) { msg("Escriba el nombre de la empresa o, si es persona natural, el servicio.", "error"); return true; }
    tabla = "proveedores";
    fila = { nombre: d.nombre.trim(), tipo: d.tipo, servicio: d.servicio, estado: d.estado, funciones: vacio(d.funciones),
             nit: persona ? null : vacio(d.nit), telefono: persona ? null : vacio(d.telefono), correo: persona ? null : vacio(d.correo) };
    if (!nit(fila.nit)) { msg("El NIT debe tener solo números, puntos y el dígito de verificación (ej.: 900.123.456-7).", "error"); return true; }
  } else if (tipo === "contrato") {
    const vm = monto(d.valor_mensual), vt = monto(d.valor_total);
    if (!d.proveedor_id || !d.fecha_inicio || (d.objeto || "").trim().length < 3) { msg("Elija el proveedor y escriba el objeto y la fecha de inicio.", "error"); return true; }
    if (Number.isNaN(vm) || Number.isNaN(vt)) { msg("Los valores deben ser pesos, sin decimales.", "error"); return true; }
    if (d.fecha_fin && d.fecha_fin < d.fecha_inicio) { msg("La terminación no puede ser antes del inicio.", "error"); return true; }
    tabla = "contratos";
    fila = { proveedor_id: Number(d.proveedor_id), objeto: d.objeto.trim(), fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin || null,
             valor_mensual: vm, valor_total: vt, rubro: d.rubro || null, supervisor: d.supervisor, estado: d.estado,
             polizas_exigidas: vacio(d.polizas_exigidas), documento_id: d.documento_id ? Number(d.documento_id) : null, notas: vacio(d.notas) };
  } else if (tipo === "requisito") {
    const mv = d.minimo_valor === "" ? null : Number(String(d.minimo_valor).replace(",", "."));
    const necesita = ["avaluo", "smmlv", "porcentaje_contrato"].includes(d.minimo_tipo);
    if (necesita && !(mv > 0)) { msg("Escriba el valor del mínimo (porcentaje o número de salarios mínimos).", "error"); return true; }
    if ((d.fuente || "").trim().length < 3) { msg("Escriba la fuente: la norma, el artículo del RPH o el acta del consejo.", "error"); return true; }
    tabla = "requisitos_poliza";
    fila = { ambito: d.ambito, cobertura: d.cobertura, minimo_tipo: d.minimo_tipo, minimo_valor: necesita ? mv : null, vigencia: vacio(d.vigencia),
             fuente: d.fuente.trim(), nivel: d.nivel, nota: vacio(d.nota), activo: d.activo === "true" };
  } else {
    const va = monto(d.valor_asegurado), pr = monto(d.prima);
    if (!d.vigencia_desde || !d.vigencia_hasta) { msg("Escriba las fechas de vigencia.", "error"); return true; }
    if (d.vigencia_hasta < d.vigencia_desde) { msg("La vigencia no puede terminar antes de empezar.", "error"); return true; }
    if (Number.isNaN(va) || Number.isNaN(pr)) { msg("Los valores deben ser pesos, sin decimales.", "error"); return true; }
    tabla = "polizas";
    fila = { tipo: d.tipo, numero: vacio(d.numero), cubre: vacio(d.cubre), valor_asegurado: va, prima: pr,
             vigencia_desde: d.vigencia_desde, vigencia_hasta: d.vigencia_hasta, estado: d.estado,
             proveedor_id: d.proveedor_id ? Number(d.proveedor_id) : null, documento_id: d.documento_id ? Number(d.documento_id) : null, notas: vacio(d.notas) };
    if (datos.con031) {
      // Coberturas
      coberturas = [];
      for (const r of f.querySelectorAll("[data-cob-fila]")) {
        const v = monto(r.querySelector('[data-cob="valor"]').value);
        if (Number.isNaN(v)) { msg("Los valores asegurados de las coberturas deben ser pesos, sin decimales.", "error"); return true; }
        coberturas.push({ cobertura: r.querySelector('[data-cob="cobertura"]').value, valor_asegurado: v, deducible: vacio(r.querySelector('[data-cob="deducible"]').value) });
      }
      if (new Set(coberturas.map(c => c.cobertura)).size < coberturas.length) { msg("Hay una cobertura repetida en la lista.", "error"); return true; }
      // Aseguradora: una de la base de proveedores, o una nueva que entra a la base.
      if (!d.aseguradora_id) { msg("Elija la aseguradora o registre una nueva.", "error"); return true; }
      if (d.aseguradora_id === "nueva") {
        const nombre = (d.aseg_nombre || "").trim();
        if (nombre.length < 2) { msg("Escriba el nombre de la nueva aseguradora.", "error"); return true; }
        if (!nit(vacio(d.aseg_nit))) { msg("El NIT de la aseguradora debe tener solo números, puntos y el dígito de verificación.", "error"); return true; }
        const existe = datos.proveedores.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
        const id = existe ? existe.id : (await consulta(sb.from("proveedores").insert({ nombre, tipo: "empresa", servicio: "Seguros", estado: "activo",
          nit: vacio(d.aseg_nit), telefono: vacio(d.aseg_telefono), correo: vacio(d.aseg_correo) }).select("id").single())).id;
        if (!existe) datos.proveedores.push({ id, nombre, servicio: "Seguros", estado: "activo" });
        fila.aseguradora_id = id; fila.aseguradora = nombre;
      } else {
        fila.aseguradora_id = Number(d.aseguradora_id); fila.aseguradora = nombreProv(fila.aseguradora_id);
      }
    } else {
      if ((d.aseguradora || "").trim().length < 2) { msg("Escriba la aseguradora.", "error"); return true; }
      fila.aseguradora = d.aseguradora.trim();
    }
  }
  let id = edicion.id;
  if (id) await consulta(sb.from(tabla).update(fila).eq("id", id));
  else id = (await consulta(sb.from(tabla).insert(fila).select("id").single())).id;
  if (coberturas) {
    await consulta(sb.from("poliza_coberturas").delete().eq("poliza_id", id));
    if (coberturas.length) await consulta(sb.from("poliza_coberturas").insert(coberturas.map(c => ({ ...c, poliza_id: id }))));
  }
  // Lo nuevo queda abierto para subirle los documentos; lo editado se cierra.
  const nuevo = !edicion.id && (tipo === "proveedor" || tipo === "poliza");
  msg(nuevo ? "Registrado. Ahora puede subir sus documentos aquí mismo." : edicion.id ? "Cambios guardados." : "Registrado.");
  edicion = nuevo ? { ...edicion, id } : null;
  await repintar();
  if (nuevo) document.getElementById("prov-form-zona")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}
