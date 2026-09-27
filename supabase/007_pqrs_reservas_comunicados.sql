-- =====================================================================
-- Aragón en línea · Entrega 2b · PQRS, reservas de zonas comunes y comunicados
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 001 a 005).
--
-- Reglas que hace cumplir:
--  * RLS activado en todas las tablas nuevas.
--  * Cada PQRS la ven solo quien la radicó y la administración (el propietario y el
--    arrendatario no ven las del otro). El consejo solo ve totales.
--  * Reservas: cualquiera con cuenta activa ve qué turnos están ocupados, pero NO
--    quién los ocupa. Un turno no se puede reservar dos veces.
--  * Comunicados: el público ve los publicados; solo la administración los crea o cambia.
--  * La plataforma no cobra: las tarifas se muestran como información.
-- =====================================================================

-- Fecha en Colombia (Supabase trabaja en hora universal). Colombia está en UTC-5 todo el año
-- (sin horario de verano), por eso se usa un desplazamiento fijo.
create or replace function privado.fecha_col(p_momento timestamptz) returns date
language sql immutable set search_path = '' as $$
  select ((p_momento at time zone 'UTC') - interval '5 hours')::date;
$$;

create or replace function privado.hoy() returns date
language sql stable set search_path = '' as $$
  select privado.fecha_col(now());
$$;

-- Días hábiles (lunes a viernes) estrictamente entre dos fechas. No descuenta festivos.
create or replace function privado.dias_habiles_entre(p_desde date, p_hasta date) returns integer
language sql immutable set search_path = '' as $$
  select count(*)::integer
  from generate_series(p_desde + 1, p_hasta - 1, interval '1 day') d
  where extract(isodow from d) < 6;
$$;

revoke execute on function privado.hoy(), privado.fecha_col(timestamptz), privado.dias_habiles_entre(date, date) from public, anon;
grant execute on function privado.hoy() to authenticated;

-- =====================================================================
-- PQRS
-- =====================================================================
create type public.tipo_pqrs as enum ('Petición', 'Queja', 'Reclamo', 'Sugerencia');
create type public.estado_pqrs as enum ('radicada', 'en_tramite', 'respondida');
create sequence public.pqrs_consecutivo;

create table public.pqrs (
  id uuid primary key default gen_random_uuid(),
  radicado text not null unique,
  unidad_id smallint not null references public.unidades (id),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  tipo public.tipo_pqrs not null,
  asunto text not null check (length(btrim(asunto)) between 3 and 120),
  descripcion text not null check (length(btrim(descripcion)) between 5 and 3000),
  estado public.estado_pqrs not null default 'radicada',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.pqrs_mensajes (
  id bigint generated always as identity primary key,
  pqrs_id uuid not null references public.pqrs (id) on delete cascade,
  autor text not null check (autor in ('residente', 'administracion')),
  autor_user uuid references auth.users (id) on delete set null,
  texto text not null check (length(btrim(texto)) between 1 and 3000),
  creado_en timestamptz not null default now()
);

alter table public.pqrs enable row level security;
alter table public.pqrs_mensajes enable row level security;

create policy "ver pqrs" on public.pqrs for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));
create policy "ver mensajes pqrs" on public.pqrs_mensajes for select to authenticated
  using (exists (select 1 from public.pqrs p where p.id = pqrs_id
                 and (p.perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()))));

revoke all on public.pqrs, public.pqrs_mensajes from anon, authenticated;
revoke all on sequence public.pqrs_consecutivo from anon, authenticated;
grant select on public.pqrs, public.pqrs_mensajes to authenticated;

