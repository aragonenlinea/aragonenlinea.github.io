// PQRS del residente: radicar y seguir sus solicitudes. Cada cuenta ve solo las suyas.
import { montarPagina, esc, fecha } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso, datosForm } from "./supabase.js";
import { barraCuenta, soloResidentes, casaElegida, recordarCasa, selectorCasa, casasActivas, pillPqrs, fechaHora } from "./cuenta.js";

const caja = document.getElementById("pqrs");
let estado = null;
let perfil = null;
let abierta = null;   // id de la PQRS desplegada

const pill = pillPqrs;

async function pintar() {
  let html = barraCuenta(estado, "PQRS", "pqrs.html");
  if (!perfil) {
    caja.innerHTML = html + `<div class="panel nota">Para radicar solicitudes primero debe tener su casa registrada y aprobada. <a href="mi-hogar.html?hogar=1">Ir a Mi hogar</a></div>`;
    return;
  }
  const lista = await consulta(sb.from("pqrs").select("*").eq("perfil_id", perfil.id).order("creado_en", { ascending: false }));
  const ids = lista.map(q => q.id);
  const mensajes = ids.length ? await consulta(sb.from("pqrs_mensajes").select("*").in("pqrs_id", ids).order("creado_en")) : [];

  html += `${selectorCasa(estado, perfil)}
  <div class="grid g2">
    <div class="panel">
      <h2>Radicar solicitud</h2>
      <p class="m">Peticiones, quejas, reclamos o sugerencias para la administración. Casa ${esc(perfil.unidad_id)}.</p>
      <form id="fRadicar" novalidate>
        <label for="p-tipo">Tipo</label>
        <select id="p-tipo" name="tipo"><option>Petición</option><option>Queja</option><option>Reclamo</option><option>Sugerencia</option></select>
        <label for="p-asunto">Asunto</label>
        <input id="p-asunto" name="asunto" maxlength="120" required>
        <label for="p-desc">Descripción</label>
        <textarea id="p-desc" name="descripcion" maxlength="3000" required></textarea>
        <p class="m">No incluya datos personales de otras personas que no sean necesarios.</p>
        <div class="acciones-form"><button class="btn" type="submit">Radicar</button></div>
        <div id="msgRadicar"></div>
      </form>
    </div>
    <div class="panel">
      <h2>Mis solicitudes</h2>
      <div class="list">${lista.map(q => {
        const ms = mensajes.filter(m => m.pqrs_id === q.id);
        const abierto = abierta === q.id;
        return `<div class="item"><div class="crece">
          <div class="row"><span class="t">${esc(q.asunto)}</span>${pill(q.estado)}</div>
          <div class="m">${esc(q.radicado)} · ${esc(q.tipo)} · ${fecha(q.creado_en.slice(0, 10))}</div>
          ${abierto ? `
            <div class="hilo">
              <div class="msj residente"><div class="m">Usted · ${fechaHora(q.creado_en)}</div><div class="texto">${esc(q.descripcion)}</div></div>
              ${ms.map(m => `<div class="msj ${m.autor}"><div class="m">${m.autor === "administracion" ? "Administración" : "Usted"} · ${fechaHora(m.creado_en)}</div><div class="texto">${esc(m.texto)}</div></div>`).join("")}
            </div>
            <form data-escribir="${q.id}" novalidate>
              <label for="r-${q.id}">Agregar información</label>
              <textarea id="r-${q.id}" name="texto" maxlength="3000" required></textarea>
              <div class="acciones-form"><button class="btn sm" type="submit">Enviar</button></div>
              <div data-msg></div>
            </form>` : ""}
          <button class="btn sm ghost" type="button" data-ver="${q.id}">${abierto ? "Ocultar" : `Ver${ms.length ? ` (${ms.length} respuesta${ms.length > 1 ? "s" : ""})` : ""}`}</button>
        </div></div>`;
      }).join("") || `<div class="empty">No ha radicado solicitudes.</div>`}</div>
    </div>
  </div>`;
  caja.innerHTML = html;
}

caja.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const b = f.querySelector("button[type=submit]");
  const msg = f.querySelector("[id^=msg], [data-msg]");
  b.disabled = true;
  try {
    const d = datosForm(f);
    if (f.id === "fRadicar") {
      const r = await rpc("radicar_pqrs", { p_unidad: perfil.unidad_id, p_tipo: d.tipo, p_asunto: d.asunto || "", p_descripcion: d.descripcion || "" });
      if (!r.ok) { aviso(msg, r.mensaje, "error"); return; }
      await pintar();
      aviso(document.getElementById("msgRadicar"), r.mensaje, "ok");
    } else if (f.dataset.escribir) {
      const r = await rpc("escribir_pqrs", { p_pqrs: f.dataset.escribir, p_texto: d.texto || "" });
      if (!r.ok) { aviso(msg, r.mensaje, "error"); return; }
      await pintar();
    }
  } catch (err) {
    aviso(msg, err.message, "error");
  } finally {
    if (document.body.contains(b)) b.disabled = false;
  }
});

caja.addEventListener("click", async e => {
  const b = e.target.closest("[data-ver]");
  if (!b) return;
  abierta = abierta === b.dataset.ver ? null : b.dataset.ver;
  try { await pintar(); } catch (err) { alert(err.message); }
});

caja.addEventListener("change", async e => {
  if (e.target.id !== "casa") return;
  recordarCasa(+e.target.value);
  perfil = casasActivas(estado).find(p => p.unidad_id === +e.target.value);
  await pintar();
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    if (soloResidentes(estado)) return;   // administración y consejo: al panel
    if (!estado.autorizacion_vigente) { location.replace("mi-hogar.html?hogar=1"); return; }
    perfil = casaElegida(estado);
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
