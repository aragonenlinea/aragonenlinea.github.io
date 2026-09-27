// Página de documentos (documentos.html). Los datos están en datos/documentos.json
// y los PDF en la carpeta documentos/.
import { montarPagina, cargar, esc, fecha, enlaceSeguro, avisoError } from "./comun.js";

const caja = document.getElementById("documentos");

// "Ver" abre el visor del sitio; "Descargar" es opcional.
const acciones = url => url.startsWith("documentos/")
  ? `<div class="row doc-acciones"><a class="btn sm" href="visor.html?doc=${encodeURIComponent(url)}">Ver</a><a class="btn sm ghost" href="${esc(url)}" download>Descargar</a></div>`
  : `<a class="btn sm ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>`;

async function iniciar() {
  await montarPagina();
  try {
    const datos = await cargar("documentos");
    const lista = Array.isArray(datos) ? datos : [];
    // Agrupa por categoría, en el mismo orden en que aparecen en el archivo.
    const grupos = new Map();
    for (const d of lista) {
      const cat = d.categoria || "Otros documentos";
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(d);
    }
    caja.innerHTML = [...grupos].map(([cat, docs]) => `
      <section class="panel doc-grupo"><h2>${esc(cat)}</h2><div class="list">${docs.map(d => {
        const url = enlaceSeguro(d.archivo);
        return `<div class="item"><div>
            <h3 class="t">${esc(d.titulo)}</h3>
            ${d.descripcion ? `<div>${esc(d.descripcion)}</div>` : ""}
            ${d.fecha ? `<div class="m">Fecha: ${fecha(d.fecha)}</div>` : ""}
          </div>${url ? acciones(url) : `<span class="pill p-warn">No disponible</span>`}</div>`;
      }).join("")}</div></section>`).join("")
      || `<div class="panel"><div class="empty">Aún no hay documentos publicados.</div></div>`;
  } catch (err) { avisoError(caja, err); }
}

iniciar();
