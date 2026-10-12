// Mesa del Consejo (RPH arts. 57-58, 60, 63, 67, 71-79): reuniones, informe mensual del administrador,
// solicitudes de autorización, compromisos, obligaciones e integrantes.
// Solo para el consejo (principales y suplentes) y la administración, con su cuenta institucional.
// Las DECISIONES (aprobar el informe, decidir solicitudes, aprobar actas) solo las registran los consejeros:
// la base de datos no deja que la administración escriba esas columnas.
import { montarPagina, esc, fecha, hoyISO } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso } from "./supabase.js";
import { barraCuenta, pesos } from "./cuenta.js";
import { semaforo, diasHasta } from "./proveedores-comun.js";

const caja = document.getElementById("consejo");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SECCIONES = [["resumen", "Pendientes"], ["reuniones", "Reuniones"], ["informes", "Informe del administrador"],
                   ["solicitudes", "Autorizaciones"], ["compromisos", "Compromisos"], ["obligaciones", "Obligaciones"], ["integrantes", "Integrantes"]];
const CARGOS = { presidente: "Presidente", vicepresidente: "Vicepresidente", secretario: "Secretario", principal: "Principal", suplente: "Suplente" };
const TIPOS_SOLICITUD = ["Contrato mayor a 2 SMMLV", "Acto extraordinario o urgente", "Contratación de personal", "Apoderado o abogado", "Acción judicial", "Otra"];
const RESPONSABLES = ["Administración", "Consejo", "Presidente del consejo", "Secretario del consejo", "Contadora"];

let estado = null, seccion = "resumen", abierta = null, edicion = null;
let d = null;   // datos cargados

const esAdmin = () => estado.es_admin, esConsejo = () => estado.es_consejo;
const val = v => esc(v ?? "");
const opcion = (v, t, actual) => `<option value="${esc(v)}" ${String(actual ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`;
const pill = (texto, clase) => `<span class="pill ${clase}">${esc(texto)}</span>`;
const quien = uid => d.integrantes.find(i => i.user_id === uid)?.nombre || "un consejero";
const nombreMes = (a, m) => `${MESES[m - 1]} ${a}`;
const fechaReunion = r => `${fecha(r.fecha)}${r.hora ? " · " + r.hora.slice(0, 5) : ""}`;
const monto = v => { const s = String(v ?? "").replace(/[$\s.]/g, ""); if (!s) return null; const n = Number(s); return Number.isInteger(n) && n >= 0 ? n : NaN; };

async function cargar() {
  const [integrantes, reuniones, reunionDocs, asistencia, informes, solicitudes, soportes, compromisos, obligaciones, documentos, conf, proveedores] = await Promise.all([
    rpc("consejo_integrantes"),
    consulta(sb.from("reuniones").select("*").order("fecha", { ascending: false })),
    consulta(sb.from("reunion_documentos").select("*")),
    consulta(sb.from("asistencia").select("*")),
    consulta(sb.from("informes_administrador").select("*").order("anio", { ascending: false }).order("mes", { ascending: false })),
    consulta(sb.from("solicitudes_autorizacion").select("*").order("creado_en", { ascending: false })),
    consulta(sb.from("solicitud_documentos").select("*")),
    consulta(sb.from("compromisos").select("*").order("fecha_limite", { ascending: true, nullsFirst: false })),
    consulta(sb.from("obligaciones").select("*").order("proxima_fecha", { ascending: true, nullsFirst: false })),
    consulta(sb.from("documentos_privados").select("id,titulo,categoria,fecha,audiencia").eq("estado", "publicado").order("fecha", { ascending: false })),
    consulta(sb.from("configuracion_conjunto").select("smmlv,smmlv_anio").eq("id", 1).maybeSingle()),
    consulta(sb.from("proveedores").select("id,nombre").order("nombre"))
  ]);
  d = { integrantes, reuniones, reunionDocs, asistencia, informes, solicitudes, soportes, compromisos, obligaciones, documentos, conf: conf || {}, proveedores };
}

const doc = id => d.documentos.find(x => x.id === id);
const enlaceDoc = id => { const x = doc(id); return x ? `<a href="visor.html?privado=${x.id}" target="_blank" rel="noopener">${esc(x.titulo)}</a>` : ""; };
const selectorDoc = (nombre, actual, categorias) => `<select name="${nombre}"><option value="">Sin documento</option>${d.documentos
  .filter(x => !categorias || categorias.includes(x.categoria) || x.id === actual).map(x => opcion(x.id, `${x.titulo} (${x.fecha})${x.audiencia === "consejo" ? " · solo consejo" : ""}`, actual)).join("")}</select>`;
const checksDocs = (nombre, marcados) => `<div class="lista-checks">${d.documentos.map(x =>
  `<label class="check"><input type="checkbox" name="${nombre}" value="${x.id}" ${marcados.includes(x.id) ? "checked" : ""}> ${esc(x.titulo)} <span class="m">(${esc(x.categoria)}, ${x.fecha}${x.audiencia === "consejo" ? ", solo consejo" : ""})</span></label>`).join("")
  || `<p class="m">No hay documentos publicados. Súbalos primero en el panel, pestaña Documentos (de preferencia «solo consejo»).</p>`}</div>`;
const selectorReunion = (actual, nombre = "reunion_id") => `<select name="${nombre}"><option value="">Sin reunión</option>${d.reuniones.filter(r => r.estado !== "cancelada")
  .map(r => opcion(r.id, `${fechaReunion(r)} · ${r.tipo}`, actual)).join("")}</select>`;

// ---------- Reuniones ----------
const presentes = r => d.asistencia.filter(a => a.reunion_id === r.id && a.estado === "presente").length;
const pillReunion = r => ({ programada: pill("Programada", "p-info"), convocada: pill("Convocada", "p-warn"), realizada: pill("Realizada", "p-ok"), cancelada: pill("Cancelada", "p-bad") }[r.estado]);
const pillActa = r => r.acta_estado === "aprobada" ? pill("Acta aprobada", "p-ok") : r.acta_estado === "borrador" ? pill("Acta en borrador", "p-warn") : r.estado === "realizada" ? pill("Sin acta", "p-bad") : "";
const anticipacion = r => r.convocada_en ? diasHasta(r.fecha) + Math.round((new Date(hoyISO()) - new Date(r.convocada_en.slice(0, 10))) / 86400000) : null;

