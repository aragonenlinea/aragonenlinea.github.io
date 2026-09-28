-- =====================================================================
-- Aragón en línea · Fase 3a · Cuadro de cartera por antigüedad y dos opciones de pago
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 010).
--
-- 1. resumen_cartera incluye los totales por antigüedad (1-30, 31-90, 91-180, 181-360,
--    más de 360 días), como el cuadro de cuentas por cobrar de los estados financieros.
--    El consejo ve solo esos totales; el detalle por casa sigue siendo solo de la administración.
-- 2. Dos botones de pago: PSE (cualquier banco) y el enlace del banco del convenio.
--    Solo la administración los configura, solo se aceptan enlaces https y cada cambio
--    queda en la auditoría. La plataforma no envía datos del residente al banco.
-- =====================================================================

alter table public.configuracion_pagos
  add column url_banco text check (url_banco is null or url_banco ~ '^https://[^\s]+$'),
  add column texto_boton_banco text not null default 'Pagar en Davivienda' check (length(texto_boton_banco) between 2 and 40);
update public.configuracion_pagos set texto_boton = 'Pagar por PSE (cualquier banco)' where id = 1 and texto_boton = 'Pagar';
grant update (url_banco, texto_boton_banco) on public.configuracion_pagos to authenticated;

create or replace function public.resumen_cartera() returns jsonb
language sql stable security definer set search_path = '' as $$
  with ultima as (
    select * from public.cartera_importaciones where estado = 'publicada'
    order by fecha_corte desc, id desc limit 1
  ), filas as (
    select cu.* from public.cartera_unidad cu join ultima on cu.importacion_id = ultima.id
  )
  select case when (privado.es_admin() or privado.es_consejo()) and exists (select 1 from ultima) then jsonb_build_object(
    'fecha_corte', (select fecha_corte from ultima),
    'periodo', (select periodo from ultima),
    'cartera_total', (select coalesce(sum(saldo_total), 0) from filas where saldo_total > 0),
    'saldos_a_favor', (select coalesce(-sum(saldo_total), 0) from filas where saldo_total < 0),
    'casas_en_mora', (select count(*) from filas where saldo_total > 0),
    'casas_al_dia', (select count(*) from filas where saldo_total <= 0) + (40 - (select count(*) from filas)),
    'casas_mora_mas_90', (select count(*) from filas
                          where coalesce(mora_91_180, 0) + coalesce(mora_181_360, 0) + coalesce(mora_mas_360, 0) > 0),
    'cartera_mas_360', (select coalesce(sum(mora_mas_360), 0) from filas),
    'edades', jsonb_build_object(
      'mora_1_30', (select coalesce(sum(mora_1_30), 0) from filas where saldo_total > 0),
      'mora_31_90', (select coalesce(sum(mora_31_90), 0) from filas where saldo_total > 0),
      'mora_91_180', (select coalesce(sum(mora_91_180), 0) from filas where saldo_total > 0),
      'mora_181_360', (select coalesce(sum(mora_181_360), 0) from filas where saldo_total > 0),
      'mora_mas_360', (select coalesce(sum(mora_mas_360), 0) from filas where saldo_total > 0),
      'sin_clasificar', (select coalesce(sum(saldo_total), 0) from filas
                         where saldo_total > 0 and num_nulls(mora_1_30, mora_31_90, mora_91_180, mora_181_360, mora_mas_360) = 5))
  ) end;
$$;

revoke execute on function public.resumen_cartera() from public, anon;
grant execute on function public.resumen_cartera() to authenticated, service_role;
