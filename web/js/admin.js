// Panel de administración (y censo para el consejo).
import { montarPagina, esc, fecha, hoyISO, cargar } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso, pillEstado, datosForm } from "./supabase.js";
import { barraCuenta, pillPqrs, pillReserva, fechaHora, diasHabilesDesde } from "./cuenta.js";
import { vistaCartera, indicadores as indicadoresCartera, manejarCarteraCambio, manejarCarteraEntrada, manejarCarteraClic, manejarCarteraEnvio } from "./cartera-admin.js";
import { dibujar, activarRecuadros } from "./graficos.js";
import { vistaDocumentos, manejarDocumentosCambio, manejarDocumentosClic, manejarDocumentosEnvio } from "./documentos-admin.js";
import { vistaFinanzas, manejarFinanzasCambio, manejarFinanzasEntrada, manejarFinanzasClic, manejarFinanzasEnvio } from "./finanzas-admin.js";

const caja = document.getElementById("admin");
let estado = null;
let pestana = "pendientes";

const TABLAS = {
  habitantes: { nombre: "Habitante", describir: r => `${esc(r.nombre)} · ${esc(r.relacion)}${r.es_menor ? " (menor)" : ""}` },
  mascotas: { nombre: "Mascota", describir: r => `${esc(r.nombre)} · ${esc(r.especie)}${r.raza ? ", " + esc(r.raza) : ""}${r.vacuna_fecha ? " · vacuna " + fecha(r.vacuna_fecha) : " · sin fecha de vacuna"}${r.potencialmente_peligroso ? " · potencialmente peligroso" + (r.poliza ? ", póliza " + esc(r.poliza) : ", SIN póliza") : ""}` },
  vehiculos: { nombre: "Vehículo", describir: r => `${esc(r.placa || "sin placa")} · ${esc(r.tipo)}${r.marca ? ", " + esc(r.marca) : ""}${r.color ? ", " + esc(r.color) : ""}${r.parqueadero ? " · parq. " + esc(r.parqueadero) : ""}` }
};
const ROL = { propietario: "Propietario", arrendatario: "Arrendatario", administracion: "Administración", consejo: "Consejo" };