function textoConvocatoria(r) {
  const docs = d.reunionDocs.filter(x => x.reunion_id === r.id).map(x => doc(x.documento_id)?.titulo).filter(Boolean);
  return `CONVOCATORIA A REUNIÓN ${r.tipo.toUpperCase()} DEL CONSEJO DE ADMINISTRACIÓN\nConjunto Residencial Aragón\n\n` +
    `Fecha: ${fecha(r.fecha)}${r.hora ? `\nHora: ${r.hora.slice(0, 5)}` : ""}${r.lugar ? `\nLugar: ${r.lugar}` : ""}\n\n` +
    `Orden del día:\n${r.orden_dia || "(por definir)"}\n` +
    (docs.length ? `\nDocumentos para revisar (en Aragón en línea → Mesa del Consejo):\n${docs.map(t => "- " + t).join("\n")}\n` : "") +
    `\nSe convoca a principales y suplentes (RPH art. 72).`;
}

function vistaReuniones() {
  let html = `<div class="row espacio"><h2>Reuniones</h2><button class="btn sm" type="button" data-nuevo="reunion">Programar reunión</button></div>
    <p class="m">Ordinarias: el tercer miércoles hábil de cada mes (RPH art. 57). La convocatoria, con el orden del día y los documentos, debe hacerse con al menos 3 días de anticipación (art. 72). Quórum: mínimo 3 integrantes (art. 57).</p>`;
  if (edicion?.tipo === "reunion") html += formReunion();
  html += `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Convocatoria</th><th class="num">Presentes</th><th>Acta</th><th></th></tr></thead><tbody>${d.reuniones.map(r => {
    const ant = anticipacion(r);
    return `<tr><td>${fechaReunion(r)}</td><td>${esc(r.tipo)}</td><td>${pillReunion(r)}</td>
      <td>${r.convocada_en ? `${fecha(r.convocada_en.slice(0, 10))}${ant !== null && ant < 3 ? ` ${pill(`${ant} día(s) antes`, "p-bad")}` : ""}` : `<span class="m">Sin publicar</span>`}</td>
      <td class="num">${r.estado === "realizada" ? `${presentes(r)} ${presentes(r) >= 3 ? pill("Quórum", "p-ok") : pill("Sin quórum", "p-bad")}` : ""}</td>
      <td>${pillActa(r)}</td><td><button class="btn sm ghost" type="button" data-abrir="${r.id}">${abierta === r.id ? "Cerrar" : "Abrir"}</button></td></tr>
      ${abierta === r.id ? `<tr class="fila-detalle"><td colspan="7">${detalleReunion(r)}</td></tr>` : ""}`;
  }).join("") || `<tr><td colspan="7" class="m">Aún no hay reuniones.</td></tr>`}</tbody></table></div>`;
  return html + asistenciaAcumulada();
}

function formReunion() {
  const r = d.reuniones.find(x => x.id === edicion.id) || { tipo: "ordinaria" };
  const marcados = d.reunionDocs.filter(x => x.reunion_id === r.id).map(x => x.documento_id);
  return `<form id="fReunion" class="panel bloque-sm" novalidate><h3>${r.id ? "Editar" : "Programar"} reunión</h3>
    <div class="grid tres">
      <div><label for="re-tipo">Tipo</label><select id="re-tipo" name="tipo">${["ordinaria", "extraordinaria", "instalación"].map(t => opcion(t, t, r.tipo)).join("")}</select></div>
      <div><label for="re-fecha">Fecha</label><input id="re-fecha" name="fecha" type="date" required value="${val(r.fecha)}"></div>
      <div><label for="re-hora">Hora</label><input id="re-hora" name="hora" type="time" value="${val(r.hora?.slice(0, 5))}"></div>
    </div>
    <label for="re-lugar">Lugar</label><input id="re-lugar" name="lugar" maxlength="120" value="${val(r.lugar || "Salón social")}">
    <label for="re-orden">Orden del día</label><textarea id="re-orden" name="orden_dia" maxlength="4000" rows="6" placeholder="1. Verificación del quórum&#10;2. Lectura y aprobación del orden del día&#10;3. Informe de la administración&#10;4. Proposiciones y varios">${val(r.orden_dia)}</textarea>
    <label>Documentos para revisar</label>${checksDocs("documentos", marcados)}
    <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar>Cancelar</button></div></form>`;
}

function detalleReunion(r) {
  const docs = d.reunionDocs.filter(x => x.reunion_id === r.id);
  const comps = d.compromisos.filter(c => c.reunion_id === r.id);
  const asis = id => d.asistencia.find(a => a.reunion_id === r.id && a.perfil_id === id)?.estado || "";
  return `<div class="detalle-reunion">
    ${r.lugar ? `<p><b>Lugar:</b> ${esc(r.lugar)}</p>` : ""}
    <p><b>Orden del día</b></p><p class="texto-lineas">${esc(r.orden_dia || "(por definir)")}</p>
    ${docs.length ? `<p><b>Documentos</b></p><ul class="lista-simple">${docs.map(x => `<li>${enlaceDoc(x.documento_id)}</li>`).join("")}</ul>` : ""}
    <div class="row">
      ${r.estado !== "cancelada" && r.estado !== "realizada" ? `<button class="btn sm ghost" type="button" data-editar="reunion:${r.id}">Editar</button>` : ""}
      ${r.estado === "programada" ? `<button class="btn sm" type="button" data-convocar="${r.id}">Publicar convocatoria</button>` : ""}
      <button class="btn sm ghost" type="button" data-copiar="${r.id}">Copiar texto de la convocatoria</button>
      ${["programada", "convocada"].includes(r.estado) ? `<button class="btn sm ghost" type="button" data-realizada="${r.id}">Marcar realizada</button>
        <button class="btn sm peligro" type="button" data-cancelar-reunion="${r.id}">Cancelar reunión</button>` : ""}
    </div>
    ${r.estado === "realizada" || r.estado === "convocada" ? `<form id="fAsistencia" data-reunion="${r.id}" class="bloque-sm" novalidate><p><b>Asistencia</b> <span class="m">(excusa con 12 horas de anticipación, art. 77)</span></p>
      <div class="tablewrap"><table><tbody>${d.integrantes.map(i => `<tr><td>${esc(i.nombre)} <span class="m">${esc(CARGOS[i.cargo] || "")}</span></td>
        <td><select name="a_${i.perfil_id}" aria-label="Asistencia de ${esc(i.nombre)}"><option value="">—</option>${["presente", "ausente", "excusado"].map(e => opcion(e, e, asis(i.perfil_id))).join("")}</select></td></tr>`).join("")}</tbody></table></div>
      <div class="acciones-form"><button class="btn sm" type="submit">Guardar asistencia</button></div></form>` : ""}
    ${r.estado === "realizada" ? `<form id="fActa" data-reunion="${r.id}" class="bloque-sm" novalidate><p><b>Acta</b> ${pillActa(r)}${r.acta_estado === "aprobada" ? ` <span class="m">por ${esc(quien(r.acta_aprobada_por))}, ${fecha(r.acta_aprobada_en.slice(0, 10))}</span>` : ""}</p>
      ${r.acta_estado === "aprobada" ? `<p>${enlaceDoc(r.acta_documento_id)}</p>` : `${selectorDoc("acta_documento_id", r.acta_documento_id, ["Actas de consejo"])}
        <p class="m">Suba el acta en el panel, pestaña Documentos, categoría «Actas de consejo» (de preferencia «solo consejo»), y elíjala aquí.</p>
        <div class="acciones-form"><button class="btn sm" type="submit">Guardar acta</button>
        ${esConsejo() && r.acta_estado === "borrador" ? `<button class="btn sm" type="button" data-aprobar-acta="${r.id}">Aprobar acta (consejo)</button>` : ""}</div>`}</form>` : ""}
    <p class="bloque-sm"><b>Compromisos de esta reunión</b> <button class="btn sm ghost" type="button" data-nuevo="compromiso:${r.id}">Agregar compromiso</button></p>
    ${comps.length ? tablaCompromisos(comps) : `<p class="m">Sin compromisos.</p>`}
  </div>`;
}

