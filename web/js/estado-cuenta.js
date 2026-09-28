// Estado de cuenta de la casa. La plataforma no cobra: "Pagar" solo abre el enlace del banco.
import { montarPagina, esc, fecha, enlaceSeguro } from "./comun.js";
import { sb, exigirSesion, rpc, consulta, aviso } from "./supabase.js";
import { barraCuenta, casaElegida, recordarCasa, selectorCasa, casasActivas, pesos } from "./cuenta.js";

const caja = document.getElementById("estado-cuenta");
let estado = null, perfil = null;

const CONCEPTOS = [
  ["saldo_anterior", "Saldo anterior"],
  ["cuota_administracion", "Cuota de administración"],
  ["cuota_extraordinaria", "Cuota extraordinaria"],
  ["parqueadero", "Parqueadero"],
  ["multas", "Multas y sanciones"],
  ["intereses_mora", "Intereses de mora"]
];
const EDADES = [["mora_1_30", "1 a 30 días"], ["mora_31_90", "31 a 90 días"], ["mora_91_180", "91 a 180 días"],
                ["mora_181_360", "181 a 360 días"], ["mora_mas_360", "Más de 360 días"]];

async function pintar() {
  let html = barraCuenta(estado, "Estado de cuenta", "estado-cuenta.html");
  if (!perfil) {
    caja.innerHTML = html + `<div class="panel nota">Primero debe tener su casa registrada y aprobada. <a href="mi-hogar.html?hogar=1">Ir a Mi hogar</a></div>`;
    return;
  }
  if (perfil.rol === "arrendatario" && !perfil.puede_ver_cuenta) {
    caja.innerHTML = html + selectorCasa(estado, perfil) + `<div class="panel nota">El estado de cuenta de la Casa ${esc(perfil.unidad_id)} lo ve el propietario. Si usted paga la administración, pídale que le dé acceso desde su cuenta (sección "Acceso del arrendatario").</div>`;
    return;
  }
  const [cortes, pago] = await Promise.all([
    consulta(sb.from("cartera_unidad").select("*").eq("unidad_id", perfil.unidad_id)
      .order("fecha_corte", { ascending: false }).order("id", { ascending: false }).limit(13)),
    consulta(sb.from("configuracion_pagos").select("*").eq("id", 1).maybeSingle())
  ]);
  html += selectorCasa(estado, perfil);
  if (!cortes.length) {
    caja.innerHTML = html + `<div class="panel">Aún no hay un estado de cuenta publicado para la Casa ${esc(perfil.unidad_id)}.</div>`;
    return;
  }
  const c = cortes[0];
  const saldo = Number(c.saldo_total);
  const url = pago?.url_pago ? enlaceSeguro(pago.url_pago) : "";
  const instrucciones = (pago?.instrucciones || "").replaceAll("{casa}", String(perfil.unidad_id));
  const edades = EDADES.filter(([k]) => c[k] != null && Number(c[k]) !== 0);

  html += `<div class="grid g2">
    <div class="panel">
      <h2>Casa ${esc(perfil.unidad_id)} · corte al ${fecha(c.fecha_corte)}</h2>
      <p class="m">${esc(c.periodo)}</p>
      <div class="tablewrap"><table>
        <tbody>
          ${CONCEPTOS.filter(([k]) => Number(c[k]) !== 0 || k === "cuota_administracion").map(([k, t]) =>
            `<tr><td>${t}</td><td class="num">${pesos(c[k])}</td></tr>`).join("")}
          <tr><td>Pagos del periodo</td><td class="num">${Number(c.pagos_periodo) ? "−" + pesos(c.pagos_periodo) : pesos(0)}</td></tr>
          <tr><th>${saldo > 0 ? "Saldo por pagar" : saldo < 0 ? "Saldo a favor" : "Saldo"}</th><th class="num">${pesos(Math.abs(saldo))}</th></tr>
        </tbody>
      </table></div>
      ${edades.length ? `<h3>Antigüedad de la deuda</h3><div class="tablewrap"><table><tbody>${edades.map(([k, t]) =>
        `<tr><td>${t}</td><td class="num">${pesos(c[k])}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <p class="m">Los pagos hechos después de la fecha de corte se verán en el siguiente estado de cuenta.</p>
    </div>
    <div class="panel">
      ${saldo > 0 ? `<div class="kpi"><div class="n">${pesos(saldo)}</div><div class="l">Saldo por pagar</div></div>`
        : `<div class="aviso ok">${saldo < 0 ? `Tiene un saldo a favor de ${pesos(-saldo)}.` : "Está al día. ¡Gracias!"}</div>`}
      ${pago?.aviso_pronto_pago ? `<div class="aviso info">${esc(pago.aviso_pronto_pago)}</div>` : ""}
      ${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(pago.texto_boton || "Pagar")}</a>
        <p class="m">Se abre la página del banco. La plataforma no recibe pagos ni guarda datos bancarios.</p>` : ""}
      ${instrucciones ? `<h3>Cómo pagar</h3><p class="texto-lineas">${esc(instrucciones)}</p>` : ""}
    </div>
  </div>
  ${cortes.length > 1 ? `<div class="panel bloque"><h2>Cortes anteriores</h2><div class="tablewrap"><table>
      <thead><tr><th>Fecha de corte</th><th>Periodo</th><th class="num">Saldo</th></tr></thead>
      <tbody>${cortes.slice(1).map(x => `<tr><td>${fecha(x.fecha_corte)}</td><td>${esc(x.periodo)}</td>
        <td class="num">${Number(x.saldo_total) < 0 ? "A favor " + pesos(-x.saldo_total) : pesos(x.saldo_total)}</td></tr>`).join("")}</tbody>
    </table></div></div>` : ""}`;
  caja.innerHTML = html;
}

caja.addEventListener("change", async e => {
  if (e.target.id !== "casa") return;
  recordarCasa(+e.target.value);
  perfil = casasActivas(estado).find(p => p.unidad_id === +e.target.value);
  try { await pintar(); } catch (err) { aviso(caja, err.message, "error"); }
});

async function iniciar() {
  await montarPagina();
  await exigirSesion();
  caja.innerHTML = `<p class="m">Cargando…</p>`;
  try {
    estado = await rpc("mi_estado");
    if (!estado.autorizacion_vigente) { location.replace("mi-hogar.html?hogar=1"); return; }
    perfil = casaElegida(estado);
    await pintar();
  } catch (err) {
    aviso(caja, err.message, "error");
  }
}

iniciar();
