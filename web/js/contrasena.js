// Crear o cambiar la contraseña de un residente.
// Llega aquí: (1) desde Mi hogar, ya con sesión, la primera vez; (2) desde "Mi contraseña";
// (3) desde el enlace de "¿Olvidó su contraseña?" que envía Supabase (abre la sesión solo).
// Las cuentas de administración y consejo no usan contraseña: si entran con una, no tienen permisos.
import { montarPagina, esc } from "./comun.js";
import { sb, sesionActual, rpc, mensajeError, aviso } from "./supabase.js";
import { barraCuenta, esInstitucional } from "./cuenta.js";

const caja = document.getElementById("contrasena");

const cumple = c => c.length >= 8 && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(c) && /\d/.test(c);

function formulario(estado) {
  caja.innerHTML = barraCuenta(estado, estado.tiene_contrasena ? "Cambiar mi contraseña" : "Crear mi contraseña", "contrasena.html") + `
    <form class="panel angosto" id="fContrasena" novalidate>
      <p class="m">Con su contraseña entrará con su correo, sin esperar el código. Use al menos <b>8 caracteres, con letras y números</b>. No use la misma de su correo ni de su banco.</p>
      <input type="email" name="usuario" autocomplete="username" value="${esc(estado.correo || "")}" hidden>
      <label for="nueva">Contraseña nueva</label>
      <input id="nueva" name="nueva" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>
      <label for="repetir">Repita la contraseña</label>
      <input id="repetir" name="repetir" type="password" autocomplete="new-password" minlength="8" maxlength="72" required>
      <label class="check"><input type="checkbox" id="mostrar"> Mostrar lo que escribo</label>
      <div class="acciones-form"><button class="btn" type="submit">Guardar contraseña</button></div>
      <div id="msg"></div>
    </form>`;
  const f = document.getElementById("fContrasena");
  document.getElementById("mostrar").addEventListener("change", e => {
    f.nueva.type = f.repetir.type = e.target.checked ? "text" : "password";
  });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const nueva = f.nueva.value;
    if (!cumple(nueva)) { aviso(msg, "La contraseña debe tener al menos 8 caracteres, con letras y números.", "error"); return; }
    if (nueva !== f.repetir.value) { aviso(msg, "Las dos contraseñas no son iguales.", "error"); return; }
    const b = f.querySelector("button[type=submit]"); b.disabled = true; aviso(msg, "Guardando…");
    const { error } = await sb.auth.updateUser({ password: nueva });
    b.disabled = false;
    if (error) { aviso(msg, mensajeError(error), "error"); return; }
    try { await rpc("registrar_contrasena"); } catch (e) { /* solo sirve para no volver a mostrar el aviso de Mi hogar */ }
    f.innerHTML = `<div class="aviso ok">Contraseña guardada. Desde ahora entre con su correo y su contraseña.</div>
      <div class="acciones-form"><a class="btn" href="mi-hogar.html">Ir a Mi hogar</a></div>`;
  });
}

async function iniciar() {
  await montarPagina();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    if (!(await sesionActual())) {
      caja.innerHTML = `<div class="panel nota angosto"><h1>El enlace ya no sirve</h1>
        <p>El enlace para crear la contraseña venció o ya se usó. Pida uno nuevo desde Ingresar → "¿Olvidó su contraseña?".</p>
        <a class="btn" href="ingresar.html">Ir a Ingresar</a></div>`;
      return;
    }
    const estado = await rpc("mi_estado");
    if (esInstitucional(estado)) {
      caja.innerHTML = barraCuenta(estado, "Contraseña", "contrasena.html") + `<div class="panel nota angosto">
        <p>Las cuentas de <b>administración y del consejo</b> no usan contraseña: entran siempre con el código que llega al correo institucional.</p>
        <p>Así, aunque alguien averigüe una contraseña, no puede entrar al panel sin acceso a ese correo: una sesión abierta con contraseña no tiene permisos de administración ni de consejo.</p>
        <a class="btn" href="admin.html">Ir al panel</a></div>`;
      return;
    }
    formulario(estado);
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
