// Panel de administración (y censo para el consejo).
import { montarPagina, esc, fecha, hoyISO } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso, pillEstado, datosForm } from "./supabase.js";

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
    ? [["pendientes", "Pendientes"], ["censo", "Censo"], ["codigos", "Códigos de invitación"], ["cuentas", "Cuentas"]]
    : [["censo", "Censo"]];
  return `<div class="cuenta-barra no-imprimir">
      <div><h1>${estado.es_admin ? "Panel de administración" : "Censo del conjunto"}</h1><p class="m">Sesión: ${esc(estado.correo || "")}</p></div>
      <div class="row"><a class="btn sm ghost" href="mi-hogar.html">Mi hogar</a><button class="btn sm ghost" type="button" id="salir">Cerrar sesión</button></div>
    </div>
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
  const filas = await rpc("censo");
  const suma = k => filas.reduce((a, f) => a + Number(f[k] || 0), 0);
  const conProp = filas.filter(f => f.propietario === "activo").length;
  const conArr = filas.filter(f => f.arrendatario === "activo").length;
  const alDia = filas.filter(f => f.datos_confirmados_en && f.datos_confirmados_en.slice(0, 10) >= haceUnAnio()).length;
  return `<div class="kpis">
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
    const vistas = { pendientes: vistaPendientes, censo: vistaCenso, codigos: vistaCodigos, cuentas: vistaCuentas };
    cont.innerHTML = await vistas[pestana]();
  } catch (err) {
    aviso(cont, err.message, "error");
  }
}

const msg = (t, tipo = "ok") => aviso(document.getElementById("msg"), t, tipo);

caja.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b) return;
  try {
    if (b.id === "salir") { await sb.auth.signOut(); location.replace("index.html"); return; }
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