-- Radicar una PQRS (propietario o arrendatario con cuenta activa en la casa).
create function public.radicar_pqrs(p_unidad smallint, p_tipo text, p_asunto text, p_descripcion text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  perfil uuid := privado.perfil_en(p_unidad);
  rad text;
begin
  if perfil is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo puede radicar solicitudes de su propia casa.');
  end if;
  if p_tipo is null or p_tipo not in ('Petición', 'Queja', 'Reclamo', 'Sugerencia') then
    return jsonb_build_object('ok', false, 'mensaje', 'Elija el tipo de solicitud.');
  end if;
  if length(btrim(coalesce(p_asunto, ''))) < 3 then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba el asunto.');
  end if;
  if length(btrim(coalesce(p_descripcion, ''))) < 5 then
    return jsonb_build_object('ok', false, 'mensaje', 'Describa su solicitud.');
  end if;
  rad := 'PQ-' || to_char(privado.hoy(), 'YYYY') || '-' || lpad(nextval('public.pqrs_consecutivo')::text, 4, '0');
  insert into public.pqrs (radicado, unidad_id, perfil_id, tipo, asunto, descripcion)
  values (rad, p_unidad, perfil, p_tipo::public.tipo_pqrs, btrim(p_asunto), btrim(p_descripcion));
  return jsonb_build_object('ok', true, 'radicado', rad,
    'mensaje', 'Solicitud radicada con el número ' || rad || '. La administración le responderá por este medio.');
end;
$$;

-- Escribir en una PQRS: la administración responde (queda "respondida");
-- el residente agrega información (vuelve a "en trámite").
create function public.escribir_pqrs(p_pqrs uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q public.pqrs;
  admin boolean := privado.es_admin();
begin
  select * into q from public.pqrs where id = p_pqrs;
  if q.id is null or not (admin or q.perfil_id in (select privado.mis_perfiles())) then
    return jsonb_build_object('ok', false, 'mensaje', 'No tiene acceso a esta solicitud.');
  end if;
  if length(btrim(coalesce(p_texto, ''))) < 1 then
    return jsonb_build_object('ok', false, 'mensaje', 'Escriba el mensaje.');
  end if;
  insert into public.pqrs_mensajes (pqrs_id, autor, autor_user, texto)
  values (q.id, case when admin then 'administracion' else 'residente' end, auth.uid(), btrim(p_texto));
  update public.pqrs
  set estado = case when admin then 'respondida'::public.estado_pqrs else 'en_tramite'::public.estado_pqrs end,
      actualizado_en = now()
  where id = q.id;
  return jsonb_build_object('ok', true, 'mensaje', case when admin then 'Respuesta enviada.' else 'Mensaje agregado.' end);
end;
$$;

-- La administración marca una PQRS "en trámite".
create function public.admin_estado_pqrs(p_pqrs uuid, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede cambiar el estado.');
  end if;
  if p_estado not in ('radicada', 'en_tramite', 'respondida') then
    return jsonb_build_object('ok', false, 'mensaje', 'Estado no válido.');
  end if;
  update public.pqrs set estado = p_estado::public.estado_pqrs, actualizado_en = now() where id = p_pqrs;
  return jsonb_build_object('ok', found, 'mensaje', case when found then 'Estado actualizado.' else 'No se encontró la solicitud.' end);
end;
$$;

-- Totales para el consejo y la administración (sin contenido ni nombres).
create function public.resumen_pqrs() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when privado.es_admin() or privado.es_consejo() then jsonb_build_object(
    'total', (select count(*) from public.pqrs),
    'radicadas', (select count(*) from public.pqrs where estado = 'radicada'),
    'en_tramite', (select count(*) from public.pqrs where estado = 'en_tramite'),
    'respondidas', (select count(*) from public.pqrs where estado = 'respondida'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from public.pqrs group by tipo) t), '{}'::jsonb),
    'abiertas_mas_15_dias_habiles', (select count(*) from public.pqrs
       where estado <> 'respondida' and privado.dias_habiles_entre(privado.fecha_col(creado_en), privado.hoy() + 1) > 15)
  ) end;
$$;

create trigger auditar_pqrs after insert or update or delete on public.pqrs
  for each row execute function privado.auditar();

-- =====================================================================
-- Zonas reservables y reservas
-- =====================================================================
create table public.zonas_reservables (
  id text primary key,
  nombre text not null,
  turnos jsonb not null,              -- [{"id":"dia","nombre":"Turno de día","horario":"...","tarifa":"..."}]
  anticipacion_dias_habiles integer not null default 0,
  max_dias_adelante integer not null default 90,
  capacidad integer,
  reglas text,
  activa boolean not null default true
);

create type public.estado_reserva as enum ('pendiente', 'aprobada', 'rechazada', 'cancelada');

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  zona_id text not null references public.zonas_reservables (id),
  fecha date not null,
  turno text not null,
  unidad_id smallint not null references public.unidades (id),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  invitados integer not null check (invitados between 1 and 500),
  observaciones text check (length(observaciones) <= 500),
  estado public.estado_reserva not null default 'pendiente',
  motivo text check (length(motivo) <= 300),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id)
);
-- Un turno solo puede tener una solicitud vigente (pendiente o aprobada): se asigna por orden de solicitud.
create unique index reservas_turno_unico on public.reservas (zona_id, fecha, turno)
  where estado in ('pendiente', 'aprobada');

alter table public.zonas_reservables enable row level security;
alter table public.reservas enable row level security;

create policy "ver zonas reservables" on public.zonas_reservables for select to authenticated using (true);
create policy "ver reservas" on public.reservas for select to authenticated
  using (perfil_id in (select privado.mis_perfiles()) or (select privado.es_admin()));