function asistenciaAcumulada() {
  if (!d.integrantes.length) return "";
  const inst = d.reuniones.filter(r => r.tipo === "instalación" && r.estado === "realizada").map(r => r.fecha).sort().at(-1);
  const desde = inst || `${new Date().getFullYear()}-01-01`;
  const realizadas = d.reuniones.filter(r => r.estado === "realizada" && r.fecha >= desde);
  if (!realizadas.length) return "";
  return `<div class="bloque"><h3>Asistencia del período (desde ${fecha(desde)})</h3>
    <p class="m">Quien asista al 90 % de las reuniones del período queda exonerado de una cuota de administración (RPH art. 57, parágrafo).</p>
    <div class="tablewrap"><table><thead><tr><th>Integrante</th><th class="num">Presente</th><th class="num">Excusado</th><th class="num">Ausente</th><th class="num">Asistencia</th></tr></thead>
    <tbody>${d.integrantes.map(i => {
      const est = e => realizadas.filter(r => d.asistencia.some(a => a.reunion_id === r.id && a.perfil_id === i.perfil_id && a.estado === e)).length;
      const pct = Math.round(est("presente") * 100 / realizadas.length);
      return `<tr><td>${esc(i.nombre)} <span class="m">${esc(CARGOS[i.cargo] || "")}</span></td><td class="num">${est("presente")}</td><td class="num">${est("excusado")}</td><td class="num">${est("ausente")}</td>
        <td class="num">${pct} % ${pct >= 90 ? pill("Cumple el 90 %", "p-ok") : ""}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
}

// ---------- Informe del administrador ----------
const pillInforme = i => ({ borrador: pill("Borrador", "p-info"), presentado: pill("Presentado: falta la decisión del consejo", "p-warn"), aprobado: pill("Aprobado", "p-ok"), improbado: pill("Improbado", "p-bad") }[i.estado]);

async function vistaInformes() {
  const [cartera, pqrs] = await Promise.all([rpc("resumen_cartera").catch(() => null), rpc("resumen_pqrs").catch(() => null)]);
  let html = `<div class="row espacio"><h2>Informe mensual del administrador</h2>${esAdmin() ? `<button class="btn sm" type="button" data-nuevo="informe">Preparar informe</button>` : ""}</div>
    <p class="m">Por escrito (RPH art. 74). Incluye el balance del mes para aprobar o improbar (art. 58.14) y la relación de pagos con concepto, acreedor y valor (art. 63). La decisión la registra el consejo.</p>
    <div class="grid tres bloque-sm">
      <div class="panel kpi"><div class="n">${cartera ? pesos(cartera.cartera_total) : "—"}</div><div class="l">Cartera por cobrar${cartera ? ` al ${fecha(cartera.fecha_corte)} · ${cartera.casas_en_mora} casas con saldo` : ""}</div></div>
      <div class="panel kpi"><div class="n">${pqrs ? pqrs.radicadas + pqrs.en_tramite : "—"}</div><div class="l">PQRS abiertas${pqrs ? ` · ${pqrs.abiertas_mas_15_dias_habiles} con más de 15 días hábiles` : ""}</div></div>
      <div class="panel kpi"><div class="n"><a href="finanzas.html">Ver</a></div><div class="l">Ejecución del presupuesto e informes financieros</div></div>
    </div>`;
  if (edicion?.tipo === "informe") html += formInforme();
  html += d.informes.map(i => `<div class="panel bloque-sm">
    <div class="row espacio"><h3>${nombreMes(i.anio, i.mes)}</h3>${pillInforme(i)}</div>
    ${i.presentado_en ? `<p class="m">Presentado el ${fecha(i.presentado_en.slice(0, 10))}</p>` : ""}
    <ul class="lista-simple">
      <li><b>Balance del mes:</b> ${enlaceDoc(i.balance_documento_id) || `<span class="m">sin documento</span>`}</li>
      <li><b>Relación de pagos (concepto, acreedor y valor):</b> ${enlaceDoc(i.pagos_documento_id) || `<span class="m">sin documento</span>`}</li>
    </ul>
    ${i.cartera_gestion ? `<p><b>Cartera y gestión de cobro</b></p><p class="texto-lineas">${esc(i.cartera_gestion)}</p>` : ""}
    ${i.mantenimiento ? `<p><b>Mantenimiento y novedades</b></p><p class="texto-lineas">${esc(i.mantenimiento)}</p>` : ""}
    ${i.otros ? `<p><b>Otros asuntos</b></p><p class="texto-lineas">${esc(i.otros)}</p>` : ""}
    ${["aprobado", "improbado"].includes(i.estado) ? `<div class="aviso ${i.estado === "aprobado" ? "ok" : "error"}">${i.estado === "aprobado" ? "Aprobado" : "Improbado"} por ${esc(quien(i.decision_por))} el ${fecha(i.decision_en.slice(0, 10))}${i.observaciones_consejo ? `: ${esc(i.observaciones_consejo)}` : "."}</div>` : ""}
    <div class="row">
      ${esAdmin() && ["borrador", "presentado"].includes(i.estado) ? `<button class="btn sm ghost" type="button" data-editar="informe:${i.id}">Editar</button>` : ""}
      ${esAdmin() && i.estado === "borrador" ? `<button class="btn sm" type="button" data-presentar="${i.id}">Presentar al consejo</button>` : ""}
    </div>
    ${esConsejo() && i.estado === "presentado" ? `<form class="fDecision" data-tipo="informe" data-id="${i.id}" novalidate>
      <label>Observaciones del consejo (obligatorias si se imprueba)</label><textarea name="observaciones" maxlength="3000"></textarea>
      <label>Reunión en que se decidió</label>${selectorReunion(null)}
      <div class="acciones-form"><button class="btn sm" type="submit" name="decision" value="aprobar">Aprobar</button><button class="btn sm peligro" type="submit" name="decision" value="improbar">Improbar</button></div></form>` : ""}
  </div>`).join("") || `<p class="m">Aún no hay informes.</p>`;
  return html;
}