function encabezado() {
  const tabs = estado.es_admin
    ? [["pendientes", "Pendientes"], ["pqrs", "PQRS"], ["reservas", "Reservas"], ["zonas", "Zonas"], ["comunicados", "Comunicados"], ["cartera", "Cartera"], ["finanzas", "Finanzas"], ["documentos", "Documentos"],
       ["censo", "Censo"], ["codigos", "Códigos de invitación"], ["cuentas", "Cuentas"]]
    : [["censo", "Censo"]];
  return `${barraCuenta(estado, estado.es_admin ? "Panel de administración" : "Censo del conjunto", "admin.html")}
    <div class="pestanas no-imprimir" role="tablist">${tabs.map(([k, t]) =>
      `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === pestana}">${t}</button>`).join("")}</div>
    <div id="msg" class="no-imprimir"></div>
    <div id="panel-contenido"></div>`;
}

// ---------- Pendientes ----------
async function vistaPendientes() {
  const [cuentas, ...listas] = await Promise.all([
    consulta(sb.from("perfiles").select("id,unidad_id,rol,nombre,correo,creado_en").eq("estado", "pendiente").order("creado_en")),
    ...Object.keys(TABLAS).map(t => consulta(sb.from(t).select("*, perfiles(nombre, rol, estado, vence_el)").eq("estado", "pendiente").order("creado_en")))
  ]);
  // Solo registros de cuentas activas y vigentes (no de arrendatarios retirados o vencidos).
  const vigente = p => p && p.estado === "activo" && (!p.vence_el || p.vence_el >= hoyISO());
  const registros = Object.keys(TABLAS).flatMap((t, i) => listas[i].filter(r => vigente(r.perfiles)).map(r => ({ ...r, _tabla: t })))
    .sort((a, b) => a.unidad_id - b.unidad_id || a.creado_en.localeCompare(b.creado_en));
  return `<div class="grid g2">
    <div class="panel"><h2>Cuentas por aprobar</h2>
      <p class="m">Verifique que la persona sea el propietario de la casa (registro de copropietarios o certificado de libertad) antes de aprobar.</p>
      <div class="list">${cuentas.map(p => `<div class="item"><div>
          <div class="t">Casa ${esc(p.unidad_id)} · ${ROL[p.rol]}</div>
          <div>${esc(p.nombre)}</div><div class="m">${esc(p.correo)} · ${fecha(p.creado_en.slice(0, 10))}</div></div>
          <div class="row"><button class="btn sm" type="button" data-perfil="${p.id}" data-ok="1">Aprobar</button>
          <button class="btn sm ghost" type="button" data-perfil="${p.id}" data-ok="0">Rechazar</button></div></div>`).join("")
        || `<div class="empty">No hay cuentas pendientes.</div>`}</div></div>
    <div class="panel"><h2>Datos por validar</h2>
      <div class="list">${registros.map(r => `<div class="item"><div>
          <div class="t">Casa ${esc(r.unidad_id)} · ${TABLAS[r._tabla].nombre}</div>
          <div>${TABLAS[r._tabla].describir(r)}</div>
          <div class="m">Registrado por ${esc(r.perfiles?.nombre || "")} (${ROL[r.perfiles?.rol] || ""}) · ${fecha(r.creado_en.slice(0, 10))}</div></div>
          <div class="row"><button class="btn sm" type="button" data-registro="${r._tabla}:${r.id}" data-ok="1">Validar</button>
          <button class="btn sm ghost" type="button" data-registro="${r._tabla}:${r.id}" data-ok="0">Rechazar</button></div></div>`).join("")
        || `<div class="empty">No hay datos pendientes de validación.</div>`}</div></div>
  </div>`;
}

// ---------- Censo ----------
async function vistaCenso() {
  const [filas, pq, car] = await Promise.all([rpc("censo"), rpc("resumen_pqrs"), rpc("resumen_cartera")]);
  const suma = k => filas.reduce((a, f) => a + Number(f[k] || 0), 0);
  const conProp = filas.filter(f => f.propietario === "activo").length;
  const conArr = filas.filter(f => f.arrendatario === "activo").length;
  const alDia = filas.filter(f => f.datos_confirmados_en && f.datos_confirmados_en.slice(0, 10) >= haceUnAnio()).length;
  const kpisPqrs = pq ? `<h2>PQRS</h2><div class="kpis">
      <div class="panel kpi"><div class="n">${pq.total}</div><div class="l">PQRS radicadas en total</div></div>
      <div class="panel kpi"><div class="n">${pq.radicadas + pq.en_tramite}</div><div class="l">Abiertas (radicadas o en trámite)</div></div>
      <div class="panel kpi"><div class="n">${pq.respondidas}</div><div class="l">Respondidas</div></div>
      <div class="panel kpi"><div class="n ${pq.abiertas_mas_15_dias_habiles ? "alerta-dias" : ""}">${pq.abiertas_mas_15_dias_habiles}</div><div class="l">Abiertas hace más de 15 días hábiles</div></div>
    </div>` : "";
  return `${indicadoresCartera(car)}${kpisPqrs}<h2>Casas</h2><div class="kpis">
      <div class="panel kpi"><div class="n">${conProp}/40</div><div class="l">Casas con propietario registrado</div></div>
      <div class="panel kpi"><div class="n">${conArr}</div><div class="l">Casas con arrendatario con acceso</div></div>
      <div class="panel kpi"><div class="n">${alDia}/40</div><div class="l">Casas con datos confirmados en el último año</div></div>
      <div class="panel kpi"><div class="n">${suma("habitantes")}</div><div class="l">Habitantes validados</div></div>
      <div class="panel kpi"><div class="n">${suma("mascotas")}</div><div class="l">Mascotas validadas</div></div>
      <div class="panel kpi"><div class="n">${suma("vehiculos")}</div><div class="l">Vehículos validados</div></div>
    </div>
    <div class="panel"><div class="tablewrap"><table>
      <thead><tr><th>Casa</th><th>Propietario</th><th>Arrendatario</th><th class="num">Habitantes</th><th class="num">Mascotas</th><th class="num">Vehículos</th><th class="num">Por validar</th><th>Datos confirmados</th></tr></thead>
      <tbody>${filas.map(f => `<tr><td>${esc(f.casa)}</td><td>${f.propietario ? pillEstado(f.propietario) : `<span class="m">Sin cuenta</span>`}</td>
        <td>${f.arrendatario ? pillEstado(f.arrendatario) : `<span class="m">—</span>`}</td>
        <td class="num">${f.habitantes}</td><td class="num">${f.mascotas}</td><td class="num">${f.vehiculos}</td><td class="num">${f.pendientes || ""}</td>
        <td>${f.datos_confirmados_en ? fecha(f.datos_confirmados_en.slice(0, 10)) : `<span class="m">Nunca</span>`}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="m">El censo no muestra nombres ni teléfonos. ${estado.es_admin ? "Los datos detallados están en las pestañas Pendientes y Cuentas." : ""}</p></div>`;
}

// ---------- PQRS ----------
let filtroPqrs = "abiertas";
let pqrsAbierta = null;

async function vistaPqrs() {
  let q = sb.from("pqrs").select("*, perfiles(nombre, rol)").order("creado_en", { ascending: false }).limit(200);
  if (filtroPqrs === "abiertas") q = q.neq("estado", "respondida");
  const lista = await consulta(q);
  const mensajes = pqrsAbierta ? await consulta(sb.from("pqrs_mensajes").select("*").eq("pqrs_id", pqrsAbierta).order("creado_en")) : [];
  return `<div class="filtros">
      <button type="button" data-filtro-pqrs="abiertas" aria-pressed="${filtroPqrs === "abiertas"}">Abiertas</button>
      <button type="button" data-filtro-pqrs="todas" aria-pressed="${filtroPqrs === "todas"}">Todas</button>
    </div>
    <div class="panel"><div class="list">${lista.map(p => {
      const dias = diasHabilesDesde(p.creado_en);
      const abierta = pqrsAbierta === p.id;
      return `<div class="item"><div class="crece">
        <div class="row"><span class="t">${esc(p.asunto)}</span>${pillPqrs(p.estado)}</div>
        <div class="m">${esc(p.radicado)} · Casa ${esc(p.unidad_id)} · ${esc(p.tipo)} · ${esc(p.perfiles?.nombre || "")} (${ROL[p.perfiles?.rol] || ""})</div>
        <div class="m ${p.estado !== "respondida" && dias > 15 ? "alerta-dias" : ""}">Radicada el ${fecha(p.creado_en.slice(0, 10))} · ${dias} día(s) hábil(es)</div>
        ${abierta ? `<div class="hilo">
            <div class="msj residente"><div class="m">Residente · ${fechaHora(p.creado_en)}</div><div class="texto">${esc(p.descripcion)}</div></div>
            ${mensajes.map(m => `<div class="msj ${m.autor}"><div class="m">${m.autor === "administracion" ? "Administración" : "Residente"} · ${fechaHora(m.creado_en)}</div><div class="texto">${esc(m.texto)}</div></div>`).join("")}
          </div>
          <form data-responder="${p.id}" novalidate>
            <label for="resp-${p.id}">Respuesta al residente</label>
            <textarea id="resp-${p.id}" name="texto" maxlength="3000" required></textarea>
            <div class="acciones-form"><button class="btn sm" type="submit">Enviar respuesta</button>
              ${p.estado === "radicada" ? `<button class="btn sm ghost" type="button" data-tramite="${p.id}">Marcar en trámite</button>` : ""}</div>
          </form>` : ""}
        <button class="btn sm ghost" type="button" data-ver-pqrs="${p.id}">${abierta ? "Ocultar" : "Ver y responder"}</button>
      </div></div>`;
    }).join("") || `<div class="empty">${filtroPqrs === "abiertas" ? "No hay PQRS abiertas." : "No hay PQRS."}</div>`}</div>
    <p class="m">Los días hábiles cuentan de lunes a viernes, sin descontar festivos. Se resaltan las abiertas con más de 15 días hábiles.</p></div>`;
}

// ---------- Reservas ----------
async function vistaReservas() {
  const [zonas, lista] = await Promise.all([
    consulta(sb.from("zonas_reservables").select("id,nombre,turnos")),
    consulta(sb.from("reservas").select("*, perfiles(nombre, rol)").gte("fecha", hoyISO()).in("estado", ["pendiente", "aprobada"]).order("fecha").order("turno"))
  ]);
  const z = id => zonas.find(x => x.id === id);
  const turno = (zid, t) => z(zid)?.turnos.find(x => x.id === t);
  const fila = r => {
    const t = turno(r.zona_id, r.turno);
    return `<div class="item"><div>
      <div class="t">${esc(z(r.zona_id)?.nombre || r.zona_id)} · ${fecha(r.fecha)} · ${esc(t?.nombre || r.turno)}</div>
      <div class="m">Casa ${esc(r.unidad_id)} · ${esc(r.perfiles?.nombre || "")} (${ROL[r.perfiles?.rol] || ""}) · ${r.invitados} persona(s)${t?.tarifa ? " · alquiler " + esc(t.tarifa) : ""}</div>
      ${r.observaciones ? `<div class="m">Observaciones: ${esc(r.observaciones)}</div>` : ""}
      <div class="row">${pillReserva(r.estado)}</div></div>
      <div class="row">${r.estado === "pendiente" ? `<button class="btn sm" type="button" data-reserva="${r.id}" data-ok="1">Aprobar</button>` : ""}
        <button class="btn sm ghost" type="button" data-reserva="${r.id}" data-ok="0">${r.estado === "pendiente" ? "Rechazar" : "Anular"}</button></div></div>`;
  };
  const pend = lista.filter(r => r.estado === "pendiente"), apro = lista.filter(r => r.estado === "aprobada");
  return `<div class="grid g2">
    <div class="panel"><h2>Por aprobar</h2>
      <p class="m">Antes de aprobar, verifique que la casa esté a paz y salvo (el Manual no permite usar el salón ni la BBQ con más de dos meses de mora).</p>
      <div class="list">${pend.map(fila).join("") || `<div class="empty">No hay reservas pendientes.</div>`}</div></div>
    <div class="panel"><h2>Próximas aprobadas</h2>
      <div class="list">${apro.map(fila).join("") || `<div class="empty">No hay reservas aprobadas próximas.</div>`}</div></div>
  </div>`;
}

// ---------- Comunicados ----------
let comunicadoEditado = null;
const CATEGORIAS = ["Mantenimiento", "Asamblea", "Convivencia", "Seguridad", "Financiero", "Administrativo", "Eventos"];

async function vistaComunicados() {
  const [lista, docs] = await Promise.all([
    consulta(sb.from("comunicados").select("*").order("fecha", { ascending: false }).order("id", { ascending: false })),
    cargar("documentos").catch(() => [])
  ]);
  const c = lista.find(x => x.id === comunicadoEditado) || {};
  return `<div class="grid g2">
    <div class="panel"><h2>${c.id ? "Editar comunicado" : "Publicar comunicado"}</h2>
      <form id="fComunicado" novalidate>
        <label for="co-fecha">Fecha</label><input id="co-fecha" name="fecha" type="date" value="${esc(c.fecha || hoyISO())}" required>
        <label for="co-cat">Categoría</label>
        <select id="co-cat" name="categoria">${CATEGORIAS.map(x => `<option ${x === c.categoria ? "selected" : ""}>${x}</option>`).join("")}</select>
        <label for="co-tit">Título</label><input id="co-tit" name="titulo" maxlength="150" required value="${esc(c.titulo || "")}">
        <label for="co-txt">Texto</label><textarea id="co-txt" name="texto" maxlength="5000" required>${esc(c.texto || "")}</textarea>
        <label for="co-adj">Documento adjunto (opcional)</label>
        <select id="co-adj" name="adjunto"><option value="">Sin adjunto</option>${docs.map(d =>
          `<option value="${esc(d.archivo)}" ${d.archivo === c.adjunto ? "selected" : ""}>${esc(d.titulo)}</option>`).join("")}</select>
        <p class="m">Para adjuntar un PDF nuevo, primero súbalo a la lista de documentos (manual de administración, sección 4).</p>
        <label class="check"><input type="checkbox" name="publicado" ${c.id && !c.publicado ? "" : "checked"}> Publicado (visible en el sitio)</label>
        <div class="acciones-form"><button class="btn" type="submit">${c.id ? "Guardar cambios" : "Publicar"}</button>
          ${c.id ? `<button class="btn ghost" type="button" data-cancelar-edicion>Cancelar edición</button>` : ""}</div>
      </form>
    </div>
    <div class="panel"><h2>Comunicados</h2><div class="list">${lista.map(x => `<div class="item"><div>
        <div class="row"><span class="t">${esc(x.titulo)}</span><span class="pill p-info">${esc(x.categoria)}</span>${x.publicado ? "" : `<span class="pill p-warn">No publicado</span>`}</div>
        <div class="m">${fecha(x.fecha)}${x.adjunto ? " · con adjunto" : ""}</div></div>
        <div class="row"><button class="btn sm ghost" type="button" data-editar-com="${x.id}">Editar</button>
          <button class="btn sm peligro" type="button" data-borrar-com="${x.id}">Eliminar</button></div></div>`).join("")
        || `<div class="empty">No hay comunicados.</div>`}</div></div>
  </div>`;
}

// ---------- Zonas reservables (configuración) ----------
const slug = t => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "zona";

const filaTurno = (t = {}) => `<div class="turno-fila" data-turno-fila>
    <input type="hidden" name="t_id" value="${esc(t.id || "")}">
    <div><label>Nombre del turno</label><input name="t_nombre" maxlength="40" value="${esc(t.nombre || "")}" placeholder="Turno de día"></div>
    <div><label>Horario</label><input name="t_horario" maxlength="80" value="${esc(t.horario || "")}" placeholder="10:00 a. m. a 6:00 p. m."></div>
    <div><label>Tarifa</label><input name="t_tarifa" maxlength="40" value="${esc(t.tarifa || "")}" placeholder="2,7 SMDLV"></div>
    <button class="btn sm ghost" type="button" data-quitar-turno>Quitar</button>
  </div>`;

const formZona = (z, nueva = false) => `<form class="panel" data-zona="${nueva ? "" : esc(z.id)}" novalidate>
    <h2>${nueva ? "Nueva zona" : esc(z.nombre)}</h2>
    <label>Nombre</label><input name="nombre" maxlength="60" required value="${esc(z.nombre || "")}">
    ${nueva ? "" : `<label class="check"><input type="checkbox" name="activa" ${z.activa ? "checked" : ""}> Activa (se puede reservar)</label>`}
    <div class="grid tres">
      <div><label>Anticipación mínima (días hábiles)</label><input name="anticipacion_dias_habiles" type="number" min="0" max="60" value="${z.anticipacion_dias_habiles ?? 0}"></div>
      <div><label>Reservar hasta (días adelante)</label><input name="max_dias_adelante" type="number" min="1" max="365" value="${z.max_dias_adelante ?? 90}"></div>
      <div><label>Capacidad (vacío = sin límite)</label><input name="capacidad" type="number" min="1" max="500" value="${z.capacidad ?? ""}"></div>
    </div>
    <label>Reglas que ve el residente al reservar</label>
    <textarea name="reglas" maxlength="1000">${esc(z.reglas || "")}</textarea>
    <h3>Turnos</h3>
    <div data-turnos>${(z.turnos?.length ? z.turnos : [{}]).map(filaTurno).join("")}</div>
    <div class="acciones-form"><button class="btn sm ghost" type="button" data-agregar-turno>Agregar turno</button>
      <button class="btn" type="submit">${nueva ? "Crear zona" : "Guardar cambios"}</button></div>
  </form>`;

async function vistaZonas() {
  const zonas = await consulta(sb.from("zonas_reservables").select("*").order("nombre"));
  return `<div class="panel nota bloque-sm"><p>Ajuste aquí los turnos, horarios, tarifas, anticipación y capacidad de las zonas que se reservan, según lo aprobado por la asamblea, el consejo o el manual de convivencia.
      Los cambios se ven de inmediato en <b>Reservas</b> y en la página pública de <b>Zonas comunes</b>. Una zona desactivada deja de aceptar reservas nuevas; no se borra para conservar su historial.</p>
      <p>Tarifa y horario son texto libre (por ejemplo "2,7 SMDLV" o "$60.000"). La plataforma no cobra: solo informa.</p></div>
    <div class="grid g2">${zonas.map(z => formZona(z)).join("")}${formZona({ turnos: [{}] }, true)}</div>`;
}

function haceUnAnio() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------- Códigos ----------
async function vistaCodigos() {
  const filas = await rpc("censo");
  if (!Array.isArray(filas) || !filas.length) {
    return `<div class="panel error"><p>No se pudo cargar la lista de casas. Espere un momento y vuelva a intentar.</p>
      <button class="btn sm" type="button" data-tab="codigos">Reintentar</button></div>`;
  }
  return `<div class="panel no-imprimir">
      <h2>Generar códigos de invitación</h2>
      <p>Cada propietario usa el código de su casa una sola vez para registrarse. Los códigos vencen a los 60 días.
         <b>Generar un código nuevo anula el anterior</b> que no se haya usado. Los códigos solo se muestran una vez: imprímalos antes de salir de esta pantalla.</p>
      <form id="fCodigos">
        <div class="row"><button class="btn sm ghost" type="button" id="marcarSin">Marcar casas sin propietario</button>
          <button class="btn sm ghost" type="button" id="desmarcar">Desmarcar todas</button></div>
        <div class="tarjetas-codigo bloque-sm">${filas.map(f => `<label class="check"><input type="checkbox" name="casa" value="${f.unidad_id}" data-sin="${f.propietario ? 0 : 1}">
          ${esc(f.casa)} ${f.propietario ? pillEstado(f.propietario) : ""}</label>`).join("")}</div>
        <div class="acciones-form"><button class="btn" type="submit">Generar códigos</button></div>
      </form>
    </div>
    <div id="impresion"></div>`;
}

function tarjetasCodigos(codigos) {
  const sitio = new URL("ingresar.html", location.href).href;
  return `<div class="row no-imprimir cuenta-barra"><h2>Códigos generados</h2><button class="btn" type="button" id="imprimir">Imprimir</button></div>
    <div class="tarjetas-codigo">${codigos.map(c => `<div class="tarjeta-codigo">
      <b>Conjunto Residencial Aragón · Casa ${esc(c.unidad_id)}</b>
      <p class="m">Código de invitación para el propietario</p>
      <div class="codigo">${esc(c.codigo)}</div>
      <p class="m">Válido hasta el ${fecha(c.vence_el)}. Uso único.</p>
      <p>1. Entre a <b>${esc(sitio)}</b><br>2. Escriba su correo y abra el enlace que le llega.<br>3. Acepte la política de datos y escriba este código.</p>
      <p class="m">No comparta este código. Si lo pierde, pida uno nuevo a la administración.</p>
    </div>`).join("")}</div>`;
}

// ---------- Cuentas ----------
async function vistaCuentas() {
  const [perfiles, invs] = await Promise.all([
    consulta(sb.from("perfiles").select("id,unidad_id,rol,estado,nombre,correo,vence_el,creado_en").in("estado", ["activo", "pendiente"]).order("unidad_id", { nullsFirst: true })),
    consulta(sb.from("invitaciones").select("unidad_id,correo,contrato_hasta,vence_el").eq("rol", "arrendatario").is("usada_en", null).is("anulada_en", null).gt("vence_el", new Date().toISOString()))
  ]);
  return `<div class="panel"><h2>Cuentas</h2><div class="tablewrap"><table>
      <thead><tr><th>Casa</th><th>Rol</th><th>Nombre</th><th>Correo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${perfiles.map(p => {
        const vencido = p.vence_el && p.vence_el < hoyISO();
        return `<tr><td>${p.unidad_id ? "Casa " + esc(p.unidad_id) : "—"}</td><td>${ROL[p.rol]}</td><td>${esc(p.nombre)}</td><td>${esc(p.correo)}</td>
          <td>${pillEstado(vencido ? "vencido" : p.estado)}${p.vence_el ? `<div class="m">hasta ${fecha(p.vence_el)}</div>` : ""}</td>
          <td>${p.rol === "administracion" ? "" : `<button class="btn sm peligro" type="button" data-retirar-perfil="${p.id}">Retirar</button>`}</td></tr>`;
      }).join("")}</tbody></table></div></div>
    <div class="grid g2 bloque">
      <div class="panel"><h2>Invitaciones de arrendatario pendientes</h2><div class="list">${invs.map(i => `<div class="item"><div>
          <div class="t">Casa ${esc(i.unidad_id)}</div><div class="m">${esc(i.correo)} · vence ${fecha(i.vence_el.slice(0, 10))}${i.contrato_hasta ? ` · contrato hasta ${fecha(i.contrato_hasta)}` : ""}</div></div></div>`).join("")
          || `<div class="empty">No hay invitaciones pendientes.</div>`}</div></div>
      <div class="panel"><h2>Autorizar arrendatario</h2>
        <p class="m">Úselo solo cuando el propietario no use la plataforma y entregue su <b>autorización escrita</b>. Archive esa autorización.</p>
        <form id="fArrAdmin" novalidate>
          <label for="aa-casa">Casa</label>
          <select id="aa-casa" name="casa">${Array.from({ length: 40 }, (_, i) => `<option value="${i + 1}">Casa ${i + 1}</option>`).join("")}</select>
          <label for="aa-correo">Correo del arrendatario</label><input id="aa-correo" name="correo" type="email" maxlength="120" required>
          <label for="aa-fin">Fin del contrato (opcional)</label><input id="aa-fin" name="contrato_hasta" type="date" min="${hoyISO()}">
          <label class="check"><input type="checkbox" name="puede_ver_cuenta"> El propietario autoriza que vea el estado de cuenta</label>
          <div class="acciones-form"><button class="btn" type="submit">Autorizar</button></div>
        </form>
      </div>
    </div>`;
}

// ---------- Pintar ----------
async function pintarPestana() {
  const cont = document.getElementById("panel-contenido");
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === pestana));
  cont.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    const vistas = { pendientes: vistaPendientes, pqrs: vistaPqrs, reservas: vistaReservas, zonas: vistaZonas, comunicados: vistaComunicados, cartera: vistaCartera, finanzas: vistaFinanzas, documentos: vistaDocumentos,
                     censo: vistaCenso, codigos: vistaCodigos, cuentas: vistaCuentas };
    cont.innerHTML = await vistas[pestana]();
    dibujar(cont);
  } catch (err) {
    aviso(cont, err.message, "error");
  }
}

