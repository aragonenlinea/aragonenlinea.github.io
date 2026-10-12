"""Revisión de un PDF antes de subirlo al espacio privado (misma idea de web/js/revisar-pdf.js).

1. Borra los datos ocultos del archivo (autor, título, programa, XMP).
2. Busca en el texto de cada página correos y celulares que no sean institucionales, y cédulas
   escritas junto a "C.C.", "cédula", "identificado con"... (no marca las cifras en pesos).
3. Reporta las páginas que son imagen (escaneadas): ahí no se puede buscar nada.

No detecta nombres, firmas ni fotos: para eso está "Tapar datos" en el panel.
"""
import re

import pymupdf

CORREO = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
CELULAR = re.compile(r"(?<![\d.])3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)")
CEDULA = re.compile(
    r"(?:\bc\.?\s?c\.?|c[ée]dula(?:\s+de\s+ciudadan[íi]a)?|identificad[oa]\s+con|identificaci[óo]n"
    r"|documento\s+de\s+identidad|\bT\.?I\.?)\s*(?:No\.?|n[úu]mero|#)?\s*[:.]?\s*(\d{1,3}(?:[.\s]\d{3}){1,3}|\d{6,11})",
    re.IGNORECASE)


def digitos(s):
    return re.sub(r"\D", "", s or "")


def revisar(ruta, permitidos):
    """Devuelve (bytes_limpios, paginas, hallazgos, paginas_imagen, metadatos_borrados).
    hallazgos: lista de textos "página N: tipo valor". Lanza ValueError con un mensaje claro."""
    try:
        doc = pymupdf.open(ruta)
    except Exception:
        raise ValueError("No se pudo abrir el PDF. Puede estar dañado: ábralo y guárdelo de nuevo como PDF.")
    if doc.needs_pass or doc.is_encrypted:
        raise ValueError("El PDF está protegido con contraseña o permisos. Quite la protección y vuelva a ponerlo en la carpeta.")

    meta = {k: v for k, v in (doc.metadata or {}).items() if k in ("author", "title", "subject", "keywords", "creator") and v and v.strip()}
    borrados = [f"{k}: {v.strip()}" for k, v in meta.items()]
    if doc.get_xml_metadata():
        borrados.append("datos XMP")
    doc.set_metadata({})
    doc.del_xml_metadata()

    correos_ok = {c.lower() for c in permitidos.get("correos", [])}
    tels_ok = {digitos(t) for t in permitidos.get("telefonos", [])}
    nums_ok = {digitos(n) for n in permitidos.get("numeros", [])}
    hallazgos, imagenes = [], []
    for n, pagina in enumerate(doc, start=1):
        texto = pagina.get_text()
        if len(re.sub(r"\s", "", texto)) < 20:
            imagenes.append(n)
            continue
        vistos = set()
        def agregar(tipo, valor):
            if (tipo, valor) not in vistos:
                vistos.add((tipo, valor))
                hallazgos.append(f"página {n}: {tipo} «{valor}»")
        for c in CORREO.findall(texto):
            if c.lower() not in correos_ok:
                agregar("correo", c)
        for t in CELULAR.findall(texto):
            if digitos(t) not in tels_ok:
                agregar("celular", t.strip())
        for m in CEDULA.finditer(texto):
            if digitos(m.group(1)) not in nums_ok:
                agregar("cédula", " ".join(m.group(0).split()))

    # garbage=4: guarda solo lo que se usa (no quedan restos de los datos ocultos dentro del archivo).
    datos = doc.tobytes(garbage=4, deflate=True)
    paginas = doc.page_count
    doc.close()
    return datos, paginas, hallazgos, imagenes, borrados
