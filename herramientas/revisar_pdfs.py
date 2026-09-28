"""Revisión automática de datos personales en los PDF del sitio.

Se ejecuta en GitHub antes de publicar (ver .github/workflows/publicar.yml).
Si encuentra algo sospechoso, NO se publica y muestra qué encontró.

Busca en cada PDF de web/documentos/:
  - autor, título, asunto o palabras clave en los datos ocultos del archivo;
  - correos electrónicos que no estén en la lista de permitidos;
  - números de celular colombianos que no estén en la lista de permitidos;
  - números con formato de cédula (por ejemplo 12.345.678).

No detecta firmas escaneadas ni fotos: eso sigue siendo revisión manual.

La lista de correos, teléfonos y números permitidos está en
web/datos/datos_permitidos.json (datos institucionales del conjunto).

Uso local:  python herramientas/revisar_pdfs.py
"""
import glob
import json
import os
import re
import sys

import pymupdf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERMITIDOS = json.load(open(os.path.join(RAIZ, "web", "datos", "datos_permitidos.json"), encoding="utf-8"))

CORREO = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
CELULAR = re.compile(r"(?<![\d.])3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?![\d])")
CEDULA = re.compile(r"(?<![\d.])\d{1,3}(?:\.\d{3}){2}(?!\d|[.-]\d)")   # 12.345.678 (no NIT con dígito de verificación)
CAMPOS_META = ["author", "title", "subject", "keywords"]


def solo_digitos(s):
    return re.sub(r"\D", "", s)


def revisar(ruta):
    problemas = []
    doc = pymupdf.open(ruta)
    meta = {k: (doc.metadata or {}).get(k) for k in CAMPOS_META}
    for k, v in meta.items():
        if v and v.strip():
            problemas.append(f"datos ocultos del archivo: {k} = «{v.strip()}»")
    xmp = doc.get_xml_metadata() or ""
    if re.search(r"<dc:creator>|pdf:Author|<dc:title>", xmp):
        problemas.append("datos ocultos del archivo (XMP) con autor o título")

    correos_ok = {c.lower() for c in PERMITIDOS["correos"]}
    tels_ok = {solo_digitos(t) for t in PERMITIDOS["telefonos"]}
    nums_ok = set(PERMITIDOS["numeros"])
    for n, pag in enumerate(doc, start=1):
        texto = pag.get_text()
        for c in set(CORREO.findall(texto)):
            if c.lower() not in correos_ok:
                problemas.append(f"página {n}: correo {c}")
        for t in set(CELULAR.findall(texto)):
            if solo_digitos(t) not in tels_ok:
                problemas.append(f"página {n}: celular {t}")
        for c in set(CEDULA.findall(texto)):
            if c not in nums_ok:
                problemas.append(f"página {n}: número con formato de cédula {c}")
    return problemas


def main():
    archivos = sorted(glob.glob(os.path.join(RAIZ, "web", "documentos", "*.pdf")))
    con_problemas = 0
    for ruta in archivos:
        nombre = os.path.relpath(ruta, RAIZ).replace("\\", "/")
        problemas = revisar(ruta)
        if problemas:
            con_problemas += 1
            for p in problemas:
                print(f"::error file={nombre}::{p}")
                print(f"  {nombre}: {p}")
        else:
            print(f"OK  {nombre}")
    if con_problemas:
        print(f"\n{con_problemas} PDF con posibles datos personales. No se publica.")
        print("Tápelos con herramientas/tapar_pdf.py (también borra los datos ocultos) o, si el dato es")
        print("institucional del conjunto, agréguelo a web/datos/datos_permitidos.json.")
        sys.exit(1)
    print(f"\n{len(archivos)} PDF revisados sin hallazgos.")


if __name__ == "__main__":
    main()