const msg = (t, tipo = "ok") => aviso(document.getElementById("msg"), t, tipo);

caja.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (await manejarCarteraClic(b, msg, pintarPestana)) return;
    if (await manejarFinanzasClic(b, msg, pintarPestana)) return;
    if (await manejarDocumentosClic(b, msg, pintarPestana)) return;
    if (b.hasAttribute("data-agregar-turno")) {
      const cont = b.closest("form").querySelector("[data-turnos]");
      if (cont.querySelectorAll("[data-turno-fila]").length >= 8) { msg("Máximo 8 turnos por zona.", "error"); return; }
      cont.insertAdjacentHTML("beforeend", filaTurno());
      return;
    }
    if (b.hasAttribute("data-quitar-turno")) {
      const cont = b.closest("[data-turnos]");
      if (cont.querySelectorAll("[data-turno-fila]").length <= 1) { msg("La zona debe tener al menos un turno.", "error"); return; }
      b.closest("[data-turno-fila]").remove();
      return;
    }
    if (b.dataset.filtroPqrs) { filtroPqrs = b.dataset.filtroPqrs; pqrsAbierta = null; await pintarPestana(); return; }
    if (b.dataset.verPqrs) { pqrsAbierta = pqrsAbierta === b.dataset.verPqrs ? null : b.dataset.verPqrs; await pintarPestana(); return; }
    if (b.dataset.tramite) {
      const r = await rpc("admin_estado_pqrs", { p_pqrs: b.dataset.tramite, p_estado: "en_tramite" });
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintarPestana(); return;
    }
    if (b.dataset.reserva) {
      const aprobar = b.dataset.ok === "1";
      const motivo = aprobar ? null : prompt("Motivo (lo verá el residente):");
      if (!aprobar && motivo === null) return;
      const r = await rpc("admin_revisar_reserva", { p_reserva: b.dataset.reserva, p_aprobar: aprobar, p_motivo: motivo });
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintarPestana(); return;
    }
    if (b.dataset.editarCom) { comunicadoEditado = +b.dataset.editarCom; await pintarPestana(); window.scrollTo(0, 0); return; }
    if (b.hasAttribute("data-cancelar-edicion")) { comunicadoEditado = null; await pintarPestana(); return; }
    if (b.dataset.borrarCom) {
      if (!confirm("¿Eliminar este comunicado del sitio? No se puede deshacer.")) return;
      await consulta(sb.from("comunicados").delete().eq("id", +b.dataset.borrarCom));
      if (comunicadoEditado === +b.dataset.borrarCom) comunicadoEditado = null;
      msg("Comunicado eliminado."); await pintarPestana(); return;
    }
    if (b.dataset.tab) { pestana = b.dataset.tab; msg(""); await pintarPestana(); return; }
    if (b.dataset.perfil) {
      const aprobar = b.dataset.ok === "1";
      const motivo = aprobar ? null : prompt("Motivo del rechazo (lo verá la persona):");
      if (!aprobar && motivo === null) return;
      const r = await rpc("admin_revisar_perfil", { p_perfil: b.dataset.perfil, p_aprobar: aprobar, p_motivo: motivo });
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintarPestana(); return;
    }
    if (b.dataset.registro) {
      const [tabla, id] = b.dataset.registro.split(":");
      const aprobar = b.dataset.ok === "1";
      const motivo = aprobar ? null : prompt("Motivo del rechazo (lo verá el residente):");
      if (!aprobar && motivo === null) return;
      await consulta(sb.from(tabla).update({ estado: aprobar ? "validado" : "rechazado", motivo_rechazo: motivo }).eq("id", id));
      msg(aprobar ? "Registro validado." : "Registro rechazado."); await pintarPestana(); return;
    }
    if (b.dataset.retirarPerfil) {
      const motivo = prompt("¿Retirar esta cuenta? Escriba el motivo (por ejemplo, venta de la casa):");
      if (motivo === null) return;
      const r = await rpc("admin_retirar_perfil", { p_perfil: b.dataset.retirarPerfil, p_motivo: motivo });
      msg(r.mensaje, r.ok ? "ok" : "error"); await pintarPestana(); return;
    }
    if (b.id === "marcarSin") { document.querySelectorAll("[name=casa]").forEach(c => { c.checked = c.dataset.sin === "1"; }); return; }
    if (b.id === "desmarcar") { document.querySelectorAll("[name=casa]").forEach(c => { c.checked = false; }); return; }
    if (b.id === "imprimir") { window.print(); return; }
  } catch (err) {
    msg(err.message, "error");
  }
});

