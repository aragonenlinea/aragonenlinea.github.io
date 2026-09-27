// Mi hogar: autorización de datos, registro con código, datos del hogar y acceso del arrendatario.
import { montarPagina, esc, fecha, hoyISO, enlaceSeguro } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso, pillEstado, datosForm } from "./supabase.js";

const caja = document.getElementById("cuenta");
let estado = null;          // respuesta de mi_estado()
let casaActual = null;      // unidad_id elegida si tiene varias casas

// ---------- Configuración de las listas de Mi hogar ----------
const LISTAS = {
  habitantes: {
    titulo: "Habitantes",
    boton: "Agregar habitante",
    vacio: "No ha registrado habitantes.",
    nota: "De los menores de edad solo se registra el nombre y el parentesco.",
    campos: [
      { name: "nombre", label: "Nombre completo", required: true, max: 120 },
      { name: "relacion", label: "Parentesco o relación", type: "select", required: true,
        opciones: ["Titular", "Cónyuge o pareja", "Hijo(a)", "Padre o madre", "Otro familiar", "Personal de servicio", "Otro"] },
      { name: "es_menor", label: "Es menor de edad", type: "checkbox" }
    ],
    describir: r => [esc(r.nombre), esc(r.relacion) + (r.es_menor ? ", menor de edad" : "")]
  },
  mascotas: {
    titulo: "Mascotas",
    boton: "Agregar mascota",
    vacio: "No ha registrado mascotas.",
    campos: [
      { name: "nombre", label: "Nombre", required: true, max: 60 },
      { name: "especie", label: "Especie", type: "select", required: true, opciones: ["Perro", "Gato", "Otra"] },
      { name: "raza", label: "Raza", max: 60 },
      { name: "vacuna_fecha", label: "Fecha de la última vacuna antirrábica", type: "date", maxHoy: true },
      { name: "potencialmente_peligroso", label: "Canino potencialmente peligroso", type: "checkbox" },
      { name: "poliza", label: "Número de póliza (si es potencialmente peligroso)", max: 60 }
    ],
    describir: r => {
      const vencida = r.vacuna_fecha && r.vacuna_fecha < haceUnAnio();
      return [esc(r.nombre), [esc(r.especie), r.raza ? esc(r.raza) : ""].filter(Boolean).join(", ")
        + (r.vacuna_fecha ? `. Vacuna: ${fecha(r.vacuna_fecha)}${vencida ? ` <span class="pill p-bad">Vacuna vencida</span>` : ""}` : ". Sin fecha de vacuna")
        + (r.potencialmente_peligroso ? `. Potencialmente peligroso${r.poliza ? ", póliza " + esc(r.poliza) : ", sin póliza registrada"}` : "")];
    }
  },
  vehiculos: {
    titulo: "Vehículos",
    boton: "Agregar vehículo",
    vacio: "No ha registrado vehículos.",
    campos: [
      { name: "tipo", label: "Tipo", type: "select", required: true, opciones: ["Automóvil", "Camioneta", "Motocicleta", "Bicicleta"] },
      { name: "placa", label: "Placa (no aplica para bicicleta)", max: 8, mayus: true },
      { name: "marca", label: "Marca", max: 40 },
      { name: "color", label: "Color", max: 30 },
      { name: "parqueadero", label: "Parqueadero", max: 20 }
    ],
    describir: r => [r.placa ? esc(r.placa) : esc(r.tipo),
      [r.placa ? esc(r.tipo) : "", esc(r.marca || ""), esc(r.color || ""), r.parqueadero ? "parqueadero " + esc(r.parqueadero) : ""].filter(Boolean).join(", ")]
  }
};

