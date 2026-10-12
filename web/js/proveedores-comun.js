// Pólizas, proveedores y contratos: datos, semáforo de vencimientos, garantías exigidas, avisos y tablas.
// Lo usan las páginas del consejo (polizas.html y proveedores.html, solo lectura) y las pestañas del panel (con edición).
// Solo el consejo y la administración pueden leer estas tablas (lo exige la base de datos).
import { esc, fecha, hoyISO } from "./comun.js";
import { sb, consulta } from "./supabase.js";
import { pesos } from "./cuenta.js";

export const SERVICIOS = ["Vigilancia", "Aseo y servicios generales", "Mantenimiento de piscina", "Mantenimiento eléctrico",
  "Mantenimiento general", "Jardinería", "Contabilidad", "Administración", "Asesoría jurídica", "Seguros", "Otro"];
export const TIPOS_DOC_PROVEEDOR = ["RUT", "Cámara de Comercio", "Seguridad social (PILA)", "Licencia o permiso", "Experiencia o referencias", "Otro"];
export const TIPOS_POLIZA = ["Áreas comunes (incendio y terremoto)", "Responsabilidad civil extracontractual", "Manejo",
  "Sustracción", "Equipo electrónico", "Rotura de vidrios", "Cumplimiento de contrato", "Otra"];
export const COBERTURAS = ["Incendio", "Terremoto", "Actos malintencionados de terceros (AMIT)", "Terrorismo", "Manejo",
  "Responsabilidad civil extracontractual", "Sustracción", "Equipo electrónico", "Rotura de vidrios",
  "Cumplimiento", "Salarios y prestaciones sociales", "Calidad del servicio", "RC por uso de armas y elementos de vigilancia", "Otra"];
export const AMBITOS = ["Conjunto", "Todos los contratistas", ...SERVICIOS.filter(s => s !== "Seguros"), "Seguros"];
export const TIPOS_MINIMO = { obligatoria: "Obligatoria (sin valor mínimo)", avaluo: "% del avalúo", smmlv: "Salarios mínimos (SMMLV)",
  porcentaje_contrato: "% del valor del contrato", recomendada: "Recomendada" };
export const NIVELES = { ley: "Ley", rph: "Reglamento (RPH)", conjunto: "Exigencia del conjunto", recomendada: "Recomendada" };

// Si aún no se ha aplicado 031: las pólizas obligatorias del conjunto (RPH arts. 34 y 63).
const OBLIGATORIAS = [["Áreas comunes (incendio y terremoto)", "RPH art. 34 y Ley 675 art. 15"],
  ["Manejo", "RPH art. 63: 4 salarios mínimos"], ["Responsabilidad civil extracontractual", "RPH art. 34, parágrafo 2"]];
// Pólizas registradas sin el detalle de coberturas: qué cubren según su tipo.
const POR_TIPO = { "Áreas comunes (incendio y terremoto)": ["Incendio", "Terremoto"], "Responsabilidad civil extracontractual": ["Responsabilidad civil extracontractual"],
  Manejo: ["Manejo"], "Sustracción": ["Sustracción"], "Equipo electrónico": ["Equipo electrónico"], "Rotura de vidrios": ["Rotura de vidrios"],
  "Cumplimiento de contrato": ["Cumplimiento"] };

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

