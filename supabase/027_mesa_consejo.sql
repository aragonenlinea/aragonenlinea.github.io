-- =====================================================================
-- Aragón en línea · Fase 3d · Mesa del Consejo
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 026).
--
-- RPH arts. 57-58, 60, 63, 67, 71-79. Solo lo ven el CONSEJO (principales y suplentes) y la ADMINISTRACIÓN.
--  * Integrantes: cargo de cada cuenta del consejo (lo asigna la administración).
--  * Reuniones: convocatoria, documentos, asistencia, acta. Las organizan administración y consejo.
--  * Informe mensual del administrador: lo prepara y presenta la administración.
--  * Solicitudes de autorización: las presenta la administración.
--  * Compromisos (de administración y consejo) y calendario de obligaciones (lo mantiene la administración).
-- DECISIONES (decidido el 2026-10-12): aprobar o improbar el informe, decidir solicitudes y aprobar actas
-- solo lo registran los CONSEJEROS, mediante funciones que guardan quién y cuándo. La administración
-- no puede escribir esas columnas (permisos por columna). Nada se borra: se cancela o se retira.
-- =====================================================================

-- ---------- Integrantes ----------
alter table public.perfiles add column if not exists cargo_consejo text
  check (cargo_consejo in ('presidente', 'vicepresidente', 'secretario', 'principal', 'suplente'));

create or replace function public.consejo_integrantes() returns table (perfil_id uuid, user_id uuid, nombre text, cargo text, correo text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.user_id, p.nombre, p.cargo_consejo, p.correo from public.perfiles p
  where p.rol = 'consejo' and p.estado = 'activo' and (privado.es_admin() or privado.es_consejo())
  order by array_position(array['presidente', 'vicepresidente', 'secretario', 'principal', 'suplente'], p.cargo_consejo) nulls last, p.nombre;
$$;

create or replace function public.admin_cargo_consejo(p_perfil uuid, p_cargo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_admin() then return jsonb_build_object('ok', false, 'mensaje', 'Solo la administración asigna cargos.'); end if;
  if p_cargo is not null and p_cargo not in ('presidente', 'vicepresidente', 'secretario', 'principal', 'suplente') then
    return jsonb_build_object('ok', false, 'mensaje', 'Cargo no válido.');
  end if;
  if p_cargo in ('presidente', 'vicepresidente', 'secretario') and exists (
      select 1 from public.perfiles where rol = 'consejo' and estado = 'activo' and cargo_consejo = p_cargo and id <> p_perfil) then
    return jsonb_build_object('ok', false, 'mensaje', 'Ya hay otra persona con ese cargo. Cámbiele primero el cargo.');
  end if;
  update public.perfiles set cargo_consejo = p_cargo where id = p_perfil and rol = 'consejo' and estado = 'activo';
  if not found then return jsonb_build_object('ok', false, 'mensaje', 'No es una cuenta activa del consejo.'); end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Cargo guardado.');
end;
$$;

-- ¿El perfil es una cuenta activa del consejo? (para la asistencia; los consejeros no leen la tabla perfiles)
create or replace function privado.es_perfil_consejo(p_perfil uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = p_perfil and rol = 'consejo' and estado = 'activo');
$$;
revoke execute on function privado.es_perfil_consejo(uuid) from public, anon;
grant execute on function privado.es_perfil_consejo(uuid) to authenticated;

-- ---------- Reuniones ----------
create table public.reuniones (
  id bigint generated always as identity primary key,
  tipo text not null default 'ordinaria' check (tipo in ('ordinaria', 'extraordinaria', 'instalación')),
  fecha date not null,
  hora time,
  lugar text check (length(lugar) <= 120),
  orden_dia text check (length(orden_dia) <= 4000),
  estado text not null default 'programada' check (estado in ('programada', 'convocada', 'realizada', 'cancelada')),
  convocada_en timestamptz,
  acta_documento_id bigint references public.documentos_privados (id) on delete set null,
  acta_estado text not null default 'sin acta' check (acta_estado in ('sin acta', 'borrador', 'aprobada')),
  acta_aprobada_por uuid references auth.users (id) on delete set null,
  acta_aprobada_en timestamptz,
  notas text check (length(notas) <= 2000),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now()
);

create table public.reunion_documentos (
  reunion_id bigint not null references public.reuniones (id),
  documento_id bigint not null references public.documentos_privados (id),
  primary key (reunion_id, documento_id)
);

create table public.asistencia (
  reunion_id bigint not null references public.reuniones (id),
  perfil_id uuid not null references public.perfiles (id),
  estado text not null check (estado in ('presente', 'ausente', 'excusado')),
  primary key (reunion_id, perfil_id)
);

-- ---------- Informe mensual del administrador ----------
create table public.informes_administrador (
  id bigint generated always as identity primary key,
  anio smallint not null check (anio between 2020 and 2100),
  mes smallint not null check (mes between 1 and 12),
  balance_documento_id bigint references public.documentos_privados (id) on delete set null,
  pagos_documento_id bigint references public.documentos_privados (id) on delete set null,
  cartera_gestion text check (length(cartera_gestion) <= 3000),
  mantenimiento text check (length(mantenimiento) <= 3000),
  otros text check (length(otros) <= 3000),
  estado text not null default 'borrador' check (estado in ('borrador', 'presentado', 'aprobado', 'improbado')),
  presentado_en timestamptz,
  decision_por uuid references auth.users (id) on delete set null,
  decision_en timestamptz,
  observaciones_consejo text check (length(observaciones_consejo) <= 3000),
  reunion_id bigint references public.reuniones (id),
  creado_en timestamptz not null default now(),
  unique (anio, mes)
);

-- ---------- Solicitudes de autorización ----------
create table public.solicitudes_autorizacion (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('Contrato mayor a 2 SMMLV', 'Acto extraordinario o urgente', 'Contratación de personal',
                                     'Apoderado o abogado', 'Acción judicial', 'Otra')),
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  descripcion text check (length(descripcion) <= 4000),
  valor bigint check (valor >= 0),
  proveedor_id bigint references public.proveedores (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'negada', 'aplazada', 'retirada')),
  decision_por uuid references auth.users (id) on delete set null,
  decision_en timestamptz,
  decision_observacion text check (length(decision_observacion) <= 2000),
  reunion_id bigint references public.reuniones (id),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now()
);

