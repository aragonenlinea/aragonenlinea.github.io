-- =====================================================================
-- Aragón en línea · Entrega 2a · Esquema de residentes, Mi hogar y censo
-- Cómo aplicarlo: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se ejecuta una sola vez. Los cambios posteriores irán en archivos 002, 003...
--
-- Reglas del proyecto que este archivo hace cumplir:
--  * Row Level Security (RLS) activado en TODAS las tablas.
--  * Cada casa solo ve sus datos; la administración ve todo; el consejo solo totales.
--  * El arrendatario no toma decisiones del propietario.
--  * Se guarda la autorización de datos (fecha, hora y versión) antes de guardar datos.
--  * De menores de edad solo nombre y parentesco. Sin cédulas, salud, religión ni ingresos.
-- =====================================================================

-- Esquema privado: funciones auxiliares que la API pública no expone.
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_perfil as enum ('propietario', 'arrendatario', 'administracion', 'consejo');
create type public.estado_perfil as enum ('pendiente', 'activo', 'rechazado', 'retirado');
create type public.estado_registro as enum ('pendiente', 'validado', 'rechazado');

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

-- Las 40 casas del conjunto (sin datos de personas).
create table public.unidades (
  id smallint primary key check (id between 1 and 40),
  nombre text generated always as ('Casa ' || id) stored,
  tipo smallint not null check (tipo in (1, 2))
);

-- Versiones de la política de tratamiento de datos. Solo una activa.
create table public.politicas (
  version text primary key,
  vigente_desde date not null,
  url text not null,
  texto_autorizacion text not null,
  activa boolean not null default false
);
create unique index politicas_una_activa on public.politicas (activa) where activa;

-- Prueba de la autorización de cada titular (Ley 1581): quién, cuándo y qué versión.
create table public.autorizaciones_datos (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  correo text not null,
  politica_version text not null references public.politicas (version),
  aceptada_en timestamptz not null default now(),
  navegador text
);

-- Cuentas: propietario o arrendatario de una casa; administración o consejo sin casa.
create table public.perfiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  unidad_id smallint references public.unidades (id),
  rol public.rol_perfil not null,
  estado public.estado_perfil not null default 'pendiente',
  nombre text not null check (length(btrim(nombre)) between 3 and 120),
  correo text not null,
  autorizado_por uuid references public.perfiles (id),
  vence_el date,                                   -- fin del contrato del arrendatario
  puede_ver_cuenta boolean not null default false, -- el propietario habilita el estado de cuenta al arrendatario (Fase 3)
  datos_confirmados_en timestamptz,
  motivo_rechazo text,
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id),
  check ((rol in ('propietario', 'arrendatario')) = (unidad_id is not null))
);
-- Una cuenta de propietario y una de arrendatario por casa.
create unique index perfiles_un_rol_por_casa on public.perfiles (unidad_id, rol)
  where estado in ('pendiente', 'activo') and unidad_id is not null;
-- Un usuario no repite perfil vigente en la misma casa, y tiene a lo sumo un cargo.
create unique index perfiles_usuario_unidad on public.perfiles (user_id, coalesce(unidad_id, 0))
  where estado in ('pendiente', 'activo');

-- Invitaciones: código impreso para el propietario; correo autorizado para el arrendatario.
create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  unidad_id smallint not null references public.unidades (id),
  rol public.rol_perfil not null check (rol in ('propietario', 'arrendatario')),
  codigo_hash text,              -- solo se guarda la huella del código, nunca el código
  correo text,
  contrato_hasta date,
  puede_ver_cuenta boolean not null default false,
  autorizado_por uuid references public.perfiles (id),
  vence_el timestamptz not null,
  creado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  usada_en timestamptz,
  usada_por uuid references auth.users (id),
  anulada_en timestamptz,
  check ((rol = 'propietario') = (codigo_hash is not null)),
  check ((rol = 'arrendatario') = (correo is not null))
);

-- Intentos fallidos de código (para frenar a quien intente adivinar).
create table public.intentos_codigo (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  en timestamptz not null default now()
);