caja.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const boton = f.querySelector("button[type=submit]");
  boton.disabled = true;
  try {
    if (await manejarCarteraEnvio(f, msg, pintarPestana)) return;
    if (await manejarFinanzasEnvio(f, msg, pintarPestana)) return;
    if (await manejarDocumentosEnvio(f, msg, pintarPestana)) return;
    if (f.dataset.responder) {
      const texto = (new FormData(f).get("texto") || "").trim();
      if (!texto) { msg("Escriba la respuesta.", "error"); return; }
      const r = await rpc("escribir_pqrs", { p_pqrs: f.dataset.responder, p_texto: texto });
      msg(r.mensaje, r.ok ? "ok" : "error");
      if (r.ok) await pintarPestana();
      return;
    }
    if (f.hasAttribute("data-zona")) {
      const id = f.dataset.zona;
      const num = (n, def) => { const v = f.elements[n]?.value.trim(); return v === "" || v == null ? def : Math.round(+v); };
      const turnos = [...f.querySelectorAll("[data-turno-fila]")].map(fila => ({
        id: fila.querySelector("[name=t_id]").value || "",
        nombre: fila.querySelector("[name=t_nombre]").value.trim(),
        horario: fila.querySelector("[name=t_horario]").value.trim(),
        tarifa: fila.querySelector("[name=t_tarifa]").value.trim()
      })).filter(t => t.nombre || t.horario || t.tarifa);
      if (!turnos.length || turnos.some(t => t.nombre.length < 2)) { msg("Cada turno necesita un nombre.", "error"); return; }
      turnos.forEach(t => { if (!t.id) t.id = `${slug(t.nombre).slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`; });
      const fila = {
        nombre: f.elements.nombre.value.trim(),
        anticipacion_dias_habiles: num("anticipacion_dias_habiles", 0),
        max_dias_adelante: num("max_dias_adelante", 90),
        capacidad: num("capacidad", null),
        reglas: f.elements.reglas.value.trim() || null,
        turnos
      };
      if (fila.nombre.length < 2) { msg("Escriba el nombre de la zona.", "error"); return; }
      if (id) {
        // No se puede quitar un turno que tenga reservas vigentes.
        const antes = await consulta(sb.from("zonas_reservables").select("turnos").eq("id", id).maybeSingle());
        const quitados = (antes?.turnos || []).map(t => t.id).filter(tid => !turnos.some(t => t.id === tid));
        if (quitados.length) {
          const vigentes = await consulta(sb.from("reservas").select("id,turno").eq("zona_id", id).in("turno", quitados)
            .in("estado", ["pendiente", "aprobada"]).gte("fecha", hoyISO()));
          if (vigentes.length) { msg(`No se puede quitar un turno que tiene ${vigentes.length} reserva(s) vigente(s). Anúlelas primero en la pestaña Reservas.`, "error"); return; }
        }
        fila.activa = f.elements.activa.checked;
        await consulta(sb.from("zonas_reservables").update(fila).eq("id", id));
        msg(`Zona "${fila.nombre}" actualizada.`);
      } else {
        const existentes = await consulta(sb.from("zonas_reservables").select("id"));
        let nuevo = slug(fila.nombre);
        while (existentes.some(z => z.id === nuevo)) nuevo = `${slug(fila.nombre).slice(0, 25)}-${Math.random().toString(36).slice(2, 5)}`;
        await consulta(sb.from("zonas_reservables").insert({ id: nuevo, ...fila, activa: true }));
        msg(`Zona "${fila.nombre}" creada. Ya se puede reservar.`);
      }
      await pintarPestana();
      return;
    }
    if (f.id === "fComunicado") {
      const d = datosForm(f);
      if (!d.titulo || !d.texto) { msg("Escriba el título y el texto.", "error"); return; }
      const fila = { fecha: d.fecha || hoyISO(), categoria: d.categoria, titulo: d.titulo, texto: d.texto, adjunto: d.adjunto || null, publicado: d.publicado };
      if (comunicadoEditado) {
        await consulta(sb.from("comunicados").update({ ...fila, actualizado_en: new Date().toISOString() }).eq("id", comunicadoEditado));
        msg("Comunicado actualizado.");
      } else {
        await consulta(sb.from("comunicados").insert(fila));
        msg(fila.publicado ? "Comunicado publicado. Ya se ve en el sitio." : "Comunicado guardado sin publicar.");
      }
      comunicadoEditado = null;
      await pintarPestana();
      return;
    }
    if (f.id === "fCodigos") {
      const casas = [...f.querySelectorAll("[name=casa]:checked")].map(c => +c.value);
      if (!casas.length) { msg("Marque al menos una casa.", "error"); return; }
      if (!confirm(`Se generarán ${casas.length} código(s). Los códigos anteriores sin usar de esas casas quedarán anulados. ¿Continuar?`)) return;
      const codigos = [];
      for (const casa of casas) {
        const r = await rpc("admin_generar_codigo", { p_unidad: casa });
        if (!r.ok) throw new Error(r.mensaje);
        codigos.push(r);
      }
      document.getElementById("impresion").innerHTML = tarjetasCodigos(codigos);
      msg(`${codigos.length} código(s) generados. Imprímalos ahora: no se volverán a mostrar.`);
    } else if (f.id === "fArrAdmin") {
      const d = datosForm(f);
      const r = await rpc("admin_autorizar_arrendatario", {
        p_unidad: +d.casa, p_correo: d.correo || "", p_contrato_hasta: d.contrato_hasta, p_puede_ver_cuenta: d.puede_ver_cuenta
      });
      msg(r.mensaje, r.ok ? "ok" : "error");
      if (r.ok) await pintarPestana();
    }
  } catch (err) {
    msg(err.message, "error");
  } finally {
    if (document.body.contains(boton)) boton.disabled = false;
  }
});

