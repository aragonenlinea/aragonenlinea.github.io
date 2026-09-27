// Portada del sitio (index.html).
import { montarPagina, cargar, esc, fecha, aFecha, hoyISO, recientesPrimero, enlaceSeguro, icono } from "./comun.js";

const ESCENA = `<svg class="escena" viewBox="0 0 1200 460" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs>
<linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD3C7"/><stop offset=".65" stop-color="#F4E3A1"/><stop offset="1" stop-color="#F6D778"/></linearGradient>
<pattern id="ven" width="26" height="30" patternUnits="userSpaceOnUse"><rect x="5" y="7" width="14" height="16" rx="2" fill="#9CC6BC"/></pattern>
</defs>
<rect width="1200" height="460" fill="url(#cielo)"/>
<circle cx="940" cy="170" r="78" fill="#E8B931"/>
<circle cx="940" cy="170" r="110" fill="#E8B931" opacity=".18"/>
<path d="M0 300 L120 230 L230 270 L360 190 L470 250 L600 200 L720 250 L850 180 L980 240 L1090 200 L1200 240 V460 H0Z" fill="#8DB8AA"/>
<path d="M0 340 L150 280 L300 320 L460 270 L620 320 L780 280 L940 320 L1080 285 L1200 310 V460 H0Z" fill="#5E9585"/>
<g>
<rect x="560" y="170" width="130" height="240" fill="#F2F6F4"/><rect x="560" y="170" width="130" height="240" fill="url(#ven)"/><rect x="552" y="160" width="146" height="14" fill="#0F4C45"/>
<rect x="710" y="120" width="150" height="290" fill="#FFFFFF"/><rect x="710" y="120" width="150" height="290" fill="url(#ven)"/><rect x="702" y="110" width="166" height="14" fill="#0F4C45"/>
<rect x="752" y="226" width="14" height="16" rx="2" fill="#F6D778"/><rect x="804" y="286" width="14" height="16" rx="2" fill="#F6D778"/><rect x="726" y="346" width="14" height="16" rx="2" fill="#F6D778"/>
<rect x="880" y="200" width="120" height="210" fill="#E8EFEC"/><rect x="880" y="200" width="120" height="210" fill="url(#ven)"/><rect x="872" y="190" width="136" height="14" fill="#0F4C45"/>
<rect x="1020" y="250" width="110" height="160" fill="#F2F6F4"/><rect x="1020" y="250" width="110" height="160" fill="url(#ven)"/><rect x="1012" y="240" width="126" height="14" fill="#0F4C45"/>
</g>
<rect x="0" y="405" width="1200" height="55" fill="#0F4C45"/>
<rect x="0" y="400" width="1200" height="8" fill="#2F7A68"/>
<g fill="#0F4C45">
<rect x="506" y="290" width="7" height="118" rx="3"/>
<path d="M510 292 C480 270 455 275 440 290 C470 280 490 285 510 296Z M510 292 C540 268 568 272 582 288 C552 280 530 285 510 296Z M510 290 C498 262 480 250 462 252 C485 262 498 276 508 294Z M510 290 C524 260 542 250 560 252 C538 262 524 276 512 294Z"/>
<rect x="1156" y="300" width="7" height="108" rx="3"/>
<path d="M1160 302 C1130 280 1105 285 1090 300 C1120 290 1140 295 1160 306Z M1160 302 C1190 278 1218 282 1232 298 C1202 290 1180 295 1160 306Z M1160 300 C1148 272 1130 260 1112 262 C1135 272 1148 286 1158 304Z"/>
<ellipse cx="660" cy="408" rx="50" ry="18" fill="#2F7A68"/><ellipse cx="960" cy="408" rx="44" ry="16" fill="#2F7A68"/>
</g>
<g opacity=".55"><path d="M330 120 q8 -8 16 0 q8 -8 16 0" stroke="#0F4C45" stroke-width="3" fill="none"/><path d="M390 95 q6 -6 12 0 q6 -6 12 0" stroke="#0F4C45" stroke-width="3" fill="none"/></g>
</svg>`;

// Muestra una sección; si su archivo de datos falla, muestra el aviso solo en esa sección.
function seccion(resultado, pintar) {
  if (resultado.status === "rejected") {
    console.error(resultado.reason);
    return `<div class="panel error"><p>${esc(resultado.reason.message)}</p></div>`;
  }
  return pintar(Array.isArray(resultado.value) ? resultado.value : []);
}