-- Contacto de cada cuenta (el propietario no ve el del arrendatario y viceversa).
create table public.contactos (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  celular text check (celular ~ '^[0-9 +]{7,20}$'),
  correo_contacto text check (correo_contacto ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  emergencia_nombre text check (length(emergencia_nombre) <= 120),
  emergencia_celular text check (emergencia_celular ~ '^[0-9 +]{7,20}$'),
  actualizado_en timestamptz not null default now()
);

-- Mi hogar. Cada registro pertenece a la cuenta que lo creó y queda pendiente de validación.
create table public.habitantes (
  id uuid primary key default gen_random_uuid(),
  unidad_id smallint not null references public.unidades (id),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 120),
  relacion text not null check (relacion in ('Titular', 'Cónyuge o pareja', 'Hijo(a)', 'Padre o madre',
                                             'Otro familiar', 'Personal de servicio', 'Otro')),
  es_menor boolean not null default false,   -- de menores solo nombre y parentesco
  estado public.estado_registro not null default 'pendiente',
  motivo_rechazo text,
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id)
);

create table public.mascotas (
  id uuid primary key default gen_random_uuid(),
  unidad_id smallint not null references public.unidades (id),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  especie text not null check (especie in ('Perro', 'Gato', 'Otra')),
  raza text check (length(raza) <= 60),
  vacuna_fecha date,                          -- última vacuna antirrábica
  potencialmente_peligroso boolean not null default false,
  poliza text check (length(poliza) <= 60),
  estado public.estado_registro not null default 'pendiente',
  motivo_rechazo text,
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id)
);

create table public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  unidad_id smallint not null references public.unidades (id),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  placa text check (placa ~ '^[A-Z0-9]{5,7}$'),
  tipo text not null check (tipo in ('Automóvil', 'Camioneta', 'Motocicleta', 'Bicicleta')),
  marca text check (length(marca) <= 40),
  color text check (length(color) <= 30),
  parqueadero text check (length(parqueadero) <= 20),
  estado public.estado_registro not null default 'pendiente',
  motivo_rechazo text,
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id),
  check (tipo = 'Bicicleta' or placa is not null)
);
create unique index vehiculos_placa_unica on public.vehiculos (placa)
  where placa is not null and estado <> 'rechazado';

-- Registro de cambios (solo lo ve la administración).
create table public.auditoria (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  user_id uuid,
  tabla text not null,
  registro_id text,
  accion text not null,
  antes jsonb,
  despues jsonb
);

-- ---------------------------------------------------------------------
-- Funciones auxiliares (esquema privado)
-- ---------------------------------------------------------------------

-- ¿El usuario tiene un cargo activo de administración?
create function privado.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.rol = 'administracion' and p.estado = 'activo'
  );
$$;

create function privado.es_consejo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.rol = 'consejo' and p.estado = 'activo'
  );
$$;

-- Perfil activo y vigente del usuario en una casa (el arrendatario vencido deja de tener acceso).
create function privado.perfil_en(p_unidad smallint) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.perfiles p
  where p.user_id = (select auth.uid()) and p.unidad_id = p_unidad and p.estado = 'activo'
    and (p.vence_el is null or p.vence_el >= current_date)
  limit 1;
$$;

-- Todos los perfiles activos y vigentes del usuario (uno por casa).
create function privado.mis_perfiles() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.perfiles p
  where p.user_id = (select auth.uid()) and p.estado = 'activo'
    and (p.vence_el is null or p.vence_el >= current_date);
$$;

create function privado.es_propietario_de(p_unidad smallint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid()) and p.unidad_id = p_unidad
      and p.rol = 'propietario' and p.estado = 'activo'
  );
$$;

-- ¿Aceptó la versión activa de la política?
create function privado.autorizacion_vigente() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.autorizaciones_datos a
    join public.politicas po on po.version = a.politica_version and po.activa
    where a.user_id = (select auth.uid())
  );
$$;

-- Código de invitación aleatorio de 8 caracteres, sin letras ni números que se confundan.
create function privado.nuevo_codigo() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  semilla bytea := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'));
  r text := '';
begin
  for i in 0..7 loop
    r := r || substr(alfabeto, (get_byte(semilla, i) % length(alfabeto)) + 1, 1);
  end loop;
  return substr(r, 1, 4) || '-' || substr(r, 5, 4);