// Todo lo necesario para las dos secciones (y la ejecución del rubro de cada contrato en el año).
export async function cargarDatos() {
  const anio = new Date().getFullYear();
  const [proveedores, contratos, polizas, conf, documentos, presupuesto, docsProveedor, coberturas, requisitos] = await Promise.all([
    consulta(sb.from("proveedores").select("*").order("nombre")),
    consulta(sb.from("contratos").select("*").order("fecha_fin", { ascending: true, nullsFirst: false })),
    consulta(sb.from("polizas").select("*").order("vigencia_hasta")),
    consulta(sb.from("configuracion_conjunto").select("*").eq("id", 1).maybeSingle()),
    consulta(sb.from("documentos_privados").select("id,titulo,categoria,fecha,audiencia").eq("estado", "publicado").order("fecha", { ascending: false })),
    consulta(sb.from("presupuestos").select("id,anio").eq("estado", "publicado").eq("anio", anio).maybeSingle()),
    // Si aún no se ha aplicado 029 o 031, la sección funciona igual, sin esas partes.
    consulta(sb.from("proveedor_documentos").select("*").order("tipo")).catch(() => []),
    consulta(sb.from("poliza_coberturas").select("*").order("id")).catch(() => null),
    consulta(sb.from("requisitos_poliza").select("*").order("id")).catch(() => null)
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
  return { proveedores, contratos, polizas, conf: conf || {}, documentos, rubros, anio, docsProveedor,
           coberturas: coberturas || [], requisitos: requisitos || [], con031: requisitos !== null && coberturas !== null };
}

const vigente = p => p.estado === "vigente" && diasHasta(p.vigencia_hasta) >= 0;

// Coberturas de una póliza; si no se registró el detalle, las que indica su tipo (con el valor asegurado total).
export function coberturasDe(d, p) {
  const propias = d.coberturas.filter(c => c.poliza_id === p.id);
  if (propias.length) return propias;
  return (POR_TIPO[p.tipo] || []).map(c => ({ cobertura: c, valor_asegurado: p.valor_asegurado, segunTipo: true }));
}

// Valor de un contrato: el total; si no lo tiene, el mensual por los meses de vigencia.
function valorContrato(c) {
  if (c.valor_total != null) return Number(c.valor_total);
  if (c.valor_mensual != null && c.fecha_fin) {
    const meses = Math.max(1, Math.round((new Date(c.fecha_fin) - new Date(c.fecha_inicio)) / DIA / 30.44));
    return Number(c.valor_mensual) * meses;
  }
  return null;
}

// Compara cada garantía exigida con lo que cubren las pólizas vigentes.
function comparar(d, requisitos, polizas, contratos) {
  const baseContrato = contratos ? contratos.map(valorContrato) : [];
  const valorBase = baseContrato.length && baseContrato.every(v => v != null) ? baseContrato.reduce((a, b) => a + b, 0) : null;
  return requisitos.map(r => {
    const cubre = polizas.flatMap(p => coberturasDe(d, p).filter(c => c.cobertura === r.cobertura).map(c => ({ ...c, poliza: p })));
    const conValor = cubre.filter(c => c.valor_asegurado != null);
    const contratado = conValor.length ? conValor.reduce((s, c) => s + Number(c.valor_asegurado), 0) : null;
    let minimo = null, falta = null;
    const v = Number(r.minimo_valor || 0);
    if (r.minimo_tipo === "avaluo") {
      const a = Number(d.conf.avaluo_valor || 0);
      if (a) minimo = Math.round(a * v / 100); else falta = "Falta el valor del avalúo";
    } else if (r.minimo_tipo === "smmlv") {
      const s = Number(d.conf.smmlv || 0);
      if (s) minimo = s * v; else falta = "Falta el salario mínimo";
    } else if (r.minimo_tipo === "porcentaje_contrato") {
      if (valorBase) minimo = Math.round(valorBase * v / 100); else falta = "Falta el valor del contrato";
    }
    let resultado;
    if (!cubre.length) resultado = r.minimo_tipo === "recomendada" ? { clase: "p-warn", texto: "No contratada", nivel: 1 } : { clase: "p-bad", texto: "No cumple", nivel: 2, detalle: "No hay póliza vigente con esta cobertura" };
    else if (r.minimo_tipo === "recomendada") resultado = { clase: "p-ok", texto: "Contratada", nivel: 0 };
    else if (r.minimo_tipo === "obligatoria") resultado = { clase: "p-ok", texto: "Cumple", nivel: 0 };
    else if (falta) resultado = { clase: "p-info", texto: "Sin dato", nivel: 1, detalle: falta };
    else if (contratado == null) resultado = { clase: "p-info", texto: "Sin dato", nivel: 1, detalle: "Falta el valor asegurado de la póliza" };
    else if (contratado >= minimo) resultado = { clase: "p-ok", texto: "Cumple", nivel: 0 };
    else resultado = { clase: "p-bad", texto: "No cumple", nivel: 2, detalle: `Faltan ${pesos(minimo - contratado)}` };
    return { requisito: r, cubre, contratado, minimo, resultado };
  });
}

// Grupos del cuadro: el conjunto y cada contratista con contrato vigente (menos las aseguradoras).
export function garantias(d) {
  const req = d.requisitos.filter(r => r.activo);
  const vig = d.polizas.filter(vigente);
  const grupos = [{ titulo: "Pólizas del conjunto (bienes comunes)", filas: comparar(d, req.filter(r => r.ambito === "Conjunto"), vig.filter(p => !p.proveedor_id), null) }];
  for (const prov of d.proveedores.filter(p => p.estado === "activo" && p.servicio !== "Seguros")) {
    const contratos = d.contratos.filter(c => c.proveedor_id === prov.id && c.estado === "vigente");
    if (!contratos.length) continue;
    const rs = req.filter(r => r.ambito === "Todos los contratistas" || r.ambito === prov.servicio);
    if (!rs.length) continue;
    grupos.push({ titulo: `${prov.nombre} · ${prov.servicio}`, proveedor: prov, contratos, filas: comparar(d, rs, vig.filter(p => p.proveedor_id === prov.id), contratos) });
  }
  return grupos;
}

function exigencia(r, minimo) {
  const v = Number(r.minimo_valor || 0).toLocaleString("es-CO");
  const valor = minimo != null ? `<div class="m">= ${pesos(minimo)}</div>` : "";
  switch (r.minimo_tipo) {
    case "avaluo": return `${v} % del avalúo${valor}`;
    case "smmlv": return `${v} salarios mínimos${valor}`;
    case "porcentaje_contrato": return `${v} % del valor del contrato${valor}`;
    case "recomendada": return "Recomendada";
    default: return "Obligatoria";
  }
}
const pillNivel = n => `<span class="pill ${n === "ley" ? "p-bad" : n === "rph" ? "p-warn" : n === "conjunto" ? "p-info" : "p-sun"}">${esc(NIVELES[n] || n)}</span>`;

export function htmlGarantias(d) {
  if (!d.con031) return `<div class="aviso info">Para ver el cuadro de garantías aplique en Supabase el archivo 031_garantias_polizas.sql.</div>`;
  return garantias(d).map(g => {
    const malas = g.filas.filter(f => f.resultado.nivel === 2).length;
    return `<div class="bloque-sm"><div class="row"><h3>${esc(g.titulo)}</h3>${g.filas.length ? (malas ? `<span class="pill p-bad">${malas} sin cumplir</span>` : `<span class="pill p-ok">Cumple lo exigido</span>`) : ""}</div>
      ${g.contratos ? `<p class="m">Contrato${g.contratos.length > 1 ? "s" : ""} vigente${g.contratos.length > 1 ? "s" : ""}: ${g.contratos.map(c => esc(c.objeto)).join(" · ")}</p>` : ""}
      <div class="tablewrap"><table class="tabla-garantias">
      <thead><tr><th>Garantía</th><th>Resultado</th><th>Exigido</th><th class="num">Contratado</th><th>Fuente</th></tr></thead>
      <tbody>${g.filas.map(f => `<tr><td>${esc(f.requisito.cobertura)}${f.requisito.nota ? `<div class="m">${esc(f.requisito.nota)}</div>` : ""}</td>
        <td>${pill(f.resultado)}${f.resultado.detalle ? `<div class="m">${esc(f.resultado.detalle)}</div>` : ""}</td>
        <td>${exigencia(f.requisito, f.minimo)}${f.requisito.vigencia ? `<div class="m">Vigencia: ${esc(f.requisito.vigencia)}</div>` : ""}</td>
        <td class="num">${f.contratado != null ? pesos(f.contratado) : f.cubre.length ? "Sin valor" : "—"}${f.cubre.length ? `<div class="m">${f.cubre.map(c => esc(`${c.poliza.aseguradora}${c.poliza.numero ? " · " + c.poliza.numero : ""}`)).join("; ")}${f.cubre.some(c => c.segunTipo) ? " (según el tipo de póliza)" : ""}</div>` : ""}</td>
        <td>${pillNivel(f.requisito.nivel)}<div class="m">${esc(f.requisito.fuente)}</div></td></tr>`).join("")
        || `<tr><td colspan="5" class="m">No hay garantías exigidas para este grupo.</td></tr>`}</tbody></table></div></div>`;
  }).join("") + `<p class="m">Las garantías de los contratistas marcadas «Exigencia del conjunto» toman como referencia la contratación estatal (Decreto 1082 de 2015); no son obligación legal y el consejo las puede ajustar.</p>`;
}

// Lista de avisos: lo que la administración debe atender (y el consejo vigilar).
// seccion: "polizas", "proveedores" o vacío (todo).
export function avisos(d, seccion = "") {
  const lista = [];
  const nombre = id => d.proveedores.find(p => p.id === id)?.nombre || "proveedor";
  if (seccion !== "proveedores") {
    const smmlv = Number(d.conf.smmlv || 0);
    if (!smmlv) lista.push({ nivel: 1, texto: "Escriba el salario mínimo del año para revisar la póliza de manejo y las garantías en salarios mínimos." });
    if (d.con031) {
      if (!d.conf.avaluo_valor) lista.push({ nivel: 1, texto: "Escriba el valor del último avalúo de los bienes comunes para revisar las pólizas de incendio y terremoto." });
      for (const g of garantias(d)) {
        const malas = g.filas.filter(f => f.resultado.nivel === 2);
        if (!g.proveedor) {
          for (const f of malas) lista.push({ nivel: 2, texto: `Pólizas del conjunto: ${f.requisito.cobertura} no cumple (${f.resultado.detalle.toLowerCase()}; ${f.requisito.fuente}).` });
        } else if (malas.length) {
          // Un aviso por contratista; es urgente si falta algo que exige la ley o el RPH.
          const urgente = malas.some(f => f.requisito.nivel !== "conjunto");
          lista.push({ nivel: urgente ? 2 : 1, texto: `${g.proveedor.nombre}: ${malas.length === 1 ? "una garantía exigida no cumple" : `${malas.length} garantías exigidas no cumplen`} (${malas.map(f => f.requisito.cobertura).join(", ")}). Vea el cuadro de garantías.` });
        }
      }
    } else {
      const vigentes = d.polizas.filter(p => vigente(p) && !p.proveedor_id);
      for (const [tipo, norma] of OBLIGATORIAS) {
        if (!vigentes.some(p => p.tipo === tipo)) lista.push({ nivel: 2, texto: `Falta la póliza de ${tipo.toLowerCase()} del conjunto (${norma}).` });
      }
      for (const p of vigentes.filter(p => p.tipo === "Manejo" && smmlv && Number(p.valor_asegurado || 0) < 4 * smmlv)) {
        lista.push({ nivel: 2, texto: `La póliza de manejo ${p.numero || ""} asegura ${pesos(p.valor_asegurado || 0)}: el RPH exige 4 salarios mínimos (${pesos(4 * smmlv)}).` });
      }
    }
    for (const p of d.polizas.filter(p => p.estado === "vigente")) {
      const s = semaforo(p.vigencia_hasta);
      if (s.nivel) lista.push({ nivel: s.nivel, texto: `Póliza de ${p.tipo.toLowerCase()} (${p.aseguradora}${p.numero ? " · " + p.numero : ""}${p.proveedor_id ? ", de " + nombre(p.proveedor_id) : ""}): ${s.texto.toLowerCase()}.` });
    }
  }
  if (seccion !== "polizas") {
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
  }
  return lista.sort((a, b) => b.nivel - a.nivel);
}

export function htmlAvisos(lista, seccion = "") {
  if (!lista.length) return `<div class="aviso ok">Todo al día: ${seccion === "proveedores" ? "ningún contrato ni documento de proveedor por vencer" : seccion === "polizas" ? "las pólizas cumplen lo exigido y ninguna vence en los próximos 60 días" : "pólizas vigentes y ningún contrato por vencer en los próximos 60 días"}.</div>`;
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
    <thead><tr><th>Tipo · coberturas</th><th>Aseguradora · número</th><th>De</th><th class="num">Valor asegurado</th><th class="num">Prima</th><th>Vigencia</th><th>Estado</th><th>Documento</th>${editar ? "<th></th>" : ""}</tr></thead>
    <tbody>${d.polizas.map(p => {
      const cob = d.coberturas.filter(c => c.poliza_id === p.id);
      return `<tr class="${p.estado === "anulada" ? "fila-apagada" : ""}"><td>${esc(p.tipo)}${p.cubre ? `<div class="m">${esc(p.cubre)}</div>` : ""}
        ${cob.length ? `<div class="m">${cob.map(c => esc(c.cobertura) + (c.valor_asegurado != null ? ": " + pesos(c.valor_asegurado) : "")).join(" · ")}</div>` : ""}</td>
      <td>${esc(p.aseguradora)}${p.numero ? `<div class="m">${esc(p.numero)}</div>` : ""}${htmlDocsProveedor(d, p.aseguradora_id)}</td>
      <td>${p.proveedor_id ? esc(prov(p.proveedor_id) || "Contratista") : "Conjunto"}</td>
      <td class="num">${p.valor_asegurado != null ? pesos(p.valor_asegurado) : ""}</td><td class="num">${p.prima != null ? pesos(p.prima) : ""}</td>
      <td>${fecha(p.vigencia_desde)} a ${fecha(p.vigencia_hasta)}</td>
      <td>${p.estado === "anulada" ? `<span class="pill p-info">Anulada</span>` : pill(semaforo(p.vigencia_hasta))}</td>
      <td>${enlaceDoc(d, p.documento_id)}</td>${editar ? `<td>${editar("poliza", p.id)}</td>` : ""}</tr>`;
    }).join("") || `<tr><td colspan="${editar ? 9 : 8}" class="m">Aún no hay pólizas registradas.</td></tr>`}</tbody></table></div>`;
}

// Garantías exigidas (tabla de referencia, editable por la administración).
export function htmlRequisitos(d, editar = null) {
  if (!d.con031) return "";
  return `<div class="tablewrap"><table>
    <thead><tr><th>A quién</th><th>Garantía</th><th>Exigido</th><th>Vigencia</th><th>Fuente</th>${editar ? "<th></th>" : ""}</tr></thead>
    <tbody>${d.requisitos.map(r => `<tr class="${r.activo ? "" : "fila-apagada"}"><td>${esc(r.ambito)}${r.activo ? "" : ` <span class="pill p-info">Desactivada</span>`}</td>
      <td>${esc(r.cobertura)}</td><td>${exigencia(r, null)}</td><td>${esc(r.vigencia || "")}</td>
      <td>${pillNivel(r.nivel)}<div class="m">${esc(r.fuente)}</div></td>${editar ? `<td>${editar("requisito", r.id)}</td>` : ""}</tr>`).join("")}</tbody></table></div>`;
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
  const docs = proveedorId ? d.docsProveedor.filter(x => x.proveedor_id === proveedorId) : [];
  if (!docs.length) return quitar ? `<p class="m">Aún no hay documentos.</p>` : "";
  return `<ul class="docs-proveedor">${docs.map(x => {
    const s = x.vence_el ? semaforo(x.vence_el) : null;
    return `<li><b>${esc(x.tipo)}:</b> ${enlaceDoc(d, x.documento_id)}${s ? ` ${s.nivel ? pill(s) : `<span class="m">vence el ${fecha(x.vence_el)}</span>`}` : ""}${x.notas ? ` <span class="m">· ${esc(x.notas)}</span>` : ""}
      ${quitar ? `<button class="btn sm ghost" type="button" data-quitar-pdoc="${x.id}">Quitar</button>` : ""}</li>`;
  }).join("")}</ul>`;
}

// soloServicio: "Seguros" para las aseguradoras (pestaña Pólizas); "otros" para los demás.
export function htmlProveedores(d, editar = null, soloServicio = "otros") {
  const lista = d.proveedores.filter(p => soloServicio === "Seguros" ? p.servicio === "Seguros" : p.servicio !== "Seguros");
  if (!lista.length) return `<p class="m">${soloServicio === "Seguros" ? "Aún no hay aseguradoras registradas: se crean al registrar una póliza." : "Aún no hay proveedores registrados."}</p>`;
  return `<div class="grid g2">${lista.map(p => {
    const vigentes = d.contratos.filter(c => c.proveedor_id === p.id && c.estado === "vigente").length;
    const polizas = d.polizas.filter(x => x.aseguradora_id === p.id && x.estado === "vigente").length;
    return `<div class="panel tarjeta-proveedor ${p.estado === "inactivo" ? "fila-apagada" : ""}">
      <div class="row"><b>${esc(p.nombre)}</b><span class="pill p-info">${esc(p.servicio)}</span>${p.tipo === "persona_natural" ? `<span class="pill p-sun">Persona natural</span>` : ""}${p.estado === "inactivo" ? `<span class="pill p-info">Inactivo</span>` : ""}</div>
      ${p.nit ? `<div class="m">NIT ${esc(p.nit)}</div>` : ""}
      ${p.funciones ? `<p class="texto-lineas">${esc(p.funciones)}</p>` : ""}
      ${p.telefono || p.correo ? `<div class="m">${[p.telefono, p.correo].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
      <div class="m">${p.servicio === "Seguros" ? `${polizas} póliza(s) vigente(s) con el conjunto o sus contratistas` : `${vigentes} contrato(s) vigente(s)`}</div>
      ${htmlDocsProveedor(d, p.id)}
      ${editar ? `<div class="acciones-form">${editar("proveedor", p.id)}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}