create table public.solicitud_documentos (
  solicitud_id bigint not null references public.solicitudes_autorizacion (id),
  documento_id bigint not null references public.documentos_privados (id),
  primary key (solicitud_id, documento_id)
);

-- ---------- Compromisos y obligaciones ----------
create table public.compromisos (
  id bigint generated always as identity primary key,
  reunion_id bigint references public.reuniones (id),
  descripcion text not null check (length(btrim(descripcion)) between 3 and 500),
  responsable text not null check (length(btrim(responsable)) between 2 and 80),
  fecha_limite date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en curso', 'cumplido', 'cancelado')),
  avance text check (length(avance) <= 2000),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now()
);

create table public.obligaciones (
  id bigint generated always as identity primary key,
  nombre text not null check (length(btrim(nombre)) between 3 and 200),
  fuente text check (length(fuente) <= 200),                  -- norma que la exige
  periodicidad text not null default 'anual' check (periodicidad in ('mensual', 'trimestral', 'anual', 'única', 'cuando ocurra')),
  proxima_fecha date,
  responsable text not null default 'Administración' check (length(responsable) <= 80),
  notas text check (length(notas) <= 1000),
  ultima_cumplida date,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.reuniones enable row level security;
alter table public.reunion_documentos enable row level security;
alter table public.asistencia enable row level security;
alter table public.informes_administrador enable row level security;
alter table public.solicitudes_autorizacion enable row level security;
alter table public.solicitud_documentos enable row level security;
alter table public.compromisos enable row level security;
alter table public.obligaciones enable row level security;

-- Lectura: consejo y administración, en todas.
create policy "mesa: ver reuniones" on public.reuniones for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver documentos de reunión" on public.reunion_documentos for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver asistencia" on public.asistencia for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver informes" on public.informes_administrador for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver solicitudes" on public.solicitudes_autorizacion for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver soportes" on public.solicitud_documentos for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver compromisos" on public.compromisos for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: ver obligaciones" on public.obligaciones for select to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));

-- Reuniones, documentos de reunión, asistencia y compromisos: los organizan administración y consejo.
create policy "mesa: crear reuniones" on public.reuniones for insert to authenticated with check ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: cambiar reuniones" on public.reuniones for update to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo())) with check ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: agregar documentos de reunión" on public.reunion_documentos for insert to authenticated with check ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: quitar documentos de reunión" on public.reunion_documentos for delete to authenticated using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: registrar asistencia" on public.asistencia for insert to authenticated
  with check (((select privado.es_admin()) or (select privado.es_consejo())) and privado.es_perfil_consejo(perfil_id));
create policy "mesa: cambiar asistencia" on public.asistencia for update to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()))
  with check (((select privado.es_admin()) or (select privado.es_consejo())) and privado.es_perfil_consejo(perfil_id));
