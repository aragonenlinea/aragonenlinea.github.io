"""Tapa datos personales en un PDF antes de publicarlo.

Borra el texto de verdad (no solo lo cubre), elimina las imágenes que queden
debajo de un recuadro (firmas escaneadas) y deja los metadatos vacíos.

Requisito (una sola vez):  python -m pip install --user pymupdf

Uso:
  python herramientas/tapar_pdf.py ENTRADA.pdf SALIDA.pdf --texto "Nombre Apellido" --texto "12.345.678"
  python herramientas/tapar_pdf.py ENTRADA.pdf SALIDA.pdf --recuadro 2,108,445,174,490

  --texto      busca ese texto en todas las páginas y lo tapa (se puede repetir).
  --recuadro   tapa un área: página (desde 1), x0, y0, x1, y1 en puntos
               (la hoja carta mide 612 x 792). Útil para firmas (se puede repetir).

Al final revisa que ninguno de los textos pedidos siga en el PDF.
Nunca guarde la SALIDA encima de la ENTRADA: conserve el original fuera del repositorio.
"""
import argparse
import sys

import pymupdf

NEGRO = (0.15, 0.15, 0.15)


def main():
    p = argparse.ArgumentParser(description="Tapa datos personales en un PDF.")
    p.add_argument("entrada")
    p.add_argument("salida")
    p.add_argument("--texto", action="append", default=[])
    p.add_argument("--recuadro", action="append", default=[])
    a = p.parse_args()

    recuadros = {}
    for r in a.recuadro:
        pag, *coords = [float(v) for v in r.split(",")]
        recuadros.setdefault(int(pag) - 1, []).append(pymupdf.Rect(*coords))

    doc = pymupdf.open(a.entrada)
    total = 0
    for n, pag in enumerate(doc):
        marcas = [r for t in a.texto for r in pag.search_for(t)]
        for r in marcas:
            pag.add_redact_annot(r, fill=NEGRO)
        for r in recuadros.get(n, []):
            pag.add_redact_annot(r, fill=NEGRO)
        if marcas or n in recuadros:
            # Con recuadros se borran las imágenes debajo (firmas); si solo hay texto, se conservan fondos y logos.
            modo = pymupdf.PDF_REDACT_IMAGE_REMOVE if n in recuadros else pymupdf.PDF_REDACT_IMAGE_NONE
            pag.apply_redactions(images=modo)
            total += len(marcas) + len(recuadros.get(n, []))
    doc.set_metadata({})
    doc.del_xml_metadata()
    doc.save(a.salida, garbage=4, deflate=True, clean=True)

    texto_final = " ".join(pg.get_text() for pg in pymupdf.open(a.salida)).lower()
    quedan = [t for t in a.texto if t.lower() in texto_final]
    print(f"Zonas tapadas: {total}. Archivo: {a.salida}")
    if quedan:
        print("ATENCIÓN: estos textos siguen en el PDF (quizá partidos en dos líneas):", quedan)
        sys.exit(1)
    print("Revisión: ninguno de los textos pedidos aparece en el PDF final.")


if __name__ == "__main__":
    main()
