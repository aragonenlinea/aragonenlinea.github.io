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
            ${z.costo ? `<dt>Alquiler</dt><dd>${esc(z.costo)}</dd>` : ""}
            ${z.capacidad ? `<dt>Capacidad</dt><dd>${esc(z.capacidad)}</dd>` : ""}
          </dl>
          ${reglas.length ? `<ul>${reglas.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
          ${z.fuente ? `<p class="m fuente">Fuente: ${esc(z.fuente)}</p>` : ""}
        </div>
      </article>`;
    }).join("") || `<div class="panel"><div class="empty">Aún no hay zonas comunes registradas.</div></div>`}</div>
    <div class="panel nota bloque">
      <p><b>SMDLV</b> es el salario mínimo diario legal vigente. Consulte el valor en pesos con la administración.</p>
      <p>Las casas con más de dos meses de mora en la cuota de administración no pueden usar el salón social, la zona BBQ ni la piscina (Manual de convivencia, arts. 32 y 54).</p>
      <p>Las reservas en línea estarán disponibles más adelante. Por ahora, solicítelas directamente a la administración.</p>
    </div>`;
    irAlAncla();
  } catch (err) { avisoError(caja, err); }
}

iniciar();