revoke all on public.zonas_reservables, public.reservas from anon, authenticated;
grant select on public.zonas_reservables, public.reservas to authenticated;

-- Turnos ocupados en un rango de fechas, SIN decir quién los ocupa.
create function public.disponibilidad(p_zona text, p_desde date, p_hasta date)
returns table (fecha date, turno text, estado text)
language sql stable security definer set search_path = '' as $$
  select r.fecha, r.turno, r.estado::text
  from public.reservas r
  where r.zona_id = p_zona and r.fecha between p_desde and least(p_hasta, p_desde + 120)
    and r.estado in ('pendiente', 'aprobada')
    and (privado.es_admin() or exists (select 1 from privado.mis_perfiles()))
  order by r.fecha, r.turno;
$$;

create function public.solicitar_reserva(
  p_unidad smallint, p_zona text, p_fecha date, p_turno text, p_invitados integer, p_observaciones text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  perfil uuid := privado.perfil_en(p_unidad);
  z public.zonas_reservables;
  hoy date := privado.hoy();
begin
  if perfil is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo puede reservar a nombre de su propia casa.');
  end if;
  select * into z from public.zonas_reservables where id = p_zona and activa;
  if z.id is null then
    return jsonb_build_object('ok', false, 'mensaje', 'Esa zona no se puede reservar.');
  end if;
  if not exists (select 1 from jsonb_array_elements(z.turnos) t where t ->> 'id' = p_turno) then
    return jsonb_build_object('ok', false, 'mensaje', 'Elija un turno válido.');
  end if;
  if p_fecha is null or p_fecha <= hoy then
    return jsonb_build_object('ok', false, 'mensaje', 'Elija una fecha futura.');
  end if;
  if privado.dias_habiles_entre(hoy, p_fecha) < z.anticipacion_dias_habiles then
    return jsonb_build_object('ok', false, 'mensaje',
      z.nombre || ' se reserva con mínimo ' || z.anticipacion_dias_habiles || ' días hábiles de anticipación.');
  end if;
  if p_fecha > hoy + z.max_dias_adelante then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo se puede reservar hasta ' || z.max_dias_adelante || ' días adelante.');
  end if;
  if coalesce(p_invitados, 0) < 1 or (z.capacidad is not null and p_invitados > z.capacidad) then
    return jsonb_build_object('ok', false, 'mensaje',
      'Indique el número de personas' || case when z.capacidad is not null then ' (máximo ' || z.capacidad || ').' else '.' end);
  end if;
  begin
    insert into public.reservas (zona_id, fecha, turno, unidad_id, perfil_id, invitados, observaciones)
    values (p_zona, p_fecha, p_turno, p_unidad, perfil, p_invitados, nullif(btrim(coalesce(p_observaciones, '')), ''));
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'mensaje', 'Ese turno ya fue solicitado por otra casa. Elija otra fecha o turno.');
  end;
  return jsonb_build_object('ok', true, 'mensaje',
    'Solicitud registrada. Queda pendiente hasta que la administración la apruebe.');
end;
$$;

create function public.cancelar_reserva(p_reserva uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.reservas set estado = 'cancelada', revisado_en = now(), revisado_por = auth.uid()
  where id = p_reserva and perfil_id in (select privado.mis_perfiles())
    and estado in ('pendiente', 'aprobada') and fecha >= privado.hoy();
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'No se puede cancelar esta reserva.');
  end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Reserva cancelada.');
end;
$$;

create function public.admin_revisar_reserva(p_reserva uuid, p_aprobar boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then
    return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración puede revisar reservas.');
  end if;
  update public.reservas
  set estado = case when p_aprobar then 'aprobada'::public.estado_reserva else 'rechazada'::public.estado_reserva end,
      motivo = left(p_motivo, 300), revisado_en = now(), revisado_por = auth.uid()
  where id = p_reserva and estado in ('pendiente', 'aprobada');
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'La reserva no está pendiente.');
  end if;
  return jsonb_build_object('ok', true, 'mensaje', case when p_aprobar then 'Reserva aprobada.' else 'Reserva rechazada.' end);
end;
$$;

create trigger auditar_reservas after insert or update or delete on public.reservas
  for each row execute function privado.auditar();