caja.addEventListener("change", async e => {
  try { if (!(await manejarCarteraCambio(e, msg)) && !(await manejarDocumentosCambio(e, msg))) await manejarFinanzasCambio(e, msg, pintarPestana); } catch (err) { msg(err.message, "error"); }
});
caja.addEventListener("input", e => { manejarCarteraEntrada(e) || manejarFinanzasEntrada(e); });

activarRecuadros(caja);

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  try {
    estado = await rpc("mi_estado");
  } catch (err) { aviso(caja, err.message, "error"); return; }
  if (!estado.es_admin && !estado.es_consejo) {
    caja.innerHTML = `<div class="panel"><h1>Sin acceso</h1><p>Esta sección es para la administración y el consejo.</p><a class="btn" href="mi-hogar.html">Ir a Mi hogar</a></div>`;
    return;
  }
  if (!estado.autorizacion_vigente) {
    caja.innerHTML = `<div class="panel nota"><h1>Falta un paso</h1><p>Antes de usar el panel, acepte la política de tratamiento de datos en Mi hogar.</p><a class="btn" href="mi-hogar.html">Ir a Mi hogar</a></div>`;
    return;
  }
  if (!estado.es_admin) pestana = "censo";
  caja.innerHTML = encabezado();
  await pintarPestana();
}

iniciar();