function formInforme() {
  const i = d.informes.find(x => x.id === edicion.id) || {};
  const hoy = new Date(), previo = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return `<form id="fInformeAdm" class="panel bloque-sm" novalidate><h3>${i.id ? `Editar informe de ${nombreMes(i.anio, i.mes)}` : "Preparar informe"}</h3>
    ${i.id ? "" : `<div class="grid tres"><div><label for="ia-anio">Año</label><input id="ia-anio" name="anio" type="number" min="2020" max="2100" value="${previo.getFullYear()}"></div>
      <div><label for="ia-mes">Mes</label><select id="ia-mes" name="mes">${MESES.map((m, k) => opcion(k + 1, m, previo.getMonth() + 1)).join("")}</select></div></div>`}
    <label>Balance del mes (PDF)</label>${selectorDoc("balance_documento_id", i.balance_documento_id, ["Estados financieros", "Informes de gestión"])}
    <label>Relación de pagos con concepto, acreedor y valor (PDF, «solo consejo»)</label>${selectorDoc("pagos_documento_id", i.pagos_documento_id, ["Informes de gestión", "Estados financieros"])}
    <label for="ia-cart">Cartera y gestión de cobro</label><textarea id="ia-cart" name="cartera_gestion" maxlength="3000">${val(i.cartera_gestion)}</textarea>
    <label for="ia-mant">Mantenimiento y novedades</label><textarea id="ia-mant" name="mantenimiento" maxlength="3000">${val(i.mantenimiento)}</textarea>
    <label for="ia-otros">Otros asuntos</label><textarea id="ia-otros" name="otros" maxlength="3000">${val(i.otros)}</textarea>
    <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar>Cancelar</button></div></form>`;
}

// ---------- Solicitudes de autorización ----------
const pillSolicitud = s => ({ pendiente: pill("Pendiente", "p-warn"), aprobada: pill("Aprobada", "p-ok"), negada: pill("Negada", "p-bad"), aplazada: pill("Aplazada", "p-info"), retirada: pill("Retirada", "p-info") }[s.estado]);

function vistaSolicitudes() {
  const smmlv = Number(d.conf.smmlv || 0);
  let html = `<div class="row espacio"><h2>Solicitudes de autorización</h2>${esAdmin() ? `<button class="btn sm" type="button" data-nuevo="solicitud">Nueva solicitud</button>` : ""}</div>
    <p class="m">El consejo autoriza contratos de más de 2 salarios mínimos${smmlv ? ` (más de ${pesos(2 * smmlv)} en ${d.conf.smmlv_anio})` : ""} (RPH art. 58.9), actos extraordinarios o urgentes (58.7), la contratación de personal (58.16 y 60.14) y abogados o acciones judiciales (58.5 y 58.10). La decisión formal queda en el acta.</p>`;
  if (edicion?.tipo === "solicitud") html += formSolicitud();
  html += d.solicitudes.map(s => {
    const sop = d.soportes.filter(x => x.solicitud_id === s.id);
    return `<div class="panel bloque-sm">
      <div class="row espacio"><h3>${esc(s.titulo)}</h3>${pillSolicitud(s)}</div>
      <p class="m">${esc(s.tipo)} · presentada el ${fecha(s.creado_en.slice(0, 10))}${s.valor != null ? ` · valor ${pesos(s.valor)}` : ""}${s.proveedor_id ? ` · ${esc(d.proveedores.find(p => p.id === s.proveedor_id)?.nombre || "")}` : ""}</p>
      ${s.descripcion ? `<p class="texto-lineas">${esc(s.descripcion)}</p>` : ""}
      ${sop.length ? `<p><b>Soportes</b></p><ul class="lista-simple">${sop.map(x => `<li>${enlaceDoc(x.documento_id)}</li>`).join("")}</ul>` : ""}
      ${s.decision_en ? `<div class="aviso ${s.estado === "aprobada" ? "ok" : s.estado === "negada" ? "error" : "info"}">${pillSolicitud(s)} por ${esc(quien(s.decision_por))} el ${fecha(s.decision_en.slice(0, 10))}${s.decision_observacion ? `: ${esc(s.decision_observacion)}` : "."}</div>` : ""}
      <div class="row">${esAdmin() && ["pendiente", "aplazada"].includes(s.estado) ? `<button class="btn sm ghost" type="button" data-editar="solicitud:${s.id}">${s.estado === "aplazada" ? "Completar y volver a presentar" : "Editar"}</button>` : ""}
        ${esAdmin() && s.estado === "pendiente" ? `<button class="btn sm peligro" type="button" data-retirar="${s.id}">Retirar</button>` : ""}</div>
      ${esConsejo() && ["pendiente", "aplazada"].includes(s.estado) ? `<form class="fDecision" data-tipo="solicitud" data-id="${s.id}" novalidate>
        <label>Observación (obligatoria si se niega o se aplaza)</label><textarea name="observaciones" maxlength="2000"></textarea>
        <label>Reunión en que se decidió</label>${selectorReunion(null)}
        <div class="acciones-form"><button class="btn sm" type="submit" name="decision" value="aprobada">Aprobar</button>
          <button class="btn sm ghost" type="submit" name="decision" value="aplazada">Aplazar</button>
          <button class="btn sm peligro" type="submit" name="decision" value="negada">Negar</button></div></form>` : ""}
    </div>`;
  }).join("") || `<p class="m">Aún no hay solicitudes.</p>`;
  return html;
}

function formSolicitud() {
  const s = d.solicitudes.find(x => x.id === edicion.id) || { tipo: TIPOS_SOLICITUD[0] };
  const marcados = d.soportes.filter(x => x.solicitud_id === s.id).map(x => x.documento_id);
  return `<form id="fSolicitud" class="panel bloque-sm" novalidate><h3>${s.id ? "Editar" : "Nueva"} solicitud</h3>
    <div class="grid tres">
      <div><label for="so-tipo">Tipo</label><select id="so-tipo" name="tipo">${TIPOS_SOLICITUD.map(t => opcion(t, t, s.tipo)).join("")}</select></div>
      <div><label for="so-val">Valor (pesos)</label><input id="so-val" name="valor" inputmode="numeric" value="${s.valor != null ? pesos(s.valor).replace("$", "") : ""}"></div>
      <div><label for="so-prov">Proveedor (opcional)</label><select id="so-prov" name="proveedor_id"><option value="">—</option>${d.proveedores.map(p => opcion(p.id, p.nombre, s.proveedor_id)).join("")}</select></div>
    </div>
    <label for="so-tit">Qué se solicita</label><input id="so-tit" name="titulo" maxlength="200" required value="${val(s.titulo)}" placeholder="Ej.: Pintura de fachadas de las casas 1 a 10">
    <label for="so-des">Justificación</label><textarea id="so-des" name="descripcion" maxlength="4000">${val(s.descripcion)}</textarea>
    <label>Soportes (cotizaciones, hojas de vida, conceptos)</label>${checksDocs("soportes", marcados)}
    <div id="so-aviso"></div>
    <div class="acciones-form"><button class="btn" type="submit">${s.estado === "aplazada" ? "Volver a presentar" : "Guardar"}</button><button class="btn ghost" type="button" data-cancelar>Cancelar</button></div></form>`;
}

