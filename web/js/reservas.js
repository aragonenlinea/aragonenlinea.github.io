// Reservas de zonas comunes para residentes. Se ven los turnos ocupados, nunca quién los ocupa.
import { montarPagina, esc, fecha, hoyISO } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso, datosForm } from "./supabase.js";
import { barraCuenta, casaElegida, recordarCasa, selectorCasa, casasActivas, pillReserva } from "./cuenta.js";

const caja = document.getElementById("reservas");
let estado = null, perfil = null, zonas = [];
let zonaId = null, fechaSel = null, turnoSel = null;

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const sumarDias = (fISO, n) => { const d = new Date(fISO + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

// Primera fecha permitida: al menos N días hábiles (lunes a viernes) entre hoy y la fecha.
function primeraFecha(n) {
  let f = sumarDias(hoyISO(), 1), habiles = 0;
  while (habiles < n) {
    const w = new Date(f + "T12:00:00").getDay();
    if (w !== 0 && w !== 6) habiles++;
    f = sumarDias(f, 1);
  }
  return f;
}

const zona = () => zonas.find(z => z.id === zonaId);

async function pintar() {
  let html = barraCuenta(estado, "Reservas", "reservas.html");
  if (!perfil) {
    caja.innerHTML = html + `<div class="panel nota">Para reservar primero debe tener su casa registrada y aprobada. <a href="mi-hogar.html?hogar=1">Ir a Mi hogar</a></div>`;
    return;
  }
  const z = zona();
  const minima = primeraFecha(z.anticipacion_dias_habiles);
  const maxima = sumarDias(hoyISO(), z.max_dias_adelante);
  if (!fechaSel || fechaSel < minima || fechaSel > maxima) fechaSel = minima;

  const [ocupadosDia, proximos, mias] = await Promise.all([
    rpc("disponibilidad", { p_zona: z.id, p_desde: fechaSel, p_hasta: fechaSel }),
    rpc("disponibilidad", { p_zona: z.id, p_desde: hoyISO(), p_hasta: sumarDias(hoyISO(), 60) }),
    consulta(sb.from("reservas").select("*").eq("perfil_id", perfil.id).order("fecha", { ascending: false }).limit(30))
  ]);
  const ocupado = new Set(ocupadosDia.map(o => o.turno));
  if (turnoSel && ocupado.has(turnoSel)) turnoSel = null;
  const nombreTurno = (zid, t) => zonas.find(x => x.id === zid)?.turnos.find(x => x.id === t)?.nombre || t;

  html += `${selectorCasa(estado, perfil)}
  <div class="grid g2">
    <div class="panel">
      <h2>Solicitar reserva</h2>
      <form id="fReserva" novalidate>
        <label for="r-zona">Zona</label>
        <select id="r-zona" name="zona">${zonas.map(x => `<option value="${esc(x.id)}" ${x.id === z.id ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>
        <p class="m">${z.anticipacion_dias_habiles ? `Se reserva con mínimo ${z.anticipacion_dias_habiles} días hábiles de anticipación. ` : ""}${z.capacidad ? `Capacidad: ${z.capacidad} personas. ` : ""}${esc(z.reglas || "")}</p>
        <label for="r-fecha">Fecha</label>
        <input id="r-fecha" name="fecha" type="date" min="${minima}" max="${maxima}" value="${fechaSel}" required>
        <label>Turno</label>
        <div class="turnos">${z.turnos.map(t => {
          const tomado = ocupado.has(t.id);
          return `<button type="button" class="turno" data-turno="${esc(t.id)}" aria-pressed="${turnoSel === t.id}" ${tomado ? "disabled" : ""}>
            <b>${esc(t.nombre)}${tomado ? " · Ocupado" : ""}</b><span>${esc(t.horario)}</span><span>Alquiler: ${esc(t.tarifa)}</span></button>`;
        }).join("")}</div>
        <label for="r-inv">Número de personas</label>
        <input id="r-inv" name="invitados" type="number" min="1" ${z.capacidad ? `max="${z.capacidad}"` : ""} required>
        <label for="r-obs">Observaciones (opcional)</label>
        <textarea id="r-obs" name="observaciones" maxlength="500"></textarea>
        <p class="m">La plataforma no cobra: el alquiler se paga en la administración (SMDLV = salario mínimo diario legal vigente). Las casas con más de dos meses de mora no pueden usar el salón ni la zona BBQ (Manual de convivencia, art. 54).</p>
        <div class="acciones-form"><button class="btn" type="submit">Solicitar</button></div>
        <div id="msgReserva"></div>
      </form>
    </div>
    <div class="panel">
      <h2>Mis reservas</h2>
      <div class="list">${mias.map(r => `<div class="item"><div>
          <div class="t">${esc(zonas.find(x => x.id === r.zona_id)?.nombre || r.zona_id)} · ${fecha(r.fecha)}</div>
          <div class="m">${esc(nombreTurno(r.zona_id, r.turno))} · ${r.invitados} persona(s)</div>
          <div class="row">${pillReserva(r.estado)}${r.motivo ? `<span class="m">${esc(r.motivo)}</span>` : ""}</div></div>
          ${["pendiente", "aprobada"].includes(r.estado) && r.fecha >= hoyISO() ? `<button class="btn sm ghost" type="button" data-cancelar="${r.id}">Cancelar</button>` : ""}</div>`).join("")
        || `<div class="empty">No tiene reservas.</div>`}</div>
      <h2 class="bloque">Fechas ocupadas (próximos 60 días)</h2>
      <p class="m">${esc(z.nombre)}. Solo se muestra que el turno está ocupado, no quién lo reservó.</p>
      <div class="list">${proximos.map(o => `<div class="item"><div><div class="t">${fecha(o.fecha)}</div><div class="m">${esc(nombreTurno(z.id, o.turno))}</div></div>${o.estado === "aprobada" ? `<span class="pill p-bad">Ocupado</span>` : `<span class="pill p-warn">Solicitado</span>`}</div>`).join("")
        || `<div class="empty">No hay turnos ocupados.</div>`}</div>
    </div>
  </div>`;
  caja.innerHTML = html;
}

caja.addEventListener("click", async e => {
  const t = e.target.closest("[data-turno]");
  if (t) {
    turnoSel = t.dataset.turno;
    document.querySelectorAll("[data-turno]").forEach(b => b.setAttribute("aria-pressed", b.dataset.turno === turnoSel));
    return;
  }
  const c = e.target.closest("[data-cancelar]");
  if (c) {
    if (!confirm("¿Cancelar esta reserva?")) return;
    try {
      const r = await rpc("cancelar_reserva", { p_reserva: c.dataset.cancelar });
      await pintar();
      if (!r.ok) alert(r.mensaje);
    } catch (err) { alert(err.message); }
  }
});

caja.addEventListener("change", async e => {
  try {
    if (e.target.id === "r-zona") { zonaId = e.target.value; fechaSel = null; turnoSel = null; await pintar(); }
    else if (e.target.id === "r-fecha") { fechaSel = e.target.value; await pintar(); }
    else if (e.target.id === "casa") {
      recordarCasa(+e.target.value);
      perfil = casasActivas(estado).find(p => p.unidad_id === +e.target.value);
      await pintar();
    }
  } catch (err) { alert(err.message); }
});

caja.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, b = f.querySelector("button[type=submit]"), msg = document.getElementById("msgReserva");
  const d = datosForm(f);
  if (!turnoSel) { aviso(msg, "Elija un turno.", "error"); return; }
  if (!d.invitados || +d.invitados < 1) { aviso(msg, "Indique el número de personas.", "error"); return; }
  b.disabled = true;
  try {
    const r = await rpc("solicitar_reserva", {
      p_unidad: perfil.unidad_id, p_zona: zonaId, p_fecha: d.fecha, p_turno: turnoSel,
      p_invitados: +d.invitados, p_observaciones: d.observaciones
    });
    if (!r.ok) { aviso(msg, r.mensaje, "error"); return; }
    turnoSel = null;
    await pintar();
    aviso(document.getElementById("msgReserva"), r.mensaje, "ok");
  } catch (err) {
    aviso(msg, err.message, "error");
  } finally {
    if (document.body.contains(b)) b.disabled = false;
  }
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    if (!estado.autorizacion_vigente) { location.replace("mi-hogar.html?hogar=1"); return; }
    perfil = casaElegida(estado);
    zonas = await consulta(sb.from("zonas_reservables").select("*").eq("activa", true).order("nombre"));
    zonaId = zonas[0]?.id;
    if (!zonas.length) { caja.innerHTML = barraCuenta(estado, "Reservas", "reservas.html") + `<div class="panel">No hay zonas disponibles para reservar.</div>`; return; }
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
