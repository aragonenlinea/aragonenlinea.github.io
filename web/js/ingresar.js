// Ingreso:
//  - Residentes (propietarios y arrendatarios aprobados): correo y contraseña.
//  - Primera vez, o cuentas de administración y consejo: código de 6 dígitos (y enlace) al correo.
//    Las cuentas de administración y consejo NO usan contraseña (si tuvieran, pierden sus permisos).
//  - ¿Olvidó su contraseña?: Supabase envía un enlace para crear una nueva (contrasena.html).
import { montarPagina, esc } from "./comun.js";
import { sb, sesionActual, mensajeError, aviso } from "./supabase.js";

const caja = document.getElementById("ingresar");
const params = new URLSearchParams(location.search);
// Solo se permite volver a páginas propias del sitio.
const volver = /^[a-z-]+\.html$/.test(params.get("volver") || "") ? params.get("volver") : "mi-hogar.html";
const correoValido = c => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

let enPruebas = false;

const avisoPruebas = () => enPruebas ? `<div class="aviso info">La zona de residentes está en pruebas. El registro de las casas se abrirá cuando el Consejo apruebe la política de tratamiento de datos; la administración entregará entonces el código de cada casa.</div>` : "";

function pasoClave(correo = "") {
  caja.innerHTML = `
    <h1>Ingresar</h1>
    <p class="sub">Con su correo y su contraseña.</p>
    ${avisoPruebas()}
    <form class="panel" id="fClave" novalidate>
      <label for="correo">Correo electrónico</label>
      <input id="correo" name="correo" type="email" autocomplete="username" inputmode="email" required value="${esc(correo)}">
      <label for="clave">Contraseña</label>
      <input id="clave" name="clave" type="password" autocomplete="current-password" required>
      <div class="acciones-form">
        <button class="btn" type="submit">Entrar</button>
        <button class="btn ghost" type="button" id="olvide">¿Olvidó su contraseña?</button>
      </div>
      <div id="msg"></div>
    </form>
    <div class="panel nota">
      <p><b>¿Es la primera vez?</b> Entre con el código que le enviamos al correo. Tenga a mano el código de invitación de su casa que le entregó la administración (si es arrendatario, el propietario debe autorizarlo primero). Después de que la administración lo apruebe, podrá crear su contraseña.</p>
      <p><b>¿Cuenta de administración o del consejo?</b> Esas cuentas entran siempre con el código al correo, sin contraseña.</p>
      <button class="btn sm" type="button" id="conCodigo">Entrar con código al correo</button>
    </div>`;
  const f = document.getElementById("fClave");
  document.getElementById("conCodigo").addEventListener("click", () => pasoCorreo(f.correo.value.trim().toLowerCase()));
  document.getElementById("olvide").addEventListener("click", () => pasoRecuperar(f.correo.value.trim().toLowerCase()));
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const c = f.correo.value.trim().toLowerCase();
    if (!correoValido(c)) { aviso(msg, "Escriba un correo válido.", "error"); return; }
    if (!f.clave.value) { aviso(msg, "Escriba su contraseña.", "error"); return; }
    const b = f.querySelector("button[type=submit]"); b.disabled = true; aviso(msg, "Verificando…");
    const { error } = await sb.auth.signInWithPassword({ email: c, password: f.clave.value });
    b.disabled = false;
    if (error) { aviso(msg, mensajeError(error), "error"); return; }
    location.replace(volver);
  });
}

function pasoRecuperar(correo = "") {
  caja.innerHTML = `
    <h1>Crear una contraseña nueva</h1>
    <p class="sub">Le enviaremos al correo un enlace para crear una contraseña nueva. El enlace sirve una sola vez y vence en poco tiempo.</p>
    <form class="panel" id="fRecuperar" novalidate>
      <label for="correo">Correo electrónico</label>
      <input id="correo" name="correo" type="email" autocomplete="email" inputmode="email" required value="${esc(correo)}">
      <div class="acciones-form">
        <button class="btn" type="submit">Enviarme el enlace</button>
        <button class="btn ghost" type="button" id="volverClave">Volver</button>
      </div>
      <div id="msg"></div>
    </form>
    <p class="m">Las cuentas de administración y del consejo no usan contraseña: entran con el código al correo.</p>`;
  document.getElementById("volverClave").addEventListener("click", () => pasoClave(document.getElementById("correo").value.trim()));
  const f = document.getElementById("fRecuperar");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const c = f.correo.value.trim().toLowerCase();
    if (!correoValido(c)) { aviso(msg, "Escriba un correo válido.", "error"); return; }
    const b = f.querySelector("button[type=submit]"); b.disabled = true; aviso(msg, "Enviando…");
    const { error } = await sb.auth.resetPasswordForEmail(c, { redirectTo: new URL("contrasena.html", location.href).href });
    b.disabled = false;
    if (error) { aviso(msg, mensajeError(error), "error"); return; }
    // Mismo mensaje exista o no la cuenta: así nadie puede averiguar qué correos están registrados.
    aviso(msg, "Si ese correo tiene una cuenta, le llegará un mensaje con el enlace. Revise también el correo no deseado.", "ok");
  });
}

function pasoCorreo(correo = "") {
  caja.innerHTML = `
    <h1>Entrar con código al correo</h1>
    <p class="sub">Para la primera vez y para las cuentas de administración y consejo. Le enviamos al correo un enlace y un código.</p>
    ${avisoPruebas()}
    <form class="panel" id="fCorreo" novalidate>
      <label for="correo">Correo electrónico</label>
      <input id="correo" name="correo" type="email" autocomplete="email" inputmode="email" required value="${esc(correo)}">
      <div class="acciones-form">
        <button class="btn" type="submit">Enviarme el código</button>
        <button class="btn ghost" type="button" id="volverClave">Entrar con contraseña</button>
      </div>
      <div id="msg"></div>
    </form>`;
  document.getElementById("volverClave").addEventListener("click", () => pasoClave(document.getElementById("correo").value.trim()));
  const f = document.getElementById("fCorreo");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const c = f.correo.value.trim().toLowerCase();
    if (!correoValido(c)) { aviso(msg, "Escriba un correo válido.", "error"); return; }
    const b = f.querySelector("button[type=submit]"); b.disabled = true; aviso(msg, "Enviando…");
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
  if (params.has("codigo")) pasoCorreo(); else pasoClave();
}

iniciar();
