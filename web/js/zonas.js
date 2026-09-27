// Página de zonas comunes (zonas.html). Los datos están en datos/zonas.json.
import { montarPagina, cargar, esc, icono, avisoError, irAlAncla } from "./comun.js";

const caja = document.getElementById("zonas");

async function iniciar() {
  await montarPagina();
  try {
    const datos = await cargar("zonas");
    const lista = Array.isArray(datos) ? datos : [];
    caja.innerHTML = `<div class="grid g2">${lista.map((z, i) => {
      const reglas = (Array.isArray(z.reglas) ? z.reglas : []).filter(Boolean);
      return `<article class="panel zona-ficha" id="zona-${i + 1}">
        <div class="zona z${i % 4}">${icono(z.icono)}<div><b>${esc(z.nombre)}</b><span>${esc(z.reserva || "")}</span></div></div>
        <div class="cuerpo">
          <dl>
            <dt>Horario</dt><dd>${esc(z.horario || "Por definir")}</dd>
            ${z.capacidad ? `<dt>Capacidad</dt><dd>${esc(z.capacidad)}</dd>` : ""}
          </dl>
          ${reglas.length ? `<ul>${reglas.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
        </div>
      </article>`;
    }).join("") || `<div class="panel"><div class="empty">Aún no hay zonas comunes registradas.</div></div>`}</div>
    <div class="panel nota bloque">Las reservas en línea estarán disponibles más adelante, cuando los residentes puedan ingresar con su cuenta. Por ahora, reserve directamente con la administración.</div>`;
    irAlAncla();
  } catch (err) { avisoError(caja, err); }
}

iniciar();
