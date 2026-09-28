-- =====================================================================
-- Aragón en línea · Nuevo estado de cuenta: "suspendido"
-- Pegar en Supabase → SQL Editor → Run, SOLO este archivo, antes de 022.
-- (PostgreSQL no permite usar un estado nuevo en la misma ejecución en que se crea.)
--
-- Suspendida: la administración corta el acceso por una causa motivada y lo puede reactivar.
-- Retirada (ya existía): definitivo, por ejemplo por venta de la casa.
-- =====================================================================
alter type public.estado_perfil add value if not exists 'suspendido';