function haceUnAnio() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function campoHTML(c, prefijo) {
  const id = `${prefijo}-${c.name}`;
  if (c.type === "checkbox") return `<label class="check"><input type="checkbox" name="${c.name}" id="${id}"> ${esc(c.label)}</label>`;
  if (c.type === "select") return `<label for="${id}">${esc(c.label)}</label><select id="${id}" name="${c.name}" ${c.required ? "required" : ""}>${c.opciones.map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
  const extra = [c.required ? "required" : "", c.max ? `maxlength="${c.max}"` : "", c.maxHoy ? `max="${hoyISO()}"` : ""].join(" ");
  return `<label for="${id}">${esc(c.label)}</label><input id="${id}" name="${c.name}" type="${c.type || "text"}" ${extra}>`;
}

// ---------- Vistas de acceso ----------
function barraCuenta() {
  const panel = estado.es_admin || estado.es_consejo
    ? `<a class="btn sm" href="admin.html">${estado.es_admin ? "Panel de administración" : "Censo del conjunto"}</a>` : "";
  return `<div class="cuenta-barra">
    <div><h1>Mi hogar</h1><p class="m">Sesión: ${esc(estado.correo || "")}</p></div>
    <div class="row">${panel}<button class="btn sm ghost" type="button" id="salir">Cerrar sesión</button></div>
  </div>`;
}

function vistaPolitica() {
  const p = estado.politica;
  if (!p) return `<div class="panel error">No hay una política de datos vigente. Comuníquese con la administración.</div>`;
  const url = enlaceSeguro(p.url);
  return `<div class="panel nota">
    <h2>Autorización de tratamiento de datos</h2>
    <p>Antes de registrar cualquier dato, lea y acepte la política de tratamiento de datos personales del conjunto (Ley 1581 de 2012).</p>
    <div class="politica-texto">${esc(p.texto)}</div>
    ${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">Leer la política completa (versión ${esc(p.version)})</a></p>` : ""}
    <form id="fPolitica">
      <label class="check"><input type="checkbox" id="acepto" required> Leí la política y autorizo el tratamiento de mis datos en los términos descritos.</label>
      <div class="acciones-form"><button class="btn" type="submit">Autorizar y continuar</button></div>
      <div id="msg"></div>
    </form>
  </div>`;
}

function vistaCodigo(titulo) {
  return `<div class="panel">
    <h2>${esc(titulo)}</h2>
    <p>Escriba el código de invitación de su casa (se lo entrega la administración en papel) y su nombre completo.</p>
    <form id="fCodigo" novalidate>
      <label for="codigo">Código de invitación</label>
      <input id="codigo" name="codigo" placeholder="XXXX-XXXX" maxlength="12" autocomplete="off" required>
      <label for="nombre">Nombre completo del propietario</label>
      <input id="nombre" name="nombre" maxlength="120" autocomplete="name" required>
      <div class="acciones-form"><button class="btn" type="submit">Registrar mi casa</button></div>
      <div id="msg"></div>
    </form>
    <p class="m">¿Es arrendatario? Pídale al propietario que lo autorice desde su cuenta, o a la administración con autorización escrita del propietario. Luego ingrese con el correo que le indicó.</p>
  </div>`;
}

function vistaInvitacion(inv) {
  return `<div class="panel nota">
    <h2>Invitación como arrendatario de la Casa ${esc(inv.unidad_id)}</h2>
    <p>El propietario lo autorizó para usar la plataforma${inv.contrato_hasta ? ` hasta el ${fecha(inv.contrato_hasta)}` : ""}.</p>
    <form id="fInvitacion" novalidate>
      <label for="nombreInv">Su nombre completo</label>
      <input id="nombreInv" name="nombre" maxlength="120" autocomplete="name" required>
      <div class="acciones-form"><button class="btn" type="submit">Aceptar invitación</button></div>
      <div id="msg"></div>
    </form>
  </div>`;
}

// ---------- Hogar ----------
async function vistaHogar(p) {
  const casas = estado.perfiles.filter(x => x.unidad_id && x.estado === "activo" && !x.vencido);
  const selector = casas.length > 1
    ? `<label for="casa">Casa</label><select id="casa">${casas.map(x => `<option value="${x.unidad_id}" ${x.unidad_id === p.unidad_id ? "selected" : ""}>Casa ${x.unidad_id} (${x.rol})</option>`).join("")}</select>` : "";
  const rol = p.rol === "propietario" ? "Propietario" : "Arrendatario";
  const [contacto, listas] = await Promise.all([
    consulta(sb.from("contactos").select("*").eq("perfil_id", p.id).maybeSingle()),
    Promise.all(Object.keys(LISTAS).map(t => consulta(sb.from(t).select("*").eq("perfil_id", p.id).order("creado_en"))))
  ]);
  const c = contacto || {};
  const confirmado = p.datos_confirmados_en ? fecha(p.datos_confirmados_en.slice(0, 10)) : null;
  const viejo = !p.datos_confirmados_en || p.datos_confirmados_en.slice(0, 10) < haceUnAnio();

  let html = `${selector}
    <div class="panel nota bloque-sm">
      <div class="row">
        <b>Casa ${esc(p.unidad_id)} · ${rol}</b>
        ${p.rol === "arrendatario" && p.vence_el ? `<span class="pill p-info">Acceso hasta el ${fecha(p.vence_el)}</span>` : ""}
      </div>
      <p class="m">${confirmado ? `Última confirmación de sus datos: ${confirmado}.` : "Aún no ha confirmado sus datos."}
        ${viejo ? " Revíselos y confirme que están al día." : ""}</p>
      <button class="btn sm ghost" type="button" id="confirmar">Confirmar que mis datos están al día</button>
      <div id="msgConfirmar"></div>
    </div>
    <div class="grid g2">
      <div class="panel">
        <h2>Datos de contacto</h2>
        <form id="fContacto" novalidate>
          <label for="c-nombre">Nombre completo</label>
          <input id="c-nombre" name="nombre" maxlength="120" required value="${esc(p.nombre)}">
          <label for="c-celular">Celular</label>
          <input id="c-celular" name="celular" inputmode="tel" maxlength="20" value="${esc(c.celular || "")}">
          <label for="c-correo">Correo de contacto (si es distinto al de ingreso)</label>
          <input id="c-correo" name="correo_contacto" type="email" maxlength="120" value="${esc(c.correo_contacto || "")}">
          <label for="c-emerg">Contacto de emergencia: nombre</label>
          <input id="c-emerg" name="emergencia_nombre" maxlength="120" value="${esc(c.emergencia_nombre || "")}">
          <label for="c-emerg-cel">Contacto de emergencia: celular</label>
          <input id="c-emerg-cel" name="emergencia_celular" inputmode="tel" maxlength="20" value="${esc(c.emergencia_celular || "")}">
          <p class="m">Registre un contacto de emergencia solo si esa persona está de acuerdo.</p>
          <div class="acciones-form"><button class="btn" type="submit">Guardar contacto</button></div>
          <div id="msgContacto"></div>
        </form>
      </div>
      ${Object.entries(LISTAS).map(([t, cfg], i) => panelLista(t, cfg, listas[i])).join("")}
    </div>`;

  if (p.rol === "propietario") html += await panelArrendatario(p);
  return html;
}

function panelLista(tabla, cfg, filas) {
  return `<div class="panel" data-lista="${tabla}">
    <div class="row cuenta-barra"><h2>${cfg.titulo}</h2><button class="btn sm" type="button" data-abrir="${tabla}">${cfg.boton}</button></div>
    <form class="oculto" data-form="${tabla}" novalidate>
      ${cfg.campos.map(c => campoHTML(c, tabla)).join("")}
      <div class="acciones-form"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" data-cerrar="${tabla}">Cancelar</button></div>
      <div data-msg="${tabla}"></div>
    </form>
    <div class="list">${filas.map(r => {
      const [t, m] = cfg.describir(r);
      return `<div class="item"><div><div class="t">${t}</div><div class="m">${m}</div>
        <div class="row">${pillEstado(r.estado)}${r.estado === "rechazado" && r.motivo_rechazo ? `<span class="m">Motivo: ${esc(r.motivo_rechazo)}</span>` : ""}</div></div>
        <button class="btn sm ghost" type="button" data-retirar="${tabla}:${r.id}">Retirar</button></div>`;
    }).join("") || `<div class="empty">${cfg.vacio}</div>`}</div>
    ${cfg.nota ? `<p class="m">${cfg.nota}</p>` : ""}
    <p class="m">Lo que agregue queda pendiente hasta que la administración lo valide.</p>
  </div>`;
}

async function panelArrendatario(p) {
  const [resumen, arr, invs] = await Promise.all([
    rpc("resumen_casa", { p_unidad: p.unidad_id }),
    consulta(sb.from("perfiles").select("id,nombre,correo,estado,vence_el,puede_ver_cuenta").eq("unidad_id", p.unidad_id).eq("rol", "arrendatario").eq("estado", "activo")),
    consulta(sb.from("invitaciones").select("correo,contrato_hasta,vence_el").eq("unidad_id", p.unidad_id).eq("rol", "arrendatario")
      .is("usada_en", null).is("anulada_en", null).gt("vence_el", new Date().toISOString()))
  ]);
  const a = arr.find(x => !x.vence_el || x.vence_el >= hoyISO());
  const inv = invs[0];
  let cuerpo;
  if (a) {
    cuerpo = `<div class="item"><div><div class="t">${esc(a.nombre)}</div><div class="m">${esc(a.correo)}${a.vence_el ? ` · acceso hasta el ${fecha(a.vence_el)}` : " · sin fecha de fin"}</div>
      <div class="m">${a.puede_ver_cuenta ? "Puede ver el estado de cuenta de la casa." : "No ve el estado de cuenta de la casa."}</div></div>
      <button class="btn sm peligro" type="button" id="retirarArr">Retirar acceso</button></div>`;
  } else if (inv) {
    cuerpo = `<div class="aviso info">Invitación pendiente para ${esc(inv.correo)}. El arrendatario debe ingresar con ese correo antes del ${fecha(inv.vence_el.slice(0, 10))}.</div>
      <button class="btn sm ghost" type="button" id="retirarArr">Anular invitación</button>`;
  } else {
    cuerpo = `<form id="fArrendatario" novalidate>
      <label for="a-correo">Correo del arrendatario</label>
      <input id="a-correo" name="correo" type="email" maxlength="120" required>
      <label for="a-fin">Fecha de fin del contrato (opcional; el acceso vence ese día)</label>
      <input id="a-fin" name="contrato_hasta" type="date" min="${hoyISO()}">
      <label class="check"><input type="checkbox" name="puede_ver_cuenta"> Permitir que vea el estado de cuenta de la casa (cuando esté disponible)</label>
      <div class="acciones-form"><button class="btn" type="submit">Autorizar arrendatario</button></div>
    </form>`;
  }
  return `<div class="panel bloque">
    <h2>Acceso del arrendatario</h2>
    <p class="m">Solo usted, como propietario, puede autorizar o retirar el acceso de un arrendatario. El arrendatario maneja los datos de su propio hogar; usted no ve sus teléfonos ni los datos de sus habitantes.</p>
    ${resumen ? `<p>En la casa hay registrados ${resumen.habitantes} habitante(s), ${resumen.mascotas} mascota(s) y ${resumen.vehiculos} vehículo(s), contando los del arrendatario.</p>` : ""}
    ${cuerpo}
    <div id="msgArr"></div>
  </div>`;
}

// ---------- Pintar según el estado ----------
async function pintar() {
  estado = await rpc("mi_estado");
  let html = barraCuenta();

  if (!estado.autorizacion_vigente) {
    caja.innerHTML = html + vistaPolitica();
    return;
  }

  const deCasa = estado.perfiles.filter(p => p.unidad_id);
  const activos = deCasa.filter(p => p.estado === "activo" && !p.vencido);
  const inv = estado.invitacion_arrendatario;
  if (inv && !deCasa.some(p => p.unidad_id === inv.unidad_id && ["pendiente", "activo"].includes(p.estado))) {
    html += vistaInvitacion(inv);
  }

  if (!activos.length) {
    for (const p of deCasa.filter(p => p.estado === "pendiente")) {
      html += `<div class="aviso info">Su registro como ${esc(p.rol)} de la Casa ${esc(p.unidad_id)} está pendiente de aprobación por la administración.</div>`;
    }
    for (const p of deCasa.filter(p => p.estado === "rechazado")) {
      html += `<div class="aviso error">Su registro de la Casa ${esc(p.unidad_id)} fue rechazado${p.motivo_rechazo ? ": " + esc(p.motivo_rechazo) : "."} Comuníquese con la administración.</div>`;
    }
    for (const p of deCasa.filter(p => p.vencido && p.estado === "activo")) {
      html += `<div class="aviso error">Su acceso como arrendatario de la Casa ${esc(p.unidad_id)} venció el ${fecha(p.vence_el)}. Si el contrato se renovó, pídale al propietario que lo autorice de nuevo.</div>`;
    }
    const vigenteEn = u => deCasa.some(q => q.unidad_id === u && ["pendiente", "activo"].includes(q.estado) && !q.vencido);
    const retiradas = [...new Set(deCasa.filter(p => p.estado === "retirado" && !vigenteEn(p.unidad_id)).map(p => p.unidad_id))];
    for (const u of retiradas) {
      html += `<div class="aviso error">Su acceso a la Casa ${esc(u)} fue retirado. Si cree que es un error, comuníquese con la administración.</div>`;
    }
    const conAviso = retiradas.length || deCasa.some(p => p.vencido && p.estado === "activo");
    if (!deCasa.some(p => p.estado === "pendiente") && !inv && !conAviso) {
      html += vistaCodigo(estado.es_admin || estado.es_consejo ? "¿También es propietario? Registre su casa" : "Registre su casa");
    }
    caja.innerHTML = html;
    return;
  }

  const actual = activos.find(p => p.unidad_id === casaActual) || activos[0];
  casaActual = actual.unidad_id;
  caja.innerHTML = html + await vistaHogar(actual);
}

async function recargar(msgId, texto, tipo = "ok") {
  await pintar();
  if (msgId && document.getElementById(msgId)) aviso(document.getElementById(msgId), texto, tipo);
}

// ---------- Eventos ----------
caja.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const boton = f.querySelector("button[type=submit]");
  const mostrar = (t, tipo = "error") => aviso(f.querySelector("[id^=msg], [data-msg]") || document.getElementById("msgArr"), t, tipo);
  boton && (boton.disabled = true);
  try {
    if (f.id === "fPolitica") {
      if (!document.getElementById("acepto").checked) { mostrar("Marque la casilla para continuar."); return; }
      const r = await rpc("aceptar_politica", { p_version: estado.politica.version, p_navegador: navigator.userAgent });
      if (!r.ok) { mostrar(r.mensaje); return; }
      await pintar();
    } else if (f.id === "fCodigo") {
      const d = datosForm(f);
      const r = await rpc("canjear_codigo", { p_codigo: d.codigo || "", p_nombre: d.nombre || "" });
      if (!r.ok) { mostrar(r.mensaje); return; }
      await pintar();
      caja.insertAdjacentHTML("beforeend", `<div class="aviso ok">${esc(r.mensaje)}</div>`);
    } else if (f.id === "fInvitacion") {
      const r = await rpc("aceptar_invitacion_arrendatario", { p_nombre: datosForm(f).nombre || "" });
      if (!r.ok) { mostrar(r.mensaje); return; }
      await pintar();
    } else if (f.id === "fContacto") {
      const d = datosForm(f);
      const p = estado.perfiles.find(x => x.unidad_id === casaActual && x.estado === "activo");
      if (!d.nombre || d.nombre.length < 3) { mostrar("Escriba su nombre completo."); return; }
      if (d.celular && !/^[0-9 +]{7,20}$/.test(d.celular)) { mostrar("El celular solo puede tener números."); return; }
      if (d.emergencia_celular && !/^[0-9 +]{7,20}$/.test(d.emergencia_celular)) { mostrar("El celular de emergencia solo puede tener números."); return; }
      if (d.nombre !== p.nombre) await consulta(sb.from("perfiles").update({ nombre: d.nombre }).eq("id", p.id));
      await consulta(sb.from("contactos").upsert({
        perfil_id: p.id, celular: d.celular, correo_contacto: d.correo_contacto,
        emergencia_nombre: d.emergencia_nombre, emergencia_celular: d.emergencia_celular
      }));
      await recargar("msgContacto", "Contacto guardado.");
    } else if (f.dataset.form) {
      const tabla = f.dataset.form;
      const d = datosForm(f);
      const p = estado.perfiles.find(x => x.unidad_id === casaActual && x.estado === "activo");
      if (tabla === "vehiculos") {
        d.placa = d.placa ? d.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
        if (d.tipo !== "Bicicleta" && !/^[A-Z0-9]{5,7}$/.test(d.placa || "")) { mostrar("Escriba una placa válida (5 a 7 letras y números)."); return; }
        if (d.tipo === "Bicicleta") d.placa = null;
      }
      if (tabla === "mascotas" && d.vacuna_fecha && d.vacuna_fecha > hoyISO()) { mostrar("La fecha de vacuna no puede ser futura."); return; }
      await consulta(sb.from(tabla).insert({ ...d, unidad_id: p.unidad_id, perfil_id: p.id }));
      await recargar(null);
    } else if (f.id === "fArrendatario") {
      const d = datosForm(f);
      const r = await rpc("autorizar_arrendatario", {
        p_unidad: casaActual, p_correo: d.correo || "", p_contrato_hasta: d.contrato_hasta, p_puede_ver_cuenta: d.puede_ver_cuenta
      });
      if (!r.ok) { aviso(document.getElementById("msgArr"), r.mensaje, "error"); return; }
      await recargar("msgArr", r.mensaje);
    }
  } catch (err) {
    mostrar(err.message);
  } finally {
    boton && document.body.contains(boton) && (boton.disabled = false);
  }
});

caja.addEventListener("click", async e => {
  const b = e.target.closest("button, [data-abrir]");
  if (!b) return;
  try {
    if (b.id === "salir") {
      await sb.auth.signOut();
      location.replace("index.html");
    } else if (b.dataset.abrir) {
      document.querySelector(`[data-form="${b.dataset.abrir}"]`).classList.remove("oculto");
      b.classList.add("oculto");
    } else if (b.dataset.cerrar) {
      document.querySelector(`[data-form="${b.dataset.cerrar}"]`).classList.add("oculto");
      document.querySelector(`[data-abrir="${b.dataset.cerrar}"]`).classList.remove("oculto");
    } else if (b.dataset.retirar) {
      const [tabla, id] = b.dataset.retirar.split(":");
      if (!confirm("¿Retirar este registro?")) return;
      await consulta(sb.from(tabla).delete().eq("id", id));
      await pintar();
    } else if (b.id === "confirmar") {
      const p = estado.perfiles.find(x => x.unidad_id === casaActual && x.estado === "activo");
      await consulta(sb.from("perfiles").update({ datos_confirmados_en: new Date().toISOString() }).eq("id", p.id));
      await recargar("msgConfirmar", "Gracias. Sus datos quedaron confirmados.");
    } else if (b.id === "retirarArr") {
      if (!confirm("¿Retirar el acceso del arrendatario a la plataforma?")) return;
      const r = await rpc("retirar_arrendatario", { p_unidad: casaActual });
      await recargar("msgArr", r.mensaje, r.ok ? "ok" : "error");
    }
  } catch (err) {
    alert(err.message);
  }
});

caja.addEventListener("change", e => {
  if (e.target.id === "casa") { casaActual = +e.target.value; pintar(); }
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
  sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.replace("ingresar.html"); });
}

iniciar();