// ---------- Compromisos ----------
function tablaCompromisos(lista) {
  return `<div class="tablewrap"><table><thead><tr><th>Compromiso</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th></th></tr></thead><tbody>${lista.map(c => {
    const vencido = c.fecha_limite && !["cumplido", "cancelado"].includes(c.estado) && diasHasta(c.fecha_limite) < 0;
    const reunion = d.reuniones.find(r => r.id === c.reunion_id);
    return `<tr><td>${esc(c.descripcion)}${c.avance ? `<div class="m">${esc(c.avance)}</div>` : ""}${reunion ? `<div class="m">Reunión del ${fecha(reunion.fecha)}</div>` : ""}</td>
      <td>${esc(c.responsable)}</td><td>${c.fecha_limite ? fecha(c.fecha_limite) : ""}</td>
      <td>${vencido ? pill("Vencido", "p-bad") : pill(c.estado, c.estado === "cumplido" ? "p-ok" : c.estado === "cancelado" ? "p-info" : "p-warn")}</td>
      <td><button class="btn sm ghost" type="button" data-editar="compromiso:${c.id}">Actualizar</button></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function vistaCompromisos() {
  const abiertos = d.compromisos.filter(c => !["cumplido", "cancelado"].includes(c.estado));
  const cerrados = d.compromisos.filter(c => ["cumplido", "cancelado"].includes(c.estado));
  return `<div class="row espacio"><h2>Compromisos</h2><button class="btn sm" type="button" data-nuevo="compromiso:">Nuevo compromiso</button></div>
    ${edicion?.tipo === "compromiso" ? formCompromiso() : ""}
    ${abiertos.length ? tablaCompromisos(abiertos) : `<p class="m">No hay compromisos abiertos.</p>`}
    ${cerrados.length ? `<details class="bloque-sm"><summary>Cumplidos y cancelados (${cerrados.length})</summary>${tablaCompromisos(cerrados)}</details>` : ""}`;
}

function formCompromiso() {
  const c = d.compromisos.find(x => x.id === edicion.id) || { responsable: "Administración", estado: "pendiente", reunion_id: edicion.reunion || null };
  const otros = !RESPONSABLES.includes(c.responsable);
  return `<form id="fCompromiso" class="panel bloque-sm" novalidate><h3>${c.id ? "Actualizar" : "Nuevo"} compromiso</h3>
    <label for="co-des">Compromiso</label><input id="co-des" name="descripcion" maxlength="500" required value="${val(c.descripcion)}">
    <div class="grid tres">
      <div><label for="co-resp">Responsable</label><select id="co-resp" name="responsable">${RESPONSABLES.map(x => opcion(x, x, c.responsable)).join("")}${otros ? opcion(c.responsable, c.responsable, c.responsable) : ""}</select></div>
      <div><label for="co-fec">Fecha límite</label><input id="co-fec" name="fecha_limite" type="date" value="${val(c.fecha_limite)}"></div>
      <div><label for="co-est">Estado</label><select id="co-est" name="estado">${["pendiente", "en curso", "cumplido", "cancelado"].map(e => opcion(e, e, c.estado)).join("")}</select></div>
    </div>
    ${c.id ? "" : `<label>Reunión</label>${selectorReunion(c.reunion_id)}`}
    <label for="co-av">Avance</label><textarea id="co-av" name="avance" maxlength="2000">${val(c.avance)}</textarea>
    <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar>Cancelar</button></div></form>`;
}

// ---------- Obligaciones ----------
const sumar = (f, per) => { if (!f) return null; const x = new Date(f + "T00:00:00"); const m = { mensual: 1, trimestral: 3, anual: 12 }[per]; if (!m) return null; x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };

function vistaObligaciones() {
  const activas = d.obligaciones.filter(o => o.activa);
  return `<div class="row espacio"><h2>Calendario de obligaciones</h2>${esAdmin() ? `<button class="btn sm" type="button" data-nuevo="obligacion">Nueva obligación</button>` : ""}</div>
    <p class="m">Precargadas las del RPH y la Ley 675. Las fechas de las pólizas están en <a href="polizas.html">Pólizas</a>.</p>
    ${edicion?.tipo === "obligacion" ? formObligacion() : ""}
    <div class="tablewrap"><table><thead><tr><th>Obligación</th><th>Fuente</th><th>Responsable</th><th>Próxima fecha</th><th>Última vez</th>${esAdmin() ? "<th></th>" : ""}</tr></thead><tbody>${activas.map(o => {
      const s = o.proxima_fecha ? semaforo(o.proxima_fecha) : null;
      return `<tr><td>${esc(o.nombre)}${o.notas ? `<div class="m">${esc(o.notas)}</div>` : ""}</td><td class="m">${esc(o.fuente || "")}</td><td>${esc(o.responsable)}</td>
        <td>${o.proxima_fecha ? `${fecha(o.proxima_fecha)} ${s.nivel ? pill(s.texto.replace("Vencida", "Vencida").replace("Vigente hasta", ""), s.clase) : ""}` : `<span class="m">${esc(o.periodicidad)}</span>`}</td>
        <td>${o.ultima_cumplida ? fecha(o.ultima_cumplida) : ""}</td>
        ${esAdmin() ? `<td class="row"><button class="btn sm" type="button" data-cumplida="${o.id}">Cumplida</button><button class="btn sm ghost" type="button" data-editar="obligacion:${o.id}">Editar</button></td>` : ""}</tr>`;
    }).join("") || `<tr><td colspan="6" class="m">No hay obligaciones.</td></tr>`}</tbody></table></div>`;
}

function formObligacion() {
  const o = d.obligaciones.find(x => x.id === edicion.id) || { periodicidad: "anual", responsable: "Administración", activa: true };
  return `<form id="fObligacion" class="panel bloque-sm" novalidate><h3>${o.id ? "Editar" : "Nueva"} obligación</h3>
    <label for="ob-nom">Obligación</label><input id="ob-nom" name="nombre" maxlength="200" required value="${val(o.nombre)}">
    <div class="grid tres">
      <div><label for="ob-fue">Fuente (norma)</label><input id="ob-fue" name="fuente" maxlength="200" value="${val(o.fuente)}"></div>
      <div><label for="ob-per">Periodicidad</label><select id="ob-per" name="periodicidad">${["mensual", "trimestral", "anual", "única", "cuando ocurra"].map(p => opcion(p, p, o.periodicidad)).join("")}</select></div>
      <div><label for="ob-fec">Próxima fecha</label><input id="ob-fec" name="proxima_fecha" type="date" value="${val(o.proxima_fecha)}"></div>
      <div><label for="ob-resp">Responsable</label><input id="ob-resp" name="responsable" maxlength="80" value="${val(o.responsable)}"></div>
      <div><label for="ob-act">Estado</label><select id="ob-act" name="activa">${opcion("true", "Activa", String(o.activa))}${opcion("false", "Inactiva", String(o.activa))}</select></div>
    </div>
    <label for="ob-not">Notas</label><textarea id="ob-not" name="notas" maxlength="1000">${val(o.notas)}</textarea>
    <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cancelar>Cancelar</button></div></form>`;
}

// ---------- Integrantes ----------
function vistaIntegrantes() {
  return `<h2>Integrantes del consejo</h2>
    <p class="m">Cinco principales y cinco suplentes numéricos (RPH arts. 57 y 66). Cada integrante entra con su cuenta institucional del consejo (aparte de la de su casa). ${esAdmin() ? "Para dar acceso a un integrante nuevo, el administrador de la página usa el archivo 004 (ver manual)." : ""}</p>
    <div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Cargo</th><th>Correo</th></tr></thead><tbody>${d.integrantes.map(i => `<tr><td>${esc(i.nombre)}</td>
      <td>${esAdmin() ? `<select data-cargo="${i.perfil_id}" aria-label="Cargo de ${esc(i.nombre)}"><option value="">Sin cargo</option>${Object.entries(CARGOS).map(([k, t]) => opcion(k, t, i.cargo)).join("")}</select>` : esc(CARGOS[i.cargo] || "Sin cargo")}</td>
      <td>${esc(i.correo)}</td></tr>`).join("") || `<tr><td colspan="3" class="m">Aún no hay cuentas del consejo.</td></tr>`}</tbody></table></div>`;
}

// ---------- Pendientes (resumen) ----------
function vistaResumen() {
  const items = [];
  const prox = d.reuniones.filter(r => ["programada", "convocada"].includes(r.estado) && r.fecha >= hoyISO()).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (prox) items.push([prox.estado === "programada" && diasHasta(prox.fecha) <= 5 ? 2 : 0, `Próxima reunión: ${fechaReunion(prox)} (${prox.tipo}) · ${prox.estado === "convocada" ? "convocada" : "falta publicar la convocatoria"}.`, "reuniones"]);
  for (const s of d.solicitudes.filter(s => s.estado === "pendiente")) items.push([esConsejo() ? 2 : 1, `Solicitud pendiente de decisión: ${s.titulo}.`, "solicitudes"]);
  for (const i of d.informes.filter(i => i.estado === "presentado")) items.push([esConsejo() ? 2 : 1, `Informe de ${nombreMes(i.anio, i.mes)} presentado: falta la decisión del consejo.`, "informes"]);
  for (const r of d.reuniones.filter(r => r.acta_estado === "borrador")) items.push([1, `Acta de la reunión del ${fecha(r.fecha)} en borrador: falta aprobarla.`, "reuniones"]);
  for (const r of d.reuniones.filter(r => r.estado === "realizada" && r.acta_estado === "sin acta")) items.push([1, `La reunión del ${fecha(r.fecha)} no tiene acta.`, "reuniones"]);
  for (const c of d.compromisos.filter(c => c.fecha_limite && !["cumplido", "cancelado"].includes(c.estado) && diasHasta(c.fecha_limite) < 0)) items.push([2, `Compromiso vencido (${c.responsable}): ${c.descripcion}.`, "compromisos"]);
  for (const o of d.obligaciones.filter(o => o.activa && o.proxima_fecha && diasHasta(o.proxima_fecha) <= 60)) {
    const s = semaforo(o.proxima_fecha);
    items.push([s.nivel, `${o.nombre}: ${s.texto.toLowerCase()}.`, "obligaciones"]);
  }
  const mesAnterior = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  if (!d.informes.some(i => i.anio === mesAnterior.getFullYear() && i.mes === mesAnterior.getMonth() + 1)) {
    items.push([1, `Falta el informe del administrador de ${nombreMes(mesAnterior.getFullYear(), mesAnterior.getMonth() + 1)}.`, "informes"]);
  }
  items.sort((a, b) => b[0] - a[0]);
  return `<h2>Pendientes</h2>${items.length ? `<ul class="avisos-control">${items.map(([n, t, s]) => `<li class="${n === 2 ? "urgente" : "pronto"}"><span class="pill ${n === 2 ? "p-bad" : n === 1 ? "p-warn" : "p-info"}">${n === 2 ? "Urgente" : n === 1 ? "Pronto" : "Info"}</span>
      <span>${esc(t)}</span> <button class="btn sm ghost" type="button" data-seccion="${s}">Ver</button></li>`).join("")}</ul>` : `<div class="aviso ok">No hay pendientes.</div>`}`;
}

// ---------- Pintar ----------
async function pintar() {
  const cont = document.getElementById("mesa-contenido");
  try {
    await cargar();
    const vistas = { resumen: vistaResumen, reuniones: vistaReuniones, informes: vistaInformes, solicitudes: vistaSolicitudes, compromisos: vistaCompromisos, obligaciones: vistaObligaciones, integrantes: vistaIntegrantes };
    cont.innerHTML = await vistas[seccion]();
    caja.querySelectorAll("[data-seccion]").forEach(b => b.closest(".pestanas") && b.setAttribute("aria-selected", b.dataset.seccion === seccion));
  } catch (err) {
    aviso(cont, err.message, "error");
  }
}
const msg = (t, tipo = "ok") => aviso(document.getElementById("mesa-msg"), t, tipo);

// ---------- Eventos ----------
caja.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b || b.type === "submit") return;
  try {
    if (b.dataset.seccion) { seccion = b.dataset.seccion; edicion = null; abierta = null; msg(""); await pintar(); window.scrollTo(0, 0); return; }
    if (b.dataset.abrir) { abierta = abierta === +b.dataset.abrir ? null : +b.dataset.abrir; await pintar(); return; }
    if (b.dataset.nuevo !== undefined) {
      const [tipo, reunion] = b.dataset.nuevo.split(":");
      edicion = { tipo, id: null, reunion: reunion ? +reunion : null };
      if (tipo === "compromiso" && seccion !== "compromisos" && seccion !== "reuniones") seccion = "compromisos";
      if (tipo === "compromiso" && seccion === "reuniones") seccion = "compromisos";
      await pintar(); caja.querySelector("form")?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    if (b.dataset.editar) {
      const [tipo, id] = b.dataset.editar.split(":");
      edicion = { tipo, id: +id };
      if (tipo === "compromiso") seccion = "compromisos";
      await pintar(); caja.querySelector("form")?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    if (b.hasAttribute("data-cancelar")) { edicion = null; await pintar(); return; }
    if (b.dataset.convocar) {
      const r = d.reuniones.find(x => x.id === +b.dataset.convocar);
      const dias = diasHasta(r.fecha);
      if (dias < 3 && !confirm(`La reunión es en ${dias} día(s). El RPH (art. 72) pide convocar con al menos 3 días de anticipación (las extraordinarias pueden convocarse por teléfono o medio electrónico, dejando constancia en el acta). ¿Publicar de todos modos?`)) return;
      await consulta(sb.from("reuniones").update({ estado: "convocada", convocada_en: new Date().toISOString() }).eq("id", r.id));
      msg("Convocatoria publicada: la ven todos los consejeros en la plataforma. Use «Copiar texto» para enviarla también por WhatsApp o correo."); await pintar(); return;
    }
    if (b.dataset.copiar) {
      const texto = textoConvocatoria(d.reuniones.find(x => x.id === +b.dataset.copiar));
      try { await navigator.clipboard.writeText(texto); msg("Texto de la convocatoria copiado. Péguelo en WhatsApp o en un correo."); }
      catch (err) { prompt("Copie el texto de la convocatoria:", texto); }
      return;
    }
    if (b.dataset.realizada) {
      if (!confirm("¿Marcar la reunión como realizada? Luego registre la asistencia y el acta.")) return;
      await consulta(sb.from("reuniones").update({ estado: "realizada" }).eq("id", +b.dataset.realizada));
      msg("Reunión marcada como realizada."); await pintar(); return;
    }
    if (b.dataset.cancelarReunion) {
      if (!confirm("¿Cancelar esta reunión? Queda en el historial.")) return;
      await consulta(sb.from("reuniones").update({ estado: "cancelada" }).eq("id", +b.dataset.cancelarReunion));
      msg("Reunión cancelada."); await pintar(); return;
    }
    if (b.dataset.aprobarActa) {
      if (!confirm("¿Aprobar el acta? Después no se podrá cambiar el documento.")) return;
      const r = await rpc("consejo_aprobar_acta", { p_reunion: +b.dataset.aprobarActa });
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintar(); return;
    }
    if (b.dataset.presentar) {
      if (!confirm("¿Presentar el informe al consejo? Podrá seguir corrigiéndolo hasta que el consejo decida.")) return;
      await consulta(sb.from("informes_administrador").update({ estado: "presentado", presentado_en: new Date().toISOString() }).eq("id", +b.dataset.presentar));
      msg("Informe presentado al consejo."); await pintar(); return;
    }
    if (b.dataset.retirar) {
      if (!confirm("¿Retirar esta solicitud? Queda en el historial.")) return;
      await consulta(sb.from("solicitudes_autorizacion").update({ estado: "retirada" }).eq("id", +b.dataset.retirar));
      msg("Solicitud retirada."); await pintar(); return;
    }
    if (b.dataset.cumplida) {
      const o = d.obligaciones.find(x => x.id === +b.dataset.cumplida);
      const siguiente = sumar(o.proxima_fecha, o.periodicidad);
      if (!confirm(`¿Marcar «${o.nombre}» como cumplida hoy?${siguiente ? ` La próxima fecha pasa al ${fecha(siguiente)}.` : ""}`)) return;
      await consulta(sb.from("obligaciones").update({ ultima_cumplida: hoyISO(), proxima_fecha: siguiente ?? (["única", "cuando ocurra"].includes(o.periodicidad) ? null : o.proxima_fecha) }).eq("id", o.id));
      msg("Obligación marcada como cumplida."); await pintar(); return;
    }
  } catch (err) { msg(err.message, "error"); }
});

