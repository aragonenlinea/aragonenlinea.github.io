// Proveedores y contratos (solo lectura): para el consejo y la administración.
// La administración registra y edita en el panel (pestaña Proveedores y contratos).
import { montarPagina } from "./comun.js";
import { exigirSesion, rpc, aviso } from "./supabase.js";
import { barraCuenta } from "./cuenta.js";
import { cargarDatos, avisos, htmlAvisos, htmlContratos, htmlProveedores } from "./proveedores-comun.js";

const caja = document.getElementById("proveedores");

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    const estado = await rpc("mi_estado");
    const barra = barraCuenta(estado, "Proveedores y contratos", "proveedores.html");
    if (!estado.es_admin && !estado.es_consejo) {
      caja.innerHTML = barra + `<div class="panel nota">Esta sección es para el consejo de administración y la administración, con su cuenta institucional.</div>`;
      return;
    }
    const d = await cargarDatos();
    caja.innerHTML = barra + `
      <p class="m">Herramienta de control del consejo (RPH arts. 58 y 60.13). ${estado.es_admin ? `Para registrar o cambiar algo, use el <a href="admin.html">panel</a>, pestaña Proveedores y contratos.` : "La administración mantiene esta información al día."} Las pólizas de los contratistas están en <a href="polizas.html">Pólizas</a>.</p>
      <div class="panel bloque-sm"><h2>Avisos</h2>${htmlAvisos(avisos(d, "proveedores"), "proveedores")}</div>
      <div class="panel bloque"><h2>Contratos</h2>${htmlContratos(d)}</div>
      <div class="bloque"><h2>Proveedores</h2>${htmlProveedores(d)}</div>`;
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