create policy "mesa: crear compromisos" on public.compromisos for insert to authenticated with check ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "mesa: cambiar compromisos" on public.compromisos for update to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo())) with check ((select privado.es_admin()) or (select privado.es_consejo()));

-- Informe, solicitudes y obligaciones: los escribe la administración, y solo mientras no haya decisión.
create policy "mesa: crear informe" on public.informes_administrador for insert to authenticated with check ((select privado.es_admin()) and estado in ('borrador', 'presentado'));
create policy "mesa: cambiar informe" on public.informes_administrador for update to authenticated
  using ((select privado.es_admin()) and estado in ('borrador', 'presentado')) with check ((select privado.es_admin()) and estado in ('borrador', 'presentado'));
create policy "mesa: crear solicitud" on public.solicitudes_autorizacion for insert to authenticated with check ((select privado.es_admin()) and estado = 'pendiente');
-- Una solicitud aplazada la puede completar la administración y vuelve a quedar pendiente para el consejo.
create policy "mesa: cambiar solicitud" on public.solicitudes_autorizacion for update to authenticated
  using ((select privado.es_admin()) and estado in ('pendiente', 'aplazada')) with check ((select privado.es_admin()) and estado in ('pendiente', 'retirada'));
create policy "mesa: agregar soportes" on public.solicitud_documentos for insert to authenticated with check ((select privado.es_admin()));
create policy "mesa: quitar soportes" on public.solicitud_documentos for delete to authenticated using ((select privado.es_admin()));
create policy "mesa: crear obligación" on public.obligaciones for insert to authenticated with check ((select privado.es_admin()));
create policy "mesa: cambiar obligación" on public.obligaciones for update to authenticated using ((select privado.es_admin())) with check ((select privado.es_admin()));

revoke all on public.reuniones, public.reunion_documentos, public.asistencia, public.informes_administrador,
  public.solicitudes_autorizacion, public.solicitud_documentos, public.compromisos, public.obligaciones from anon, authenticated;
grant select on public.reuniones, public.reunion_documentos, public.asistencia, public.informes_administrador,
  public.solicitudes_autorizacion, public.solicitud_documentos, public.compromisos, public.obligaciones to authenticated;
-- Por columna: las de la decisión (acta aprobada, estado decidido) no se pueden escribir directamente.
grant insert (tipo, fecha, hora, lugar, orden_dia, estado, notas, acta_documento_id),
      update (tipo, fecha, hora, lugar, orden_dia, estado, convocada_en, notas, acta_documento_id) on public.reuniones to authenticated;
grant insert, delete on public.reunion_documentos to authenticated;
grant insert, update (estado) on public.asistencia to authenticated;
grant insert (anio, mes, balance_documento_id, pagos_documento_id, cartera_gestion, mantenimiento, otros, estado, presentado_en),
      update (balance_documento_id, pagos_documento_id, cartera_gestion, mantenimiento, otros, estado, presentado_en) on public.informes_administrador to authenticated;
grant insert (tipo, titulo, descripcion, valor, proveedor_id),
      update (tipo, titulo, descripcion, valor, proveedor_id, estado) on public.solicitudes_autorizacion to authenticated;
grant insert, delete on public.solicitud_documentos to authenticated;
grant insert (reunion_id, descripcion, responsable, fecha_limite, estado, avance),
      update (descripcion, responsable, fecha_limite, estado, avance) on public.compromisos to authenticated;
grant insert (nombre, fuente, periodicidad, proxima_fecha, responsable, notas, activa),
      update (nombre, fuente, periodicidad, proxima_fecha, responsable, notas, ultima_cumplida, activa) on public.obligaciones to authenticated;

-- Un acta aprobada no se puede reemplazar ni volver a borrador (solo con otra decisión del consejo).
create or replace function privado.proteger_acta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.acta_estado = 'aprobada' and new.acta_documento_id is distinct from old.acta_documento_id then
    raise exception 'El acta ya fue aprobada por el consejo: no se puede cambiar el documento.';
  end if;
  if new.acta_documento_id is not null and new.acta_estado = 'sin acta' then new.acta_estado := 'borrador'; end if;
  return new;