caja.addEventListener("change", async e => {
  const cargo = e.target.dataset?.cargo;
  if (!cargo) return;
  try {
    const r = await rpc("admin_cargo_consejo", { p_perfil: cargo, p_cargo: e.target.value || null });
    msg(r.mensaje, r.ok ? "ok" : "error"); await pintar();
  } catch (err) { msg(err.message, "error"); }
});

caja.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const datos = Object.fromEntries(new FormData(f));
  const vacio = v => (v ?? "").trim() || null;
  const marcados = nombre => [...f.querySelectorAll(`[name=${nombre}]:checked`)].map(x => +x.value);
  const boton = e.submitter;
  if (boton) boton.disabled = true;
  try {
    if (f.id === "fReunion") {
      if (!datos.fecha) { msg("Escriba la fecha de la reunión.", "error"); return; }
      const fila = { tipo: datos.tipo, fecha: datos.fecha, hora: datos.hora || null, lugar: vacio(datos.lugar), orden_dia: vacio(datos.orden_dia) };
      let id = edicion.id;
      if (id) await consulta(sb.from("reuniones").update(fila).eq("id", id));
      else id = (await consulta(sb.from("reuniones").insert(fila).select("id").single())).id;
      const antes = d.reunionDocs.filter(x => x.reunion_id === id).map(x => x.documento_id), ahora = marcados("documentos");
      for (const q of antes.filter(x => !ahora.includes(x))) await consulta(sb.from("reunion_documentos").delete().eq("reunion_id", id).eq("documento_id", q));
      const nuevos = ahora.filter(x => !antes.includes(x)).map(q => ({ reunion_id: id, documento_id: q }));
      if (nuevos.length) await consulta(sb.from("reunion_documentos").insert(nuevos));
      edicion = null; abierta = id; msg("Reunión guardada."); await pintar(); return;
    }
    if (f.id === "fAsistencia") {
      const reunion = +f.dataset.reunion;
      for (const i of d.integrantes) {
        const valor = datos[`a_${i.perfil_id}`];
        if (!valor) continue;
        const existe = d.asistencia.find(a => a.reunion_id === reunion && a.perfil_id === i.perfil_id);
        if (existe) { if (existe.estado !== valor) await consulta(sb.from("asistencia").update({ estado: valor }).eq("reunion_id", reunion).eq("perfil_id", i.perfil_id)); }
        else await consulta(sb.from("asistencia").insert({ reunion_id: reunion, perfil_id: i.perfil_id, estado: valor }));
      }
      const pres = Object.entries(datos).filter(([k, v]) => k.startsWith("a_") && v === "presente").length;
      msg(`Asistencia guardada: ${pres} presente(s)${pres < 3 ? ". Sin quórum: el RPH pide al menos 3 integrantes (art. 57)." : "."}`, pres < 3 ? "error" : "ok"); await pintar(); return;
    }
    if (f.id === "fActa") {
      await consulta(sb.from("reuniones").update({ acta_documento_id: datos.acta_documento_id ? +datos.acta_documento_id : null }).eq("id", +f.dataset.reunion));
      msg("Acta guardada en borrador. La aprueba el consejo."); await pintar(); return;
    }
    if (f.id === "fInformeAdm") {
      const fila = { balance_documento_id: datos.balance_documento_id ? +datos.balance_documento_id : null, pagos_documento_id: datos.pagos_documento_id ? +datos.pagos_documento_id : null,
                     cartera_gestion: vacio(datos.cartera_gestion), mantenimiento: vacio(datos.mantenimiento), otros: vacio(datos.otros) };
      if (edicion.id) await consulta(sb.from("informes_administrador").update(fila).eq("id", edicion.id));
      else {
        if (d.informes.some(i => i.anio === +datos.anio && i.mes === +datos.mes)) { msg("Ya hay un informe de ese mes: edítelo.", "error"); return; }
        await consulta(sb.from("informes_administrador").insert({ ...fila, anio: +datos.anio, mes: +datos.mes }));
      }
      edicion = null; msg("Informe guardado. Cuando esté listo, use «Presentar al consejo»."); await pintar(); return;
    }
    if (f.id === "fSolicitud") {
      const valor = monto(datos.valor);
      if ((datos.titulo || "").trim().length < 3) { msg("Escriba qué se solicita.", "error"); return; }
      if (Number.isNaN(valor)) { msg("El valor debe ser en pesos, sin decimales.", "error"); return; }
      const smmlv = Number(d.conf.smmlv || 0);
      if (datos.tipo === "Contrato mayor a 2 SMMLV" && smmlv && valor != null && valor <= 2 * smmlv
          && !confirm(`El valor (${pesos(valor)}) no supera 2 salarios mínimos (${pesos(2 * smmlv)}): según el RPH (art. 58.9) la administración puede contratarlo sin autorización. ¿Presentarla de todos modos?`)) return;
      const fila = { tipo: datos.tipo, titulo: datos.titulo.trim(), descripcion: vacio(datos.descripcion), valor, proveedor_id: datos.proveedor_id ? +datos.proveedor_id : null };
      let id = edicion.id;
      const s = d.solicitudes.find(x => x.id === id);
      if (id) await consulta(sb.from("solicitudes_autorizacion").update({ ...fila, ...(s?.estado === "aplazada" ? { estado: "pendiente" } : {}) }).eq("id", id));
      else id = (await consulta(sb.from("solicitudes_autorizacion").insert(fila).select("id").single())).id;
      const antes = d.soportes.filter(x => x.solicitud_id === id).map(x => x.documento_id), ahora = marcados("soportes");
      for (const q of antes.filter(x => !ahora.includes(x))) await consulta(sb.from("solicitud_documentos").delete().eq("solicitud_id", id).eq("documento_id", q));
      const nuevos = ahora.filter(x => !antes.includes(x)).map(q => ({ solicitud_id: id, documento_id: q }));
      if (nuevos.length) await consulta(sb.from("solicitud_documentos").insert(nuevos));
      edicion = null; msg(s?.estado === "aplazada" ? "Solicitud presentada de nuevo al consejo." : "Solicitud guardada: el consejo la verá en Pendientes."); await pintar(); return;
    }
    if (f.id === "fCompromiso") {
      if ((datos.descripcion || "").trim().length < 3) { msg("Escriba el compromiso.", "error"); return; }
      const fila = { descripcion: datos.descripcion.trim(), responsable: datos.responsable, fecha_limite: datos.fecha_limite || null, estado: datos.estado, avance: vacio(datos.avance) };
      if (edicion.id) await consulta(sb.from("compromisos").update(fila).eq("id", edicion.id));
      else await consulta(sb.from("compromisos").insert({ ...fila, reunion_id: datos.reunion_id ? +datos.reunion_id : null }));
      edicion = null; msg("Compromiso guardado."); await pintar(); return;
    }
    if (f.id === "fObligacion") {
      if ((datos.nombre || "").trim().length < 3) { msg("Escriba la obligación.", "error"); return; }
      const fila = { nombre: datos.nombre.trim(), fuente: vacio(datos.fuente), periodicidad: datos.periodicidad, proxima_fecha: datos.proxima_fecha || null,
                     responsable: vacio(datos.responsable) || "Administración", notas: vacio(datos.notas), activa: datos.activa === "true" };
      if (edicion.id) await consulta(sb.from("obligaciones").update(fila).eq("id", edicion.id));
      else await consulta(sb.from("obligaciones").insert(fila));
      edicion = null; msg("Obligación guardada."); await pintar(); return;
    }
    if (f.classList.contains("fDecision")) {
      const decision = boton?.value;
      const obs = vacio(datos.observaciones);
      const reunion = datos.reunion_id ? +datos.reunion_id : null;
      let r;
      if (f.dataset.tipo === "informe") {
        if (!confirm(`¿${decision === "aprobar" ? "Aprobar" : "Improbar"} el informe? Queda registrado con su nombre.`)) return;
        r = await rpc("consejo_decidir_informe", { p_informe: +f.dataset.id, p_aprobado: decision === "aprobar", p_observaciones: obs, p_reunion: reunion });
      } else {
        if (!confirm(`¿Registrar la solicitud como ${decision}? Queda registrado con su nombre.`)) return;
        r = await rpc("consejo_decidir_solicitud", { p_solicitud: +f.dataset.id, p_estado: decision, p_observacion: obs, p_reunion: reunion });
      }
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintar(); return;
    }
  } catch (err) { msg(err.message, "error"); }
  finally { if (boton && document.body.contains(boton)) boton.disabled = false; }
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    const barra = barraCuenta(estado, "Mesa del Consejo", "consejo.html");
    if (!estado.es_admin && !estado.es_consejo) {
      caja.innerHTML = barra + `<div class="panel nota">La Mesa del Consejo es para el consejo de administración y la administración, con su cuenta institucional.</div>`;
      return;
    }
    caja.innerHTML = barra + `<div class="pestanas no-imprimir" role="tablist">${SECCIONES.map(([k, t]) =>
      `<button type="button" role="tab" data-seccion="${k}" aria-selected="${k === seccion}">${t}</button>`).join("")}</div>
      <div id="mesa-msg"></div><div id="mesa-contenido"><p class="m">Cargando…</p></div>`;
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
