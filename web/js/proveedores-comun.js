// Proveedores, contratos y pólizas: datos, semáforo de vencimientos, avisos y tablas.
// Lo usan la página del consejo (proveedores.html, solo lectura) y la pestaña del panel (con edición).
// Solo el consejo y la administración pueden leer estas tablas (lo exige la base de datos).
import { esc, fecha, hoyISO } from "./comun.js";
import { sb, consulta } from "./supabase.js";
import { pesos } from "./cuenta.js";

export const SERVICIOS = ["Vigilancia", "Aseo y servicios generales", "Mantenimiento de piscina", "Mantenimiento eléctrico",
  "Mantenimiento general", "Jardinería", "Contabilidad", "Administración", "Asesoría jurídica", "Seguros", "Otro"];
export const TIPOS_DOC_PROVEEDOR = ["RUT", "Cámara de Comercio", "Seguridad social (PILA)", "Licencia o permiso", "Experiencia o referencias", "Otro"];
export const TIPOS_POLIZA = ["Áreas comunes (incendio y terremoto)", "Responsabilidad civil extracontractual", "Manejo",
  "Sustracción", "Equipo electrónico", "Rotura de vidrios", "Cumplimiento de contrato", "Otra"];
// Pólizas del conjunto que el RPH exige (arts. 34 y 63) o recomienda expresamente (art. 34, parágrafo 2).
export const OBLIGATORIAS = [["Áreas comunes (incendio y terremoto)", "RPH art. 34 y Ley 675 art. 15"],
  ["Manejo", "RPH art. 63: 4 salarios mínimos"], ["Responsabilidad civil extracontractual", "RPH art. 34, parágrafo 2"]];

const DIA = 86400000;
export const diasHasta = f => Math.round((new Date(f + "T00:00:00") - new Date(hoyISO() + "T00:00:00")) / DIA);

// Semáforo de una fecha de vencimiento: { clase, texto, nivel } (nivel 0 bien · 1 pronto · 2 urgente/vencido)
export function semaforo(hasta) {
  if (!hasta) return { clase: "p-info", texto: "Sin fecha de fin", nivel: 0 };
  const d = diasHasta(hasta);
  if (d < 0) return { clase: "p-bad", texto: `Vencida hace ${-d} día${d === -1 ? "" : "s"}`, nivel: 2 };
  if (d <= 30) return { clase: "p-bad", texto: d === 0 ? "Vence hoy" : `Vence en ${d} día${d === 1 ? "" : "s"}`, nivel: 2 };
  if (d <= 60) return { clase: "p-warn", texto: `Vence en ${d} días`, nivel: 1 };
  return { clase: "p-ok", texto: `Vigente hasta ${fecha(hasta)}`, nivel: 0 };
}
const pill = s => `<span class="pill ${s.clase}">${esc(s.texto)}</span>`;

// Todo lo necesario para la sección (y la ejecución del rubro de cada contrato en el año).
export async function cargarDatos() {
  const anio = new Date().getFullYear();
  const [proveedores, contratos, polizas, conf, documentos, presupuesto, docsProveedor] = await Promise.all([
    consulta(sb.from("proveedores").select("*").order("nombre")),
    consulta(sb.from("contratos").select("*").order("fecha_fin", { ascending: true, nullsFirst: false })),
    consulta(sb.from("polizas").select("*").order("vigencia_hasta")),
    consulta(sb.from("configuracion_conjunto").select("*").eq("id", 1).maybeSingle()),
    consulta(sb.from("documentos_privados").select("id,titulo,categoria,fecha,audiencia").eq("estado", "publicado").order("fecha", { ascending: false })),
    consulta(sb.from("presupuestos").select("id,anio").eq("estado", "publicado").eq("anio", anio).maybeSingle()),
    // Si aún no se ha aplicado 029, la sección funciona igual, sin documentos de proveedores.
    consulta(sb.from("proveedor_documentos").select("*").order("tipo")).catch(() => [])
  ]);
  const rubros = {};
  if (presupuesto) {
    const [pr, infs] = await Promise.all([
      consulta(sb.from("presupuesto_rubros").select("rubro,valor_anual").eq("presupuesto_id", presupuesto.id).eq("tipo", "gasto").order("orden")),
      consulta(sb.from("informes_mensuales").select("id").eq("anio", anio).eq("estado", "publicado"))
    ]);
    for (const r of pr) rubros[r.rubro] = { presupuesto: Number(r.valor_anual), ejecutado: 0 };
    if (infs.length) {
      const ej = await consulta(sb.from("ejecucion_mensual").select("rubro,valor").eq("tipo", "gasto").in("informe_id", infs.map(i => i.id)));
      for (const e of ej) if (rubros[e.rubro]) rubros[e.rubro].ejecutado += Number(e.valor);
    }
  }
  return { proveedores, contratos, polizas, conf: conf || {}, documentos, rubros, anio, docsProveedor };
}

