-- =====================================================================
-- Aragón en línea · Cuentas de administración y consejo separadas, contraseña y suspensión
-- Pegar en Supabase → SQL Editor → Run (una sola vez, DESPUÉS de correr 021 por separado).
--
-- Decisiones del 2026-09-28:
--  1. La administración y el consejo usan una cuenta INSTITUCIONAL, aparte de la de su casa.
--     Una cuenta institucional no puede tener casa, y una cuenta con casa no puede tener cargo.
--     Si la administradora o un consejero es propietario o residente, entra a lo de su casa
--     con su cuenta personal (otro correo), como cualquier vecino.
--  2. Las cuentas institucionales entran SOLO con el código que llega al correo. Si una de ellas
--     llegara a tener contraseña, pierde los permisos de administración o consejo (así, quien
--     averigüe o cree una contraseña no entra al panel sin acceso al correo).
--  3. Los residentes crean su contraseña después de ser aprobados (eso lo maneja Supabase Auth).
--  4. La administración puede SUSPENDER una cuenta con un motivo (y reactivarla después).
--     Retirar sigue siendo definitivo.
-- =====================================================================

-- ---------- 2. ¿La cuenta actual NO tiene contraseña? ----------
create or replace function privado.sin_contrasena() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.encrypted_password from auth.users u where u.id = (select auth.uid())), '') = '';
$$;
revoke execute on function privado.sin_contrasena() from public, anon;
grant execute on function privado.sin_contrasena() to authenticated;

-- Administración y consejo: además de su cargo activo, la sesión debe ser de una cuenta sin contraseña.
create or replace function privado.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.rol = 'administracion' and p.estado = 'activo'
  ) and privado.sin_contrasena();
$$;

create or replace function privado.es_consejo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.rol = 'consejo' and p.estado = 'activo'
  ) and privado.sin_contrasena();
$$;

-- ---------- 1. Separar cuentas ----------
-- Casas registradas hoy en cuentas de administración o consejo: se retiran (la persona las
-- vuelve a registrar con su cuenta personal y un código nuevo).
do $$
declare r record;
begin
  for r in
    update public.perfiles p
    set estado = 'retirado', revisado_en = now(),
        motivo_rechazo = 'Las cuentas de administración y consejo no pueden tener casa. Registre su casa con su cuenta personal.'
    where p.unidad_id is not null and p.estado in ('pendiente', 'activo')
      and exists (select 1 from public.perfiles q
                  where q.user_id = p.user_id and q.unidad_id is null and q.estado in ('pendiente', 'activo'))
    returning p.id
  loop
    perform privado.limpiar_pendientes(r.id);
  end loop;
end $$;

create or replace function privado.separar_cuentas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado in ('pendiente', 'activo') then
    if new.unidad_id is null and exists (
        select 1 from public.perfiles p
        where p.user_id = new.user_id and p.id <> new.id and p.unidad_id is not null
          and p.estado in ('pendiente', 'activo', 'suspendido')) then
      raise exception 'Esta cuenta tiene una casa registrada. La administración y el consejo usan una cuenta aparte, con otro correo.';
    end if;
    if new.unidad_id is not null and exists (
        select 1 from public.perfiles p
        where p.user_id = new.user_id and p.id <> new.id and p.unidad_id is null
          and p.estado in ('pendiente', 'activo', 'suspendido')) then
      raise exception 'Esta es una cuenta de administración o del consejo: no puede registrar una casa. Registre su casa con su cuenta personal (otro correo).';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function privado.separar_cuentas() from public, anon, authenticated;

drop trigger if exists separar_cuentas on public.perfiles;
create trigger separar_cuentas before insert or update of estado, unidad_id, user_id on public.perfiles
  for each row execute function privado.separar_cuentas();

-- ---------- 4. Suspender y reactivar ----------
create or replace function public.admin_suspender_perfil(p_perfil uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede suspender cuentas.');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba el motivo de la suspensión (mínimo 10 caracteres). La persona lo verá.');
  end if;
  if exists (select 1 from public.perfiles where id = p_perfil and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'mensaje', 'No puede suspender su propia cuenta.');
  end if;
  update public.perfiles set estado = 'suspendido', motivo_rechazo = left(btrim(p_motivo), 300),
         revisado_en = now(), revisado_por = auth.uid()
  where id = p_perfil and estado = 'activo';
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se pueden suspender cuentas activas.');
  end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Cuenta suspendida. La persona no podrá ver ni cambiar información hasta que la reactive.');
end;
$$;

create or replace function public.admin_reactivar_perfil(p_perfil uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.perfiles;
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede reactivar cuentas.');
  end if;
  select * into p from public.perfiles where id = p_perfil and estado = 'suspendido';
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La cuenta no está suspendida.');
  end if;
  if exists (select 1 from public.perfiles q where q.id <> p.id and q.estado in ('pendiente', 'activo')
             and ((p.unidad_id is not null and q.unidad_id = p.unidad_id and q.rol = p.rol)
                  or (q.user_id = p.user_id and coalesce(q.unidad_id, 0) = coalesce(p.unidad_id, 0)))) then
    return jsonb_build_object('ok', false, 'mensaje', 'No se puede reactivar: ya hay otra cuenta vigente con ese rol en esa casa.');
  end if;
  update public.perfiles set estado = 'activo', motivo_rechazo = null, revisado_en = now(), revisado_por = auth.uid()
  where id = p_perfil;
  return jsonb_build_object('ok', true, 'mensaje', 'Cuenta reactivada.');
end;
$$;

-- Retirar (definitivo) ahora también aplica a cuentas suspendidas.
create or replace function public.admin_retirar_perfil(p_perfil uuid, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede retirar cuentas.');
  end if;
  update public.perfiles set estado = 'retirado', motivo_rechazo = left(p_motivo, 300),
         revisado_en = now(), revisado_por = auth.uid()
  where id = p_perfil and estado in ('pendiente', 'activo', 'suspendido');
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La cuenta no está activa.');
  end if;
  perform privado.limpiar_pendientes(p_perfil);
  return jsonb_build_object('ok', true, 'mensaje', 'Cuenta retirada.');
end;
$$;

revoke execute on function public.admin_suspender_perfil(uuid, text), public.admin_reactivar_perfil(uuid) from public, anon;
grant execute on function public.admin_suspender_perfil(uuid, text), public.admin_reactivar_perfil(uuid) to authenticated;

-- ---------- mi_estado: incluye suspensiones, si tiene contraseña y si es cuenta institucional ----------
create or replace function public.mi_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'correo', auth.jwt() ->> 'email',
    'politica', (select jsonb_build_object('version', version, 'url', url, 'texto', texto_autorizacion)
                 from public.politicas where activa),
    'autorizacion_vigente', privado.autorizacion_vigente(),
    'es_admin', privado.es_admin(),
    'es_consejo', privado.es_consejo(),
    'tiene_contrasena', not privado.sin_contrasena(),
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

-- ---------- Verificación ----------
-- Debe mostrar las cuentas de administración y consejo con tiene_contrasena = false.
-- Si alguna sale en true, esa cuenta perdió sus permisos: avise antes de seguir.
select p.rol, p.estado, p.correo,
       coalesce(u.encrypted_password, '') <> '' as tiene_contrasena
from public.perfiles p join auth.users u on u.id = p.user_id
where p.unidad_id is null and p.estado in ('pendiente', 'activo')
order by p.rol, p.correo;
