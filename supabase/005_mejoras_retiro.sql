-- =====================================================================
-- Aragón en línea · Entrega 2a · Mejoras tras la prueba del arrendatario
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 001 a 004).
--
-- 1. Quien tuvo acceso y se lo retiraron (o se le venció) ve un aviso claro.
-- 2. Al retirar una cuenta se borran sus registros de Mi hogar que aún estaban
--    pendientes (datos de alguien que ya no vive en la casa y nadie validó).
-- 3. El censo y el resumen del propietario solo cuentan registros de cuentas
--    activas y vigentes.
-- =====================================================================

-- Cuentas activas y vigentes (auxiliar para contar registros).
create or replace function privado.perfil_vigente(p_perfil uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = p_perfil and p.estado = 'activo' and (p.vence_el is null or p.vence_el >= current_date)
  );
$$;
revoke execute on function privado.perfil_vigente(uuid) from public, anon;

-- Borra los registros pendientes de una cuenta retirada.
create or replace function privado.limpiar_pendientes(p_perfil uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.habitantes where perfil_id = p_perfil and estado = 'pendiente';
  delete from public.mascotas where perfil_id = p_perfil and estado = 'pendiente';
  delete from public.vehiculos where perfil_id = p_perfil and estado = 'pendiente';
$$;
revoke execute on function privado.limpiar_pendientes(uuid) from public, anon, authenticated;

-- 1. mi_estado: incluye accesos retirados para mostrar el aviso.
create or replace function public.mi_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'correo', auth.jwt() ->> 'email',
    'politica', (select jsonb_build_object('version', version, 'url', url, 'texto', texto_autorizacion)
                 from public.politicas where activa),
    'autorizacion_vigente', privado.autorizacion_vigente(),
    'es_admin', privado.es_admin(),
    'es_consejo', privado.es_consejo(),
    'perfiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'unidad_id', p.unidad_id, 'rol', p.rol, 'estado', p.estado, 'nombre', p.nombre,
        'vence_el', p.vence_el, 'vencido', (p.vence_el is not null and p.vence_el < current_date),
        'puede_ver_cuenta', p.puede_ver_cuenta, 'datos_confirmados_en', p.datos_confirmados_en,
        'motivo_rechazo', p.motivo_rechazo) order by p.unidad_id nulls last)
      from public.perfiles p
      where p.user_id = auth.uid()
        and (p.estado in ('pendiente', 'activo', 'rechazado')
             or (p.estado = 'retirado' and p.revisado_en > now() - interval '180 days'))), '[]'::jsonb),
    'invitacion_arrendatario', (
      select jsonb_build_object('unidad_id', i.unidad_id, 'contrato_hasta', i.contrato_hasta)
      from public.invitaciones i
      where i.rol = 'arrendatario' and lower(i.correo) = lower(auth.jwt() ->> 'email')
        and i.usada_en is null and i.anulada_en is null and i.vence_el > now()
      order by i.creado_en desc limit 1)
  );
$$;

-- 2. Retirar arrendatario: además borra sus registros pendientes.
create or replace function public.retirar_arrendatario(p_unidad smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  retirado uuid;
begin
  if not (privado.es_propietario_de(p_unidad) or privado.es_admin()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el propietario o la administración pueden retirar el acceso.');
  end if;
  for retirado in
    update public.perfiles set estado = 'retirado', revisado_en = now(), revisado_por = auth.uid()
    where unidad_id = p_unidad and rol = 'arrendatario' and estado in ('pendiente', 'activo')
    returning id
  loop
    perform privado.limpiar_pendientes(retirado);
  end loop;
  update public.invitaciones set anulada_en = now()
  where unidad_id = p_unidad and rol = 'arrendatario' and usada_en is null and anulada_en is null;
  return jsonb_build_object('ok', true, 'mensaje', 'Acceso del arrendatario retirado.');
end;
$$;

create or replace function public.admin_retirar_perfil(p_perfil uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede retirar cuentas.');
  end if;
  update public.perfiles set estado = 'retirado', motivo_rechazo = left(p_motivo, 300),
         revisado_en = now(), revisado_por = auth.uid()
  where id = p_perfil and estado in ('pendiente', 'activo');
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La cuenta no está activa.');
  end if;
  perform privado.limpiar_pendientes(p_perfil);
  return jsonb_build_object('ok', true, 'mensaje', 'Cuenta retirada.');
end;
$$;

-- 3. Resumen y censo: solo registros de cuentas activas y vigentes.
create or replace function public.resumen_casa(p_unidad smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when privado.es_propietario_de(p_unidad) or privado.es_admin() then
    jsonb_build_object(
      'habitantes', (select count(*) from public.habitantes where unidad_id = p_unidad and estado <> 'rechazado' and privado.perfil_vigente(perfil_id)),
      'mascotas', (select count(*) from public.mascotas where unidad_id = p_unidad and estado <> 'rechazado' and privado.perfil_vigente(perfil_id)),
      'vehiculos', (select count(*) from public.vehiculos where unidad_id = p_unidad and estado <> 'rechazado' and privado.perfil_vigente(perfil_id)))
  end;
$$;

create or replace function public.censo() returns table (
  unidad_id smallint, casa text, propietario text, arrendatario text,
  habitantes bigint, mascotas bigint, vehiculos bigint, pendientes bigint, datos_confirmados_en timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.nombre,
    (select p.estado::text from public.perfiles p where p.unidad_id = u.id and p.rol = 'propietario'
       and p.estado in ('pendiente', 'activo') limit 1),
    (select case when p.vence_el is not null and p.vence_el < current_date then 'vencido' else p.estado::text end
       from public.perfiles p where p.unidad_id = u.id and p.rol = 'arrendatario'
       and p.estado in ('pendiente', 'activo') limit 1),
    (select count(*) from public.habitantes h where h.unidad_id = u.id and h.estado = 'validado' and privado.perfil_vigente(h.perfil_id)),
    (select count(*) from public.mascotas m where m.unidad_id = u.id and m.estado = 'validado' and privado.perfil_vigente(m.perfil_id)),
    (select count(*) from public.vehiculos v where v.unidad_id = u.id and v.estado = 'validado' and privado.perfil_vigente(v.perfil_id)),
    (select count(*) from public.habitantes h where h.unidad_id = u.id and h.estado = 'pendiente' and privado.perfil_vigente(h.perfil_id))
      + (select count(*) from public.mascotas m where m.unidad_id = u.id and m.estado = 'pendiente' and privado.perfil_vigente(m.perfil_id))
      + (select count(*) from public.vehiculos v where v.unidad_id = u.id and v.estado = 'pendiente' and privado.perfil_vigente(v.perfil_id)),
    (select max(p.datos_confirmados_en) from public.perfiles p where p.unidad_id = u.id and p.estado = 'activo')
  from public.unidades u
  where privado.es_admin() or privado.es_consejo()
  order by u.id;
$$;

-- Permisos (create or replace conserva los anteriores; se repiten por claridad).
revoke execute on function public.mi_estado(), public.retirar_arrendatario(smallint),
  public.admin_retirar_perfil(uuid, text), public.resumen_casa(smallint), public.censo() from public, anon;
grant execute on function public.mi_estado(), public.retirar_arrendatario(smallint),
  public.admin_retirar_perfil(uuid, text), public.resumen_casa(smallint), public.censo() to authenticated;
