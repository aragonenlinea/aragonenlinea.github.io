-- =====================================================================
-- Aragón en línea · Borrar la cartera y los informes financieros del ejercicio de prueba
-- Úselo UNA vez, justo antes de cargar la información real (junto con 006).
--
-- Borra TODOS los cortes de cartera, presupuestos, informes mensuales, ejecución y pagos
-- del mes que haya en la plataforma, para empezar de cero con la información oficial.
-- NO borra: la configuración del pago, las casas, las cuentas, PQRS, reservas ni comunicados.
-- No se puede deshacer: si ya se cargó información real que quiera conservar, NO lo use
-- (en ese caso anule desde el panel solo lo que sea de prueba).
-- Al final muestra cuántos registros quedaron (todo debe quedar en 0).
-- =====================================================================
begin;

delete from public.pagos_mes;
delete from public.ejecucion_mensual;
delete from public.informes_mensuales;
delete from public.presupuesto_rubros;
delete from public.presupuestos;
delete from public.cartera_unidad;
delete from public.cartera_importaciones;

commit;

select 'cortes de cartera' as que, count(*) as quedan from public.cartera_importaciones
union all select 'presupuestos', count(*) from public.presupuestos
union all select 'informes mensuales', count(*) from public.informes_mensuales
union all select 'pagos del mes', count(*) from public.pagos_mes;