end;
$$;

-- Huella del código (se compara la huella, nunca se guarda el código).
create function privado.huella_codigo(p_codigo text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
$$;

grant execute on function privado.es_admin(), privado.es_consejo(), privado.perfil_en(smallint),
  privado.mis_perfiles(), privado.es_propietario_de(smallint), privado.autorizacion_vigente()
  to authenticated;

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------

-- Mi hogar: quien no es administración no puede validar sus propios registros
-- ni cambiarlos de casa o de dueño. Todo cambio vuelve a quedar pendiente.
create function privado.control_registro_hogar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'vehiculos' then
    if new.placa is not null then
      new.placa := upper(regexp_replace(new.placa, '[^A-Za-z0-9]', '', 'g'));
    end if;
  end if;

  if privado.es_admin() then
    if tg_op = 'INSERT' or new.estado is distinct from old.estado then
      new.revisado_en := case when new.estado = 'pendiente' then null else now() end;
      new.revisado_por := case when new.estado = 'pendiente' then null else auth.uid() end;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.perfil_id is distinct from privado.perfil_en(new.unidad_id) then
      raise exception 'Solo puede registrar datos de su propia casa.';
    end if;
  else
    new.unidad_id := old.unidad_id;
    new.perfil_id := old.perfil_id;
    new.creado_en := old.creado_en;
  end if;
  new.estado := 'pendiente';
  new.motivo_rechazo := null;
  new.revisado_en := null;
  new.revisado_por := null;
  return new;
end;
$$;

create trigger control_habitantes before insert or update on public.habitantes
  for each row execute function privado.control_registro_hogar();
create trigger control_mascotas before insert or update on public.mascotas
  for each row execute function privado.control_registro_hogar();
create trigger control_vehiculos before insert or update on public.vehiculos
  for each row execute function privado.control_registro_hogar();

-- Contacto: fecha de actualización automática.
create function privado.contacto_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger contacto_actualizado before insert or update on public.contactos
  for each row execute function privado.contacto_actualizado();

-- Auditoría de cambios.
create function privado.auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.auditoria (user_id, tabla, registro_id, accion, antes, despues)
  values (auth.uid(), tg_table_name,
          coalesce(despues ->> 'id', antes ->> 'id', despues ->> 'perfil_id', antes ->> 'perfil_id'),
          tg_op, antes - 'codigo_hash', despues - 'codigo_hash');
  return coalesce(new, old);
end;
$$;

create trigger auditar_perfiles after insert or update or delete on public.perfiles
  for each row execute function privado.auditar();
create trigger auditar_invitaciones after insert or update or delete on public.invitaciones
  for each row execute function privado.auditar();
create trigger auditar_contactos after insert or update or delete on public.contactos
  for each row execute function privado.auditar();
create trigger auditar_habitantes after insert or update or delete on public.habitantes
  for each row execute function privado.auditar();
create trigger auditar_mascotas after insert or update or delete on public.mascotas
  for each row execute function privado.auditar();
create trigger auditar_vehiculos after insert or update or delete on public.vehiculos
  for each row execute function privado.auditar();

-- ---------------------------------------------------------------------
-- Row Level Security: activado en TODAS las tablas
-- ---------------------------------------------------------------------
alter table public.unidades enable row level security;
alter table public.politicas enable row level security;
alter table public.autorizaciones_datos enable row level security;
alter table public.perfiles enable row level security;
alter table public.invitaciones enable row level security;
alter table public.intentos_codigo enable row level security;
alter table public.contactos enable row level security;
alter table public.habitantes enable row level security;
alter table public.mascotas enable row level security;
alter table public.vehiculos enable row level security;
alter table public.auditoria enable row level security;

-- Casas y política: lectura pública (no contienen datos personales).
create policy "casas visibles" on public.unidades for select to authenticated using (true);
create policy "politica visible" on public.politicas for select to anon, authenticated using (true);

-- Autorizaciones: cada quien ve las suyas; la administración, todas. Solo se crean por función.
create policy "ver mis autorizaciones" on public.autorizaciones_datos for select to authenticated
  using (user_id = (select auth.uid()) or (select privado.es_admin()));

-- Perfiles: el propio; el propietario ve la cuenta del arrendatario de su casa; la administración, todos.
create policy "ver perfiles" on public.perfiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select privado.es_admin())
    or (rol = 'arrendatario' and privado.es_propietario_de(unidad_id))
  );