end;
$$;
create trigger proteger_acta before update on public.reuniones for each row execute function privado.proteger_acta();

-- ---------- Decisiones: solo consejeros ----------
create or replace function public.consejo_decidir_informe(p_informe bigint, p_aprobado boolean, p_observaciones text, p_reunion bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_consejo() then return jsonb_build_object('ok', false, 'mensaje', 'Solo los consejeros registran la decisión sobre el informe.'); end if;
  if p_aprobado is null then return jsonb_build_object('ok', false, 'mensaje', 'Indique si se aprueba o se imprueba.'); end if;
  if not p_aprobado and length(btrim(coalesce(p_observaciones, ''))) < 10 then
    return jsonb_build_object('ok', false, 'mensaje', 'Si se imprueba, escriba las observaciones (mínimo 10 caracteres).');
  end if;
  update public.informes_administrador
  set estado = case when p_aprobado then 'aprobado' else 'improbado' end, decision_por = auth.uid(), decision_en = now(),
      observaciones_consejo = nullif(btrim(coalesce(p_observaciones, '')), ''), reunion_id = p_reunion
  where id = p_informe and estado = 'presentado';
  if not found then return jsonb_build_object('ok', false, 'mensaje', 'El informe no está presentado (o ya tiene decisión).'); end if;
  return jsonb_build_object('ok', true, 'mensaje', case when p_aprobado then 'Informe aprobado.' else 'Informe improbado.' end);
end;
$$;

create or replace function public.consejo_decidir_solicitud(p_solicitud bigint, p_estado text, p_observacion text, p_reunion bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_consejo() then return jsonb_build_object('ok', false, 'mensaje', 'Solo los consejeros deciden las solicitudes.'); end if;
  if coalesce(p_estado, '') not in ('aprobada', 'negada', 'aplazada') then return jsonb_build_object('ok', false, 'mensaje', 'Decisión no válida.'); end if;
  if p_estado <> 'aprobada' and length(btrim(coalesce(p_observacion, ''))) < 10 then
    return jsonb_build_object('ok', false, 'mensaje', 'Si se niega o se aplaza, escriba el motivo (mínimo 10 caracteres).');
  end if;
  update public.solicitudes_autorizacion
  set estado = p_estado, decision_por = auth.uid(), decision_en = now(),
      decision_observacion = nullif(btrim(coalesce(p_observacion, '')), ''), reunion_id = p_reunion
  where id = p_solicitud and estado in ('pendiente', 'aplazada');
  if not found then return jsonb_build_object('ok', false, 'mensaje', 'La solicitud no está pendiente.'); end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Decisión registrada.');
end;
$$;

create or replace function public.consejo_aprobar_acta(p_reunion bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not privado.es_consejo() then return jsonb_build_object('ok', false, 'mensaje', 'Solo los consejeros aprueban actas.'); end if;
  update public.reuniones set acta_estado = 'aprobada', acta_aprobada_por = auth.uid(), acta_aprobada_en = now()
  where id = p_reunion and acta_documento_id is not null and acta_estado = 'borrador';
  if not found then return jsonb_build_object('ok', false, 'mensaje', 'La reunión no tiene un acta en borrador.'); end if;
  return jsonb_build_object('ok', true, 'mensaje', 'Acta aprobada.');
end;
$$;

revoke execute on function public.consejo_integrantes(), public.admin_cargo_consejo(uuid, text),
  public.consejo_decidir_informe(bigint, boolean, text, bigint), public.consejo_decidir_solicitud(bigint, text, text, bigint),
  public.consejo_aprobar_acta(bigint) from public, anon;
grant execute on function public.consejo_integrantes(), public.admin_cargo_consejo(uuid, text),
  public.consejo_decidir_informe(bigint, boolean, text, bigint), public.consejo_decidir_solicitud(bigint, text, text, bigint),
  public.consejo_aprobar_acta(bigint) to authenticated;

create trigger auditar_reuniones after insert or update or delete on public.reuniones for each row execute function privado.auditar();
create trigger auditar_informes_administrador after insert or update or delete on public.informes_administrador for each row execute function privado.auditar();
create trigger auditar_solicitudes after insert or update or delete on public.solicitudes_autorizacion for each row execute function privado.auditar();
create trigger auditar_compromisos after insert or update or delete on public.compromisos for each row execute function privado.auditar();
create trigger auditar_obligaciones after insert or update or delete on public.obligaciones for each row execute function privado.auditar();

-- ---------- Obligaciones del RPH (precargadas; la administración las ajusta) ----------
insert into public.obligaciones (nombre, fuente, periodicidad, proxima_fecha, responsable, notas) values
  ('Convocar y realizar la asamblea general ordinaria', 'Ley 675 de 2001, art. 39; RPH art. 60.8', 'anual', make_date(extract(year from current_date)::int + 1, 3, 31),
   'Administración', 'Dentro de los tres meses siguientes al cierre del año. La convocatoria se envía con al menos 15 días calendario de anticipación (Ley 675, art. 39).'),
  ('Presentar a la asamblea el presupuesto de ingresos y egresos', 'RPH art. 60.9', 'anual', make_date(extract(year from current_date)::int + 1, 3, 31), 'Administración', 'Con la asamblea ordinaria.'),
  ('Cierre de cuentas al 31 de diciembre: inventario y balance general', 'RPH arts. 60.10 y 64', 'anual', make_date(extract(year from current_date)::int, 12, 31),
   'Administración', 'Se presentan a la asamblea por conducto del consejo.'),
  ('Informe anual de labores del consejo a la asamblea', 'RPH art. 58.6', 'anual', make_date(extract(year from current_date)::int + 1, 3, 31), 'Consejo', null),
  ('Sesión de instalación del consejo y elección de cargos', 'RPH arts. 67 y 68', 'cuando ocurra', null, 'Consejo', 'Dentro de los 5 días calendario siguientes a la elección en asamblea.'),
  ('Calendario de reuniones ordinarias del consejo', 'RPH arts. 57 y 71', 'cuando ocurra', null, 'Consejo', 'Después de la instalación. Copia a principales, suplentes, contadora y administración.'),
  ('Actualizar el registro y la certificación de existencia y representación legal', 'RPH art. 60.15; Ley 675 de 2001, art. 8', 'cuando ocurra', null,
   'Administración', 'Ante la alcaldía, cada vez que cambie el administrador o el representante legal.'),
  ('Revisar las pólizas del conjunto', 'RPH arts. 34, 60.13 y 63', 'anual', null, 'Administración', 'Ver la sección Proveedores y pólizas: allí están las fechas de vencimiento.'),
  -- Obligaciones legales verificadas el 2026-10-12 (la nota dice qué confirmar con el asesor que corresponda).
  ('Declaración mensual de retención en la fuente (formulario 350, DIAN)', 'Estatuto Tributario (agentes de retención); formulario 350', 'mensual', null,
   'Contadora', 'El conjunto practica retenciones (aparece en el flujo de caja). Fechas según el calendario tributario de la DIAN de cada año.'),
  ('Información exógena (medios magnéticos) a la DIAN', 'Resolución DIAN 227 de 2025 (año gravable 2025)', 'anual', null,
   'Contadora', 'Obligada la propiedad horizontal con ingresos brutos superiores a 2.400 UVT o que sea agente de retención. La DIAN expide una resolución cada año: confirmar plazos y requisitos con la contadora.'),
  ('Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST)', 'Decreto 1072 de 2015; Resolución 0312 de 2019 (estándares mínimos)', 'anual', null,
   'Administración', 'Aplica a quien tenga trabajadores o contrate personal (vigilancia, aseo, mantenimiento). Evaluar cada año los estándares mínimos. Confirmar el alcance con un asesor en SST.'),
  ('Piscina: plan de seguridad y reglamento de uso actualizados', 'Ley 1209 de 2008; Decreto 780 de 2016 (antes Decreto 554 de 2015)', 'anual', null,
   'Administración', 'Deben estar disponibles para la autoridad sanitaria. Piscina con cerramiento y alarma de agua cuando no esté en servicio; menores de 12 años solo con un adulto.'),
  ('Piscina: salvavidas los fines de semana, en vacaciones escolares y en eventos con menores de 14 años', 'Decreto 780 de 2016 (antes Decreto 554 de 2015)', 'cuando ocurra', null,
   'Administración', 'Una persona salvavidas por piscina en esos momentos (conjuntos residenciales).'),
  ('Recarga y mantenimiento anual de extintores', 'NTC 2885 (extintores portátiles)', 'anual', null,
   'Administración', 'Por una empresa certificada. Confirmar con el Cuerpo de Bomberos de Neiva los requisitos locales de inspección (Ley 1575 de 2012, art. 42).');
