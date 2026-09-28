// Conexión con Supabase y utilidades de la zona de residentes.
import { SUPABASE_URL, SUPABASE_CLAVE, SUPABASE_JS } from "./config.js";
import { esc } from "./comun.js";

const { createClient } = await import(SUPABASE_JS);

// flowType "implicit": el enlace del correo funciona aunque se abra en otro navegador o en el celular.
export const sb = createClient(SUPABASE_URL, SUPABASE_CLAVE, {
  auth: { flowType: "implicit", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});

export async function sesionActual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

// Páginas privadas: si no hay sesión, lleva a Ingresar y luego regresa.
export async function exigirSesion() {
  const s = await sesionActual();
  if (!s) {
    const volver = location.pathname.split("/").pop() || "mi-hogar.html";
    location.replace("ingresar.html?volver=" + encodeURIComponent(volver));
    return new Promise(() => {});   // detiene la página mientras redirige
  }
  return s;
}

// Traduce errores técnicos a mensajes claros.
export function mensajeError(error) {
  if (!error) return "";
  const m = error.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No hay conexión. Revise su internet e intente de nuevo.";
  switch (error.code) {
    case "23505": return "Ya existe un registro con ese dato (por ejemplo, la misma placa).";
    case "23514": return "Revise los datos: algún campo no tiene el formato correcto.";
    case "42501": return "No tiene permiso para hacer esto.";
    case "P0001": return m;
    case "PGRST301": case "PGRST303": return "Su sesión venció. Vuelva a ingresar.";
  }
  if (/invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos. Si todavía no ha creado su contraseña, entre con el código al correo.";
  if (/should be different from the old/i.test(m)) return "La contraseña nueva debe ser distinta de la anterior.";
  if (/reauthenticat/i.test(m)) return "Por seguridad, cierre sesión, entre de nuevo con el código al correo y vuelva a intentarlo.";
  if (/password.*(should|characters|weak)|weak.?password/i.test(m)) return "La contraseña es muy débil: use al menos 8 caracteres, con letras y números.";
  if (/rate limit|too many/i.test(m)) return "Se enviaron demasiados correos. Espere unos minutos e intente de nuevo.";
  if (/expired|invalid.*(otp|token)/i.test(m)) return "El código no es válido o ya venció. Pida uno nuevo.";
  return "Ocurrió un error: " + m;
}

// Llama una función de la base de datos que responde {ok, mensaje}.
export async function rpc(nombre, args = {}) {
  const { data, error } = await sb.rpc(nombre, args);
  if (error) throw new Error(mensajeError(error));
  return data;
}

// Consulta de tabla que lanza un error legible.
export async function consulta(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(mensajeError(error));
  return data;
}

// Aviso dentro de un contenedor (tipo: ok | error | info).
export function aviso(contenedor, texto, tipo = "info") {
  contenedor.innerHTML = texto ? `<div class="aviso ${tipo}" role="${tipo === "error" ? "alert" : "status"}">${esc(texto)}</div>` : "";
}

export const ETIQUETA_ESTADO = {
  pendiente: ["Pendiente de validación", "p-warn"],
  validado: ["Validado", "p-ok"],
  rechazado: ["Rechazado", "p-bad"],
  activo: ["Activa", "p-ok"],
  retirado: ["Retirada", "p-bad"],
  suspendido: ["Suspendida", "p-bad"],
  vencido: ["Vencida", "p-bad"]
};
export const pillEstado = e => {
  const [t, c] = ETIQUETA_ESTADO[e] || [e, "p-info"];
  return `<span class="pill ${c}">${esc(t)}</span>`;
};

// Formulario → objeto, con textos recortados y vacíos como null.
export function datosForm(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) o[k] = typeof v === "string" ? (v.trim() || null) : v;
  form.querySelectorAll("input[type=checkbox]").forEach(c => { o[c.name] = c.checked; });
  return o;
}