// Lista de avisos: lo que la administración debe atender (y el consejo vigilar).
export function avisos(d) {
  const lista = [];
  const vigentes = d.polizas.filter(p => p.estado === "vigente" && diasHasta(p.vigencia_hasta) >= 0 && !p.proveedor_id);
  for (const [tipo, norma] of OBLIGATORIAS) {
    if (!vigentes.some(p => p.tipo === tipo)) lista.push({ nivel: 2, texto: `Falta la póliza de ${tipo.toLowerCase()} del conjunto (${norma}).` });
  }
  const smmlv = Number(d.conf.smmlv || 0);
  if (!smmlv) lista.push({ nivel: 1, texto: "Escriba el salario mínimo del año para revisar el valor de la póliza de manejo." });
  for (const p of vigentes.filter(p => p.tipo === "Manejo" && smmlv && Number(p.valor_asegurado || 0) < 4 * smmlv)) {
    lista.push({ nivel: 2, texto: `La póliza de manejo ${p.numero || ""} asegura ${pesos(p.valor_asegurado || 0)}: el RPH exige 4 salarios mínimos (${pesos(4 * smmlv)}).` });
  }
  for (const p of d.polizas.filter(p => p.estado === "vigente")) {
    const s = semaforo(p.vigencia_hasta);
    if (s.nivel) lista.push({ nivel: s.nivel, texto: `Póliza de ${p.tipo.toLowerCase()} (${p.aseguradora}${p.numero ? " · " + p.numero : ""}): ${s.texto.toLowerCase()}.` });
  }
  const nombre = id => d.proveedores.find(p => p.id === id)?.nombre || "proveedor";
  for (const c of d.contratos.filter(c => c.estado === "vigente")) {
    const s = semaforo(c.fecha_fin);
    if (s.nivel === 2 && diasHasta(c.fecha_fin) < 0) lista.push({ nivel: 2, texto: `El contrato de ${nombre(c.proveedor_id)} terminó el ${fecha(c.fecha_fin)} y sigue como vigente: registre la prórroga o márquelo terminado.` });
    else if (s.nivel) lista.push({ nivel: s.nivel, texto: `Contrato de ${nombre(c.proveedor_id)} (${c.objeto}): ${s.texto.toLowerCase()}.` });
  }
  for (const pd of d.docsProveedor) {
    const p = d.proveedores.find(x => x.id === pd.proveedor_id);
    if (!p || p.estado !== "activo" || !pd.vence_el) continue;
    const s = semaforo(pd.vence_el);
    if (s.nivel === 2) lista.push({ nivel: 2, texto: `${pd.tipo} de ${p.nombre}: ${s.texto.toLowerCase().replace("vencida", "vencido")}.` });
  }
  return lista.sort((a, b) => b.nivel - a.nivel);
}

export function htmlAvisos(lista) {
  if (!lista.length) return `<div class="aviso ok">Todo al día: pólizas vigentes y ningún contrato por vencer en los próximos 60 días.</div>`;
  return `<ul class="avisos-control">${lista.map(a => `<li class="${a.nivel === 2 ? "urgente" : "pronto"}"><span class="pill ${a.nivel === 2 ? "p-bad" : "p-warn"}">${a.nivel === 2 ? "Urgente" : "Pronto"}</span> ${esc(a.texto)}</li>`).join("")}</ul>`;
}

const enlaceDoc = (d, id) => {
  const doc = d.documentos.find(x => x.id === id);
  return doc ? `<a href="visor.html?privado=${doc.id}" target="_blank" rel="noopener">${esc(doc.titulo)}</a>` : `<span class="m">Sin documento</span>`;
};

// editar: función (tipo, id) → HTML del botón de edición, o null para solo lectura.
export function htmlPolizas(d, editar = null) {
  const prov = id => d.proveedores.find(p => p.id === id)?.nombre;
  return `<div class="tablewrap"><table>
    <thead><tr><th>Tipo</th><th>Aseguradora · número</th><th>De</th><th class="num">Valor asegurado</th><th class="num">Prima</th><th>Vigencia</th><th>Estado</th><th>Documento</th>${editar ? "<th></th>" : ""}</tr></thead>
    <tbody>${d.polizas.map(p => `<tr class="${p.estado === "anulada" ? "fila-apagada" : ""}"><td>${esc(p.tipo)}${p.cubre ? `<div class="m">${esc(p.cubre)}</div>` : ""}</td>
      <td>${esc(p.aseguradora)}${p.numero ? `<div class="m">${esc(p.numero)}</div>` : ""}</td>
      <td>${p.proveedor_id ? esc(prov(p.proveedor_id) || "Contratista") : "Conjunto"}</td>
      <td class="num">${p.valor_asegurado != null ? pesos(p.valor_asegurado) : ""}</td><td class="num">${p.prima != null ? pesos(p.prima) : ""}</td>
      <td>${fecha(p.vigencia_desde)} a ${fecha(p.vigencia_hasta)}</td>
      <td>${p.estado === "anulada" ? `<span class="pill p-info">Anulada</span>` : pill(semaforo(p.vigencia_hasta))}</td>
      <td>${enlaceDoc(d, p.documento_id)}</td>${editar ? `<td>${editar("poliza", p.id)}</td>` : ""}</tr>`).join("")
      || `<tr><td colspan="${editar ? 9 : 8}" class="m">Aún no hay pólizas registradas.</td></tr>`}</tbody></table></div>`;
}