function galeria(fotos) {
  const validas = fotos.filter(f => enlaceSeguro(f.archivo)).slice(0, 6);
  if (!validas.length) return "";
  return `<h2 class="sec">Nuestro conjunto</h2>
    <div class="gal">${validas.map(f => `<figure><img src="${esc(enlaceSeguro(f.archivo))}" alt="${esc(f.descripcion || "Foto del conjunto")}" loading="lazy">${f.descripcion ? `<figcaption>${esc(f.descripcion)}</figcaption>` : ""}</figure>`).join("")}</div>`;
}

function ultimosComunicados(lista) {
  const ult = [...lista].sort(recientesPrimero).slice(0, 3);
  return `<div class="panel"><h2>Últimos comunicados</h2><div class="list">${ult.map(c =>
    `<a class="item" href="comunicados.html#c-${esc(c.id)}"><div><div class="t">${esc(c.titulo)}</div><div class="m">${fecha(c.fecha)}</div></div>${c.categoria ? `<span class="pill p-info">${esc(c.categoria)}</span>` : ""}</a>`).join("")
    || `<div class="empty">Aún no hay comunicados publicados.</div>`}</div>
    <a class="btn sm ghost" href="comunicados.html">Ver todos</a></div>`;
}

function proximosEventos(lista) {
  const hoy = hoyISO();
  const prox = lista.filter(e => aFecha(e.fecha) && e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 4);
  return `<div class="panel"><h2>Próximos eventos</h2><div class="list">${prox.map(e => {
    const d = aFecha(e.fecha);
    return `<div class="item evento"><div class="cal"><b>${d.getDate()}</b><span>${d.toLocaleDateString("es-CO", { month: "short" })}</span></div><div><div class="t">${esc(e.titulo)}</div><div class="m">${esc(e.detalle)}</div></div></div>`;
  }).join("") || `<div class="empty">No hay eventos programados.</div>`}</div></div>`;
}

function zonas(lista) {
  if (!lista.length) return "";
  return `<h2 class="sec">Zonas comunes</h2>
    <div class="zonas">${lista.map((z, i) => `<a class="zona z${i % 4}" href="zonas.html#zona-${i + 1}">${icono(z.icono)}<div><b>${esc(z.nombre)}</b><span>${esc(z.horario || "Horario por definir")}</span></div></a>`).join("")}</div>`;
}

function normas(lista) {
  if (!lista.length) return "";
  return `<h2 class="sec">Normas básicas</h2>
    <div class="normas">${lista.map(n => `<div class="norma"><h3>${esc(n.titulo)}</h3><p>${esc(n.texto)}</p>${n.fuente ? `<p class="m">${esc(n.fuente)}</p>` : ""}</div>`).join("")}</div>
    <p class="m">Resumen informativo. Las normas completas están en el <a href="documentos.html">Manual de convivencia y el Reglamento</a>.</p>`;
}

async function iniciar() {
  const sitio = await montarPagina();
  const [com, eve, zon, fot, nor] = await Promise.allSettled(["comunicados", "eventos", "zonas", "fotos", "normas"].map(cargar));

  document.getElementById("inicio").innerHTML = `
  <section class="portada">
    ${ESCENA}
    <div class="portada-txt">
      <img class="logo-portada" src="img/logo-aragon.png" alt="Logo del Conjunto Residencial Aragón" width="215" height="92">
      <p class="saludo">Bienvenido a Aragón en línea</p>
      <h1 class="titular">${esc(sitio.nombre)}</h1>
      <p class="lema">${esc(sitio.lema || "")}</p>
      <div class="row"><a class="btn sol" href="comunicados.html">Ver comunicados</a><a class="btn claro" href="zonas.html">Zonas comunes</a></div>
    </div>
  </section>

  <nav class="accesos" aria-label="Accesos rápidos">
    <a href="comunicados.html"><b>Comunicados</b><span>Circulares y avisos</span></a>
    <a href="documentos.html"><b>Documentos</b><span>Reglamento, manuales y políticas</span></a>
    <a href="zonas.html"><b>Zonas comunes</b><span>Horarios y reglas de uso</span></a>
    <a href="#contacto"><b>Contacto</b><span>Portería y administración</span></a>
  </nav>

  ${seccion(fot, galeria)}

  <div class="grid g2 bloque">
    ${seccion(com, ultimosComunicados)}
    ${seccion(eve, proximosEventos)}
  </div>

  ${seccion(zon, zonas)}

  ${seccion(nor, normas)}`;
}

iniciar();
