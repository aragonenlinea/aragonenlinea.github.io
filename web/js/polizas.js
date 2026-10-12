// Pólizas y garantías (solo lectura): para el consejo y la administración.
// La administración registra y edita en el panel (pestaña Pólizas).
import { montarPagina } from "./comun.js";
import { exigirSesion, rpc, aviso } from "./supabase.js";
import { barraCuenta } from "./cuenta.js";
import { cargarDatos, avisos, htmlAvisos, htmlPolizas, htmlGarantias, htmlRequisitos, htmlProveedores } from "./proveedores-comun.js";

const caja = document.getElementById("polizas");

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    const estado = await rpc("mi_estado");
    const barra = barraCuenta(estado, "Pólizas", "polizas.html");
    if (!estado.es_admin && !estado.es_consejo) {
      caja.innerHTML = barra + `<div class="panel nota">Esta sección es para el consejo de administración y la administración, con su cuenta institucional.</div>`;
      return;
    }
    const d = await cargarDatos();
    const requisitos = htmlRequisitos(d);
    caja.innerHTML = barra + `
      <p class="m">Seguimiento de las pólizas del conjunto y de los contratistas (Ley 675 art. 15; RPH arts. 34, 60.13 y 63). ${estado.es_admin ? `Para registrar o cambiar algo, use el <a href="admin.html">panel</a>, pestaña Pólizas.` : "La administración mantiene esta información al día."}</p>
      <div class="panel bloque-sm"><h2>Avisos</h2>${htmlAvisos(avisos(d, "polizas"), "polizas")}</div>
      <div class="panel bloque"><h2>Garantías exigidas vs. pólizas contratadas</h2>${htmlGarantias(d)}</div>
      <div class="panel bloque"><h2>Pólizas</h2>${htmlPolizas(d)}</div>
      ${requisitos ? `<div class="panel bloque"><h2>Garantías exigidas</h2>${requisitos}</div>` : ""}
      <div class="bloque"><h2>Aseguradoras</h2>${htmlProveedores(d, null, "Seguros")}</div>`;
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
