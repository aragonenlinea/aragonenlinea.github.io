-- =====================================================================
-- Aragón en línea · Fase 3 · Tablero de cartera
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 013).
--
-- historial_cartera(): totales de cada corte publicado (los últimos 24), para los gráficos
-- de evolución y antigüedad de la deuda. Solo totales: nunca números de casa ni nombres.
-- Lo ven las cuentas activas (propietarios, arrendatarios), el consejo y la administración,
-- igual que los informes financieros (decisión del consejo, 2026-09-27).
-- El mapa casa por casa sigue siendo solo de la administración (lee cartera_unidad con su RLS).
-- =====================================================================

create or replace function public.historial_cartera() returns jsonb
language sql stable security definer set search_path = '' as $$
  with cortes as (
    select distinct on (fecha_corte) id, fecha_corte, periodo
    from public.cartera_importaciones
    where estado = 'publicada'
    order by fecha_corte desc, id desc
    limit 24
  ), t as (
    select c.fecha_corte, c.periodo,
      coalesce(sum(u.saldo_total) filter (where u.saldo_total > 0), 0) as cartera_total,
      coalesce(-sum(u.saldo_total) filter (where u.saldo_total < 0), 0) as saldos_a_favor,
      count(*) filter (where u.saldo_total > 0) as casas_en_mora,
      count(*) filter (where u.saldo_total > 0
        and coalesce(u.mora_91_180, 0) + coalesce(u.mora_181_360, 0) + coalesce(u.mora_mas_360, 0) > 0) as casas_mora_mas_90,
      coalesce(sum(u.mora_1_30) filter (where u.saldo_total > 0), 0) as mora_1_30,
      coalesce(sum(u.mora_31_90) filter (where u.saldo_total > 0), 0) as mora_31_90,
      coalesce(sum(u.mora_91_180) filter (where u.saldo_total > 0), 0) as mora_91_180,
      coalesce(sum(u.mora_181_360) filter (where u.saldo_total > 0), 0) as mora_181_360,
      coalesce(sum(u.mora_mas_360) filter (where u.saldo_total > 0), 0) as mora_mas_360,
      coalesce(sum(u.saldo_total) filter (where u.saldo_total > 0
        and num_nulls(u.mora_1_30, u.mora_31_90, u.mora_91_180, u.mora_181_360, u.mora_mas_360) = 5), 0) as sin_clasificar
    from cortes c left join public.cartera_unidad u on u.importacion_id = c.id
    group by c.fecha_corte, c.periodo
  )
  select case when privado.puede_ver_finanzas() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha_corte', fecha_corte, 'periodo', periodo,
      'cartera_total', cartera_total, 'saldos_a_favor', saldos_a_favor,
      'casas_en_mora', casas_en_mora, 'casas_al_dia', 40 - casas_en_mora, 'casas_mora_mas_90', casas_mora_mas_90,
      'edades', jsonb_build_object('mora_1_30', mora_1_30, 'mora_31_90', mora_31_90, 'mora_91_180', mora_91_180,
                                   'mora_181_360', mora_181_360, 'mora_mas_360', mora_mas_360, 'sin_clasificar', sin_clasificar)
    ) order by fecha_corte) from t), '[]'::jsonb) end;
$$;

revoke execute on function public.historial_cartera() from public, anon;
grant execute on function public.historial_cartera() to authenticated;
