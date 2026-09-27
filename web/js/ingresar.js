// Ingreso sin contraseña: se envía al correo un enlace y un código de 6 dígitos.
import { montarPagina, esc } from "./comun.js";
import { sb, sesionActual, mensajeError, aviso } from "./supabase.js";

const caja = document.getElementById("ingresar");
const params = new URLSearchParams(location.search);
// Solo se permite volver a páginas propias del sitio.
const volver = /^[a-z-]+\.html$/.test(params.get("volver") || "") ? params.get("volver") : "mi-hogar.html";

let enPruebas = false;

function pasoCorreo(correo = "") {
  caja.innerHTML = `
    <h1>Ingresar</h1>
    <p class="sub">Para propietarios, arrendatarios y administración. No necesita contraseña: le enviamos al correo un enlace y un código.</p>
    ${enPruebas ? `<div class="aviso info">La zona de residentes está en pruebas. El registro de las casas se abrirá cuando el Consejo apruebe la política de tratamiento de datos; la administración entregará entonces el código de cada casa.</div>` : ""}
    <form class="panel" id="fCorreo" novalidate>
      <label for="correo">Correo electrónico</label>
      <input id="correo" name="correo" type="email" autocomplete="email" inputmode="email" required value="${esc(correo)}">
      <div class="acciones-form"><button class="btn" type="submit">Enviarme el acceso</button></div>
      <div id="msg"></div>
    </form>
    <p class="m">¿Primera vez? Tenga a mano el código de invitación de su casa que le entregó la administración. Si es arrendatario, el propietario debe autorizarlo primero.</p>`;
  const f = document.getElementById("fCorreo");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const c = f.correo.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) { aviso(msg, "Escriba un correo válido.", "error"); return; }
    const b = f.querySelector("button"); b.disabled = true; aviso(msg, "Enviando…");
    const destino = new URL(volver, location.href).href;
    const { error } = await sb.auth.signInWithOtp({ email: c, options: { emailRedirectTo: destino, shouldCreateUser: true } });
    b.disabled = false;
    if (error) { aviso(msg, mensajeError(error), "error"); return; }
    pasoCodigo(c);
  });
}

function pasoCodigo(correo) {
  caja.innerHTML = `
    <h1>Revise su correo</h1>
    <p class="sub">Enviamos un mensaje a <b>${esc(correo)}</b>. Puede abrir el enlace del mensaje, o escribir aquí el código que trae. Si no lo ve, revise la carpeta de correo no deseado.</p>
    <form class="panel" id="fCodigo" novalidate>
      <label for="codigo">Código del correo</label>
      <input id="codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required>
      <div class="acciones-form">
        <button class="btn" type="submit">Entrar</button>
        <button class="btn ghost" type="button" id="otro">Usar otro correo</button>
      </div>
      <div id="msg"></div>
    </form>`;
  document.getElementById("otro").addEventListener("click", () => pasoCorreo(correo));
  const f = document.getElementById("fCodigo");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const token = f.codigo.value.replace(/\D/g, "");
    if (token.length < 6) { aviso(msg, "Escriba el código completo.", "error"); return; }
    const b = f.querySelector("button"); b.disabled = true; aviso(msg, "Verificando…");
    const { error } = await sb.auth.verifyOtp({ email: correo, token, type: "email" });
    b.disabled = false;
    if (error) { aviso(msg, mensajeError(error), "error"); return; }
    location.replace(volver);
  });
}

async function iniciar() {
  const sitio = await montarPagina();
  enPruebas = !!sitio.residentes_en_pruebas;
  if (await sesionActual()) { location.replace(volver); return; }
  pasoCorreo();
}

iniciar();
