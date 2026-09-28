-- =====================================================================
-- Aragón en línea · Corrección: permisos institucionales según CÓMO se entró
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 022).
--
-- Qué corrige: 022 quitaba los permisos a las cuentas de administración y consejo que "tuvieran
-- contraseña". Pero Supabase le asigna por dentro una contraseña aleatoria a TODA cuenta creada con
-- el código al correo, así que la cuenta de administración quedó sin permisos.
--
-- Regla nueva (misma intención): los permisos de administración y consejo solo valen en una sesión
-- que NO se abrió con contraseña (es decir, que se abrió con el código o el enlace del correo).
-- Supabase guarda en cada sesión el método de ingreso (dato "amr" del token) y lo conserva al renovarla.
-- Si alguien entra a una cuenta institucional con contraseña, no llega al panel.
--
-- Además, "tiene_contrasena" (para invitar a los residentes a crear la suya) ya no se deduce de
-- Supabase: la página Mi contraseña deja constancia cuando la persona la crea.
-- =====================================================================

-- ¿La sesión actual se abrió SIN contraseña? (el nombre se conserva porque lo usan es_admin y es_consejo)
create or replace function privado.sin_contrasena() returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((auth.jwt() -> 'amr') @> '[{"method": "password"}]'::jsonb, false);
$$;

-- Constancia de que la persona creó su contraseña desde la plataforma.
create table if not exists public.contrasenas_creadas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creada_en timestamptz not null default now()
);
alter table public.contrasenas_creadas enable row level security;
revoke all on public.contrasenas_creadas from anon, authenticated;

create or replace function public.registrar_contrasena() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Inicie sesión primero.');
  end if;
  insert into public.contrasenas_creadas (user_id) values (auth.uid())
  on conflict (user_id) do update set creada_en = now();
  return jsonb_build_object('ok', true, 'mensaje', 'Listo.');
end;
$$;
revoke execute on function public.registrar_contrasena() from public, anon;
grant execute on function public.registrar_contrasena() to authenticated;

create or replace function public.mi_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'correo', auth.jwt() ->> 'email',
    'politica', (select jsonb_build_object('version', version, 'url', url, 'texto', texto_autorizacion)
                 from public.politicas where activa),
    'autorizacion_vigente', privado.autorizacion_vigente(),
    'es_admin', privado.es_admin(),
    'es_consejo', privado.es_consejo(),
    'sesion_con_contrasena', not privado.sin_contrasena(),
    'tiene_contrasena', (not privado.sin_contrasena())
                        or exists (select 1 from public.contrasenas_creadas c where c.user_id = auth.uid()),
    'institucional', exists (select 1 from public.perfiles p where p.user_id = auth.uid() and p.unidad_id is null
                             and p.estado in ('pendiente', 'activo', 'suspendido')),
    'perfiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'unidad_id', p.unidad_id, 'rol', p.rol, 'estado', p.estado, 'nombre', p.nombre,
        'vence_el', p.vence_el, 'vencido', (p.vence_el is not null and p.vence_el < current_date),
        'puede_ver_cuenta', p.puede_ver_cuenta, 'datos_confirmados_en', p.datos_confirmados_en,
        'motivo_rechazo', p.motivo_rechazo) order by p.unidad_id nulls last)
      from public.perfiles p
      where p.user_id = auth.uid()
        and (p.estado in ('pendiente', 'activo', 'rechazado', 'suspendido')
             or (p.estado = 'retirado' and p.revisado_en > now() - interval '180 days'))), '[]'::jsonb),
    'invitacion_arrendatario', (
      select jsonb_build_object('unidad_id', i.unidad_id, 'contrato_hasta', i.contrato_hasta)
      from public.invitaciones i
      where i.rol = 'arrendatario' and lower(i.correo) = lower(auth.jwt() ->> 'email')
        and i.usada_en is null and i.anulada_en is null and i.vence_el > now()
      order by i.creado_en desc limit 1)
  );
$$;

-- Verificación: cuentas de administración y consejo (deben aparecer las que usted espera).
select p.rol, p.estado, p.correo from public.perfiles p
where p.unidad_id is null and p.estado in ('pendiente', 'activo')
order by p.rol, p.correo;