-- Cada quien solo puede cambiar su nombre y confirmar sus datos (ver permisos por columna abajo).
create policy "actualizar mi perfil" on public.perfiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Invitaciones: la administración; el propietario ve la del arrendatario de su casa.
create policy "ver invitaciones" on public.invitaciones for select to authenticated
  using ((select privado.es_admin()) or (rol = 'arrendatario' and privado.es_propietario_de(unidad_id)));

-- intentos_codigo y auditoria (escritura): sin políticas → nadie accede por la API.
create policy "ver auditoria" on public.auditoria for select to authenticated
  using ((select privado.es_admin()));

-- Contactos: solo el dueño del contacto y la administración.
create policy "ver contacto" on public.contactos for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "crear contacto" on public.contactos for insert to authenticated
  with check (perfil_id in (select privado.mis_perfiles()));
create policy "cambiar contacto" on public.contactos for update to authenticated
  using (perfil_id in (select privado.mis_perfiles()))
  with check (perfil_id in (select privado.mis_perfiles()));

-- Habitantes, mascotas y vehículos: el que los registró y la administración.
create policy "ver habitantes" on public.habitantes for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "crear habitantes" on public.habitantes for insert to authenticated
  with check (perfil_id in (select privado.mis_perfiles()));
create policy "cambiar habitantes" on public.habitantes for update to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()))
  with check (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "retirar habitantes" on public.habitantes for delete to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));

create policy "ver mascotas" on public.mascotas for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "crear mascotas" on public.mascotas for insert to authenticated
  with check (perfil_id in (select privado.mis_perfiles()));
create policy "cambiar mascotas" on public.mascotas for update to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()))
  with check (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "retirar mascotas" on public.mascotas for delete to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));

create policy "ver vehiculos" on public.vehiculos for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "crear vehiculos" on public.vehiculos for insert to authenticated
  with check (perfil_id in (select privado.mis_perfiles()));
create policy "cambiar vehiculos" on public.vehiculos for update to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()))
  with check (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "retirar vehiculos" on public.vehiculos for delete to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));

-- Permisos de tabla: además de RLS, se quita lo que nadie debe hacer por la API.
revoke all on public.autorizaciones_datos, public.perfiles, public.invitaciones,
  public.intentos_codigo, public.auditoria from anon, authenticated;
revoke all on public.unidades, public.politicas, public.contactos, public.habitantes,
  public.mascotas, public.vehiculos from anon;
revoke insert, update, delete on public.unidades, public.politicas from authenticated;
grant select on public.politicas to anon;
grant select on public.autorizaciones_datos, public.perfiles, public.invitaciones, public.auditoria to authenticated;
grant update (nombre, datos_confirmados_en) on public.perfiles to authenticated;

-- ---------------------------------------------------------------------
-- Funciones que llama el sitio (API)
-- Todas verifican quién llama. Responden {ok, mensaje} para mostrar al usuario.
-- ---------------------------------------------------------------------

-- Estado de la sesión: autorización, cuentas, invitaciones pendientes y cargos.
create function public.mi_estado() returns jsonb
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
      where p.user_id = auth.uid() and p.estado in ('pendiente', 'activo', 'rechazado')), '[]'::jsonb),
    'invitacion_arrendatario', (
      select jsonb_build_object('unidad_id', i.unidad_id, 'contrato_hasta', i.contrato_hasta)
      from public.invitaciones i
      where i.rol = 'arrendatario' and lower(i.correo) = lower(auth.jwt() ->> 'email')
        and i.usada_en is null and i.anulada_en is null and i.vence_el > now()
      order by i.creado_en desc limit 1)
  );
$$;