-- Zonas según el Manual de convivencia (2021, arts. 33 y 57) y el Reglamento (cap. XIV-VI).
-- La anticipación de la zona BBQ no está en los documentos: se deja en 2 días hábiles (ajustable).
insert into public.zonas_reservables (id, nombre, turnos, anticipacion_dias_habiles, max_dias_adelante, capacidad, reglas) values
('salon', 'Salón social',
 '[{"id":"dia","nombre":"Turno de día","horario":"10:00 a. m. a 6:00 p. m.","tarifa":"2,7 SMDLV"},
   {"id":"noche","nombre":"Turno de noche","horario":"6:00 p. m. a 12:00 a. m.","tarifa":"3,3 SMDLV"}]',
 10, 120, 50,
 'Se paga el alquiler y se firma el inventario al recibir. Lista de invitados en portería. Entregar limpio. No fiestas empresariales.'),
('bbq', 'Zona BBQ',
 '[{"id":"unico","nombre":"Turno único","horario":"10:00 a. m. a 12:00 a. m.","tarifa":"1 SMDLV"}]',
 2, 90, null,
 'Entregar limpio (si no, multa igual al alquiler). No se alquila a menores de edad. Música a volumen moderado.');

-- =====================================================================
-- Comunicados (se publican desde el panel)
-- =====================================================================
create table public.comunicados (
  id bigint generated always as identity primary key,
  fecha date not null default (((now() at time zone 'UTC') - interval '5 hours')::date),
  categoria text not null check (categoria in ('Mantenimiento', 'Asamblea', 'Convivencia', 'Seguridad', 'Financiero', 'Administrativo', 'Eventos')),
  titulo text not null check (length(btrim(titulo)) between 3 and 150),
  texto text not null check (length(btrim(texto)) between 3 and 5000),
  adjunto text check (adjunto ~ '^documentos/[a-z0-9][a-z0-9._-]*\.pdf$'),
  publicado boolean not null default true,
  creado_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.comunicados enable row level security;

-- Dos reglas separadas: el visitante anónimo no puede consultar funciones del esquema privado.
create policy "publico ve comunicados publicados" on public.comunicados for select to anon
  using (publicado);
create policy "usuarios ven comunicados" on public.comunicados for select to authenticated
  using (publicado or (select privado.es_admin()));
create policy "crear comunicados" on public.comunicados for insert to authenticated with check ((select privado.es_admin()));
create policy "cambiar comunicados" on public.comunicados for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "borrar comunicados" on public.comunicados for delete to authenticated using ((select privado.es_admin()));

revoke all on public.comunicados from anon, authenticated;
grant select on public.comunicados to anon, authenticated;
grant insert, update, delete on public.comunicados to authenticated;

create trigger auditar_comunicados after insert or update or delete on public.comunicados
  for each row execute function privado.auditar();

-- Comunicados que ya estaban publicados en el sitio (antes en web/datos/comunicados.json).
insert into public.comunicados (fecha, categoria, titulo, texto, adjunto, creado_por) values
('2026-07-26', 'Financiero', 'Circular 03-2026: Parqueaderos internos, cuota de administración e intereses de mora',
 E'Parqueaderos internos junto al salón social: desde el 27 de julio de 2026 se retoma el cobro, $8.000 por día.\nCuota de administración: $550.000 si paga dentro de los 10 primeros días del mes (pronto pago). Del día 11 al último día del mes, $600.000.\nIntereses de mora: la cuota no pagada dentro del mes genera intereses desde el primer día del mes siguiente, según la Ley 675 de 2001.',
 'documentos/circular-03-2026.pdf', null),
('2026-08-24', 'Administrativo', 'Circular 04-2026: Certificado de libertad y tradición',
 E'Por solicitud del Consejo de Administración, todos los propietarios deben entregar el certificado de libertad y tradición actualizado de su casa.\nPlazo: 31 de agosto de 2026, al correo oficial del conjunto indicado en la circular.\nSi no se entrega a tiempo, el costo de obtener el certificado se incluirá en la cuenta de cobro del mes siguiente.',
 'documentos/circular-04-2026.pdf', null);

-- =====================================================================
-- Permisos de las funciones nuevas
-- =====================================================================
revoke execute on function public.radicar_pqrs(smallint, text, text, text), public.escribir_pqrs(uuid, text),
  public.admin_estado_pqrs(uuid, text), public.resumen_pqrs(), public.disponibilidad(text, date, date),
  public.solicitar_reserva(smallint, text, date, text, integer, text), public.cancelar_reserva(uuid),
  public.admin_revisar_reserva(uuid, boolean, text) from public, anon;
grant execute on function public.radicar_pqrs(smallint, text, text, text), public.escribir_pqrs(uuid, text),
  public.admin_estado_pqrs(uuid, text), public.resumen_pqrs(), public.disponibilidad(text, date, date),
  public.solicitar_reserva(smallint, text, date, text, integer, text), public.cancelar_reserva(uuid),
  public.admin_revisar_reserva(uuid, boolean, text) to authenticated;