export function htmlContratos(d, editar = null) {
  const prov = id => d.proveedores.find(p => p.id === id);
  return `<div class="tablewrap"><table>
    <thead><tr><th>Proveedor · objeto</th><th>Vigencia</th><th class="num">Valor mensual</th><th class="num">Valor total</th><th>Rubro (ejecutado ${d.anio})</th><th>Supervisa</th><th>Estado</th><th>Documento</th>${editar ? "<th></th>" : ""}</tr></thead>
    <tbody>${d.contratos.map(c => {
      const p = prov(c.proveedor_id);
      const r = c.rubro && d.rubros[c.rubro];
      const estado = c.estado === "vigente" ? pill(semaforo(c.fecha_fin)) : `<span class="pill p-info">${c.estado === "terminado" ? "Terminado" : "Anulado"}</span>`;
      return `<tr class="${c.estado !== "vigente" ? "fila-apagada" : ""}"><td><b>${esc(p?.nombre || "")}</b><div class="m">${esc(c.objeto)}</div>${c.polizas_exigidas ? `<div class="m">Pólizas exigidas: ${esc(c.polizas_exigidas)}</div>` : ""}</td>
        <td>${fecha(c.fecha_inicio)}${c.fecha_fin ? ` a ${fecha(c.fecha_fin)}` : " · sin fecha de fin"}</td>
        <td class="num">${c.valor_mensual != null ? pesos(c.valor_mensual) : ""}</td><td class="num">${c.valor_total != null ? pesos(c.valor_total) : ""}</td>
        <td>${c.rubro ? esc(c.rubro) : `<span class="m">Sin rubro</span>`}${r ? `<div class="m">${pesos(r.ejecutado)} de ${pesos(r.presupuesto)}${r.presupuesto ? ` (${Math.round(r.ejecutado * 100 / r.presupuesto)} %)` : ""}</div>` : ""}</td>
        <td>${esc(c.supervisor)}</td><td>${estado}</td><td>${enlaceDoc(d, c.documento_id)}</td>${editar ? `<td>${editar("contrato", c.id)}</td>` : ""}</tr>`;
    }).join("") || `<tr><td colspan="${editar ? 9 : 8}" class="m">Aún no hay contratos registrados.</td></tr>`}</tbody></table></div>`;
}

// Documentos del proveedor (RUT, Cámara de Comercio, PILA…) con su vencimiento.
export function htmlDocsProveedor(d, proveedorId, quitar = false) {
  const docs = d.docsProveedor.filter(x => x.proveedor_id === proveedorId);
  if (!docs.length) return quitar ? `<p class="m">Aún no hay documentos.</p>` : "";
  return `<ul class="docs-proveedor">${docs.map(x => {
    const s = x.vence_el ? semaforo(x.vence_el) : null;
    return `<li><b>${esc(x.tipo)}:</b> ${enlaceDoc(d, x.documento_id)}${s ? ` ${s.nivel ? pill(s) : `<span class="m">vence el ${fecha(x.vence_el)}</span>`}` : ""}${x.notas ? ` <span class="m">· ${esc(x.notas)}</span>` : ""}
      ${quitar ? `<button class="btn sm ghost" type="button" data-quitar-pdoc="${x.id}">Quitar</button>` : ""}</li>`;
  }).join("")}</ul>`;
}

export function htmlProveedores(d, editar = null) {
  if (!d.proveedores.length) return `<p class="m">Aún no hay proveedores registrados.</p>`;
  return `<div class="grid g2">${d.proveedores.map(p => {
    const vigentes = d.contratos.filter(c => c.proveedor_id === p.id && c.estado === "vigente").length;
    return `<div class="panel tarjeta-proveedor ${p.estado === "inactivo" ? "fila-apagada" : ""}">
      <div class="row"><b>${esc(p.nombre)}</b><span class="pill p-info">${esc(p.servicio)}</span>${p.tipo === "persona_natural" ? `<span class="pill p-sun">Persona natural</span>` : ""}${p.estado === "inactivo" ? `<span class="pill p-info">Inactivo</span>` : ""}</div>
      ${p.nit ? `<div class="m">NIT ${esc(p.nit)}</div>` : ""}
      ${p.funciones ? `<p class="texto-lineas">${esc(p.funciones)}</p>` : ""}
      ${p.telefono || p.correo ? `<div class="m">${[p.telefono, p.correo].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
      <div class="m">${vigentes} contrato(s) vigente(s)</div>
      ${htmlDocsProveedor(d, p.id)}
      ${editar ? `<div class="acciones-form">${editar("proveedor", p.id)}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}