-- Aceptar la política vigente (queda registrada con fecha, hora y versión).
create function public.aceptar_politica(p_version text, p_navegador text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Debe ingresar primero.');
  end if;
  if not exists (select 1 from public.politicas where version = p_version and activa) then
    return jsonb_build_object('ok', false, 'mensaje', 'La versión de la política no está vigente. Recargue la página.');
  end if;
  insert into public.autorizaciones_datos (user_id, correo, politica_version, navegador)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', ''), p_version, left(p_navegador, 300));
  return jsonb_build_object('ok', true, 'mensaje', 'Autorización registrada.');
end;
$$;

-- El propietario registra su cuenta con el código impreso de su casa.
create function public.canjear_codigo(p_codigo text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitaciones;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Debe ingresar primero.');
  end if;
  if not privado.autorizacion_vigente() then
    return jsonb_build_object('ok', false, 'mensaje', 'Primero debe aceptar la política de tratamiento de datos.');
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba su nombre completo.');
  end if;
  if (select count(*) from public.intentos_codigo
      where user_id = auth.uid() and en > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'mensaje', 'Demasiados intentos. Espere una hora o comuníquese con la administración.');
  end if;

  select * into inv from public.invitaciones
  where rol = 'propietario' and codigo_hash = privado.huella_codigo(p_codigo)
    and usada_en is null and anulada_en is null and vence_el > now()
  limit 1;

  if inv.id is null then
    insert into public.intentos_codigo (user_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'mensaje', 'El código no es válido o ya venció. Revíselo o pida uno nuevo a la administración.');
  end if;
  if exists (select 1 from public.perfiles where unidad_id = inv.unidad_id and rol = 'propietario'
             and estado in ('pendiente', 'activo')) then
    return jsonb_build_object('ok', false, 'mensaje', 'Esta casa ya tiene una cuenta de propietario. Comuníquese con la administración.');
  end if;
  if exists (select 1 from public.perfiles where user_id = auth.uid() and unidad_id = inv.unidad_id
             and estado in ('pendiente', 'activo')) then
    return jsonb_build_object('ok', false, 'mensaje', 'Usted ya tiene una cuenta en esta casa.');
  end if;

  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo)
  values (auth.uid(), inv.unidad_id, 'propietario', 'pendiente', btrim(p_nombre), coalesce(auth.jwt() ->> 'email', ''));
  update public.invitaciones set usada_en = now(), usada_por = auth.uid() where id = inv.id;

  return jsonb_build_object('ok', true, 'mensaje',
    'Registro recibido para la Casa ' || inv.unidad_id || '. La administración lo revisará y le avisará.');
end;
$$;

-- Lógica común para dar acceso a un arrendatario (por el propietario o por la administración).
create function privado.crear_invitacion_arrendatario(
  p_unidad smallint, p_correo text, p_contrato_hasta date, p_puede_ver_cuenta boolean, p_autorizado_por uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  correo_limpio text := lower(btrim(coalesce(p_correo, '')));
begin
  if correo_limpio !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba un correo válido.');
  end if;
  if p_contrato_hasta is not null and p_contrato_hasta < current_date then
    return jsonb_build_object('ok', false, 'mensaje', 'La fecha de fin del contrato ya pasó.');
  end if;
  if exists (select 1 from public.perfiles where unidad_id = p_unidad and rol = 'arrendatario'
             and estado in ('pendiente', 'activo') and (vence_el is null or vence_el >= current_date)) then
    return jsonb_build_object('ok', false, 'mensaje', 'La casa ya tiene un arrendatario con acceso. Retírelo primero.');
  end if;
  if exists (select 1 from public.perfiles where unidad_id = p_unidad and lower(correo) = correo_limpio
             and estado in ('pendiente', 'activo')) then
    return jsonb_build_object('ok', false, 'mensaje', 'Ese correo ya tiene una cuenta en esta casa.');
  end if;

  update public.invitaciones set anulada_en = now()
  where unidad_id = p_unidad and rol = 'arrendatario' and usada_en is null and anulada_en is null;

  insert into public.invitaciones (unidad_id, rol, correo, contrato_hasta, puede_ver_cuenta, autorizado_por, vence_el, creado_por)
  values (p_unidad, 'arrendatario', correo_limpio, p_contrato_hasta, coalesce(p_puede_ver_cuenta, false),
          p_autorizado_por, now() + interval '30 days', auth.uid());

  return jsonb_build_object('ok', true, 'mensaje',
    'Listo. Pídale al arrendatario que ingrese al sitio con el correo ' || correo_limpio || ' dentro de los próximos 30 días.');
end;
$$;

-- El propietario autoriza a su arrendatario.
create function public.autorizar_arrendatario(
  p_unidad smallint, p_correo text, p_contrato_hasta date default null, p_puede_ver_cuenta boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_propietario_de(p_unidad) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el propietario de la casa puede autorizar a un arrendatario.');
  end if;
  return privado.crear_invitacion_arrendatario(p_unidad, p_correo, p_contrato_hasta, p_puede_ver_cuenta,
                                                privado.perfil_en(p_unidad));
end;
$$;

-- El arrendatario acepta la invitación que le hizo el propietario (se identifica por su correo).
create function public.aceptar_invitacion_arrendatario(p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitaciones;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Debe ingresar primero.');
  end if;
  if not privado.autorizacion_vigente() then
    return jsonb_build_object('ok', false, 'mensaje', 'Primero debe aceptar la política de tratamiento de datos.');
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba su nombre completo.');
  end if;

  select * into inv from public.invitaciones
  where rol = 'arrendatario' and lower(correo) = lower(auth.jwt() ->> 'email')
    and usada_en is null and anulada_en is null and vence_el > now()
  order by creado_en desc limit 1;
  if inv.id is null then
    return jsonb_build_object('ok', false, 'mensaje', 'No hay una invitación vigente para su correo. Pídala al propietario.');
  end if;
  if exists (select 1 from public.perfiles where unidad_id = inv.unidad_id and rol = 'arrendatario'
             and estado in ('pendiente', 'activo') and (vence_el is null or vence_el >= current_date)) then
    return jsonb_build_object('ok', false, 'mensaje', 'La casa ya tiene un arrendatario con acceso.');
  end if;

  insert into public.perfiles (user_id, unidad_id, rol, estado, nombre, correo, autorizado_por, vence_el, puede_ver_cuenta, revisado_en)
  values (auth.uid(), inv.unidad_id, 'arrendatario', 'activo', btrim(p_nombre), lower(auth.jwt() ->> 'email'),
          inv.autorizado_por, inv.contrato_hasta, inv.puede_ver_cuenta, now());
  update public.invitaciones set usada_en = now(), usada_por = auth.uid() where id = inv.id;

  return jsonb_build_object('ok', true, 'mensaje', 'Bienvenido. Ya tiene acceso como arrendatario de la Casa ' || inv.unidad_id || '.');
end;
$$;

-- El propietario (o la administración) retira el acceso del arrendatario.
create function public.retirar_arrendatario(p_unidad smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not (privado.es_propietario_de(p_unidad) or privado.es_admin()) then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo el propietario o la administración pueden retirar el acceso.');
  end if;
  update public.perfiles set estado = 'retirado', revisado_en = now(), revisado_por = auth.uid()
  where unidad_id = p_unidad and rol = 'arrendatario' and estado in ('pendiente', 'activo');
  update public.invitaciones set anulada_en = now()
  where unidad_id = p_unidad and rol = 'arrendatario' and usada_en is null and anulada_en is null;
  return jsonb_build_object('ok', true, 'mensaje', 'Acceso del arrendatario retirado.');
end;
$$;

-- Resumen de la casa para el propietario: cuántos registros hay (sin ver los datos del arrendatario).
create function public.resumen_casa(p_unidad smallint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when privado.es_propietario_de(p_unidad) or privado.es_admin() then
    jsonb_build_object(
      'habitantes', (select count(*) from public.habitantes where unidad_id = p_unidad and estado <> 'rechazado'),
      'mascotas', (select count(*) from public.mascotas where unidad_id = p_unidad and estado <> 'rechazado'),
      'vehiculos', (select count(*) from public.vehiculos where unidad_id = p_unidad and estado <> 'rechazado'))
  end;
$$;

-- Censo sin datos personales: para la administración y el consejo.
create function public.censo() returns table (
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
    (select count(*) from public.habitantes h where h.unidad_id = u.id and h.estado = 'validado'),
    (select count(*) from public.mascotas m where m.unidad_id = u.id and m.estado = 'validado'),
    (select count(*) from public.vehiculos v where v.unidad_id = u.id and v.estado = 'validado'),
    (select count(*) from public.habitantes h where h.unidad_id = u.id and h.estado = 'pendiente')
      + (select count(*) from public.mascotas m where m.unidad_id = u.id and m.estado = 'pendiente')
      + (select count(*) from public.vehiculos v where v.unidad_id = u.id and v.estado = 'pendiente'),
    (select max(p.datos_confirmados_en) from public.perfiles p where p.unidad_id = u.id and p.estado = 'activo')
  from public.unidades u
  where privado.es_admin() or privado.es_consejo()
  order by u.id;
$$;

-- ----- Funciones de la administración -----

-- Genera (o renueva) el código impreso de una casa. Devuelve el código UNA sola vez.
create function public.admin_generar_codigo(p_unidad smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  codigo text;
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede generar códigos.');
  end if;
  if not exists (select 1 from public.unidades where id = p_unidad) then
    return jsonb_build_object('ok', false, 'mensaje', 'La casa no existe.');
  end if;
  update public.invitaciones set anulada_en = now()
  where unidad_id = p_unidad and rol = 'propietario' and usada_en is null and anulada_en is null;
  codigo := privado.nuevo_codigo();
  insert into public.invitaciones (unidad_id, rol, codigo_hash, vence_el, creado_por)
  values (p_unidad, 'propietario', privado.huella_codigo(codigo), now() + interval '60 days', auth.uid());
  return jsonb_build_object('ok', true, 'unidad_id', p_unidad, 'codigo', codigo,
                            'vence_el', (now() + interval '60 days')::date);
end;
$$;

-- Aprueba o rechaza una cuenta pendiente.
create function public.admin_revisar_perfil(p_perfil uuid, p_aprobar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede revisar cuentas.');
  end if;
  update public.perfiles
  set estado = case when p_aprobar then 'activo'::public.estado_perfil else 'rechazado'::public.estado_perfil end,
      motivo_rechazo = case when p_aprobar then null else left(p_motivo, 300) end,
      revisado_en = now(), revisado_por = auth.uid()
  where id = p_perfil and estado = 'pendiente';
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La cuenta no está pendiente.');
  end if;
  return jsonb_build_object('ok', true, 'mensaje', case when p_aprobar then 'Cuenta aprobada.' else 'Cuenta rechazada.' end);
end;
$$;

-- Retira una cuenta (por ejemplo, el propietario vendió la casa).
create function public.admin_retirar_perfil(p_perfil uuid, p_motivo text default null) returns jsonb
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
  return jsonb_build_object('ok', true, 'mensaje', 'Cuenta retirada.');
end;
$$;

-- Da acceso a un arrendatario con autorización escrita del propietario (cuando este no usa la plataforma).
create function public.admin_autorizar_arrendatario(
  p_unidad smallint, p_correo text, p_contrato_hasta date default null, p_puede_ver_cuenta boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede hacer esto.');
  end if;
  return privado.crear_invitacion_arrendatario(p_unidad, p_correo, p_contrato_hasta, p_puede_ver_cuenta, null);
end;
$$;

-- Permisos de ejecución: nada para visitantes anónimos; solo usuarios con sesión.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema privado from public, anon;
grant execute on function public.mi_estado(), public.aceptar_politica(text, text),
  public.canjear_codigo(text, text), public.autorizar_arrendatario(smallint, text, date, boolean),
  public.aceptar_invitacion_arrendatario(text), public.retirar_arrendatario(smallint),
  public.resumen_casa(smallint), public.censo(), public.admin_generar_codigo(smallint),
  public.admin_revisar_perfil(uuid, boolean, text), public.admin_retirar_perfil(uuid, text),
  public.admin_autorizar_arrendatario(smallint, text, date, boolean)
  to authenticated;
grant execute on function privado.es_admin(), privado.es_consejo(), privado.perfil_en(smallint),
  privado.mis_perfiles(), privado.es_propietario_de(smallint), privado.autorizacion_vigente()
  to authenticated;
