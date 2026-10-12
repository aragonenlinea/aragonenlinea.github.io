-- =====================================================================
-- Aragón en línea · Fase 3c · Proveedores, contratos y pólizas
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 024).
--
-- Herramienta de control para el CONSEJO y la ADMINISTRACIÓN (decisión del 2026-10-12):
-- propietarios, arrendatarios y público no ven nada de esto.
--  * Proveedores: empresas (con NIT y contacto de la empresa) o personas naturales registradas
--    SOLO por el servicio (sin nombre, cédula ni teléfono: minimización, Ley 1581).
--  * Contratos: vigencia, valores, rubro del presupuesto, supervisor y PDF (de Documentos privados).
--  * Pólizas del conjunto y de los contratistas (RPH arts. 34, 60.13 y 63), con su vigencia.
--  * Salario mínimo del año (lo escribe la administración) para revisar la póliza de manejo (4 SMMLV).
-- Solo la administración registra y modifica; cada cambio queda en la auditoría.
-- =====================================================================

create table public.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null check (length(btrim(nombre)) between 2 and 120),   -- empresa; o el servicio, si es persona natural
  tipo text not null default 'empresa' check (tipo in ('empresa', 'persona_natural')),
  nit text check (nit ~ '^[0-9.]{5,15}(-[0-9])?$'),
  servicio text not null check (servicio in ('Vigilancia', 'Aseo y servicios generales', 'Mantenimiento de piscina',
    'Mantenimiento eléctrico', 'Mantenimiento general', 'Jardinería', 'Contabilidad', 'Administración',
    'Asesoría jurídica', 'Seguros', 'Otro')),
  funciones text check (length(funciones) <= 2000),
  telefono text check (length(telefono) <= 40),
  correo text check (length(correo) <= 120),
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- De una persona natural no se guarda NIT (es su cédula), teléfono ni correo.
  check (tipo = 'empresa' or (nit is null and telefono is null and correo is null))
);

create table public.contratos (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores (id),
  objeto text not null check (length(btrim(objeto)) between 3 and 300),
  fecha_inicio date not null,
  fecha_fin date,                                       -- vacío: sin fecha de terminación
  valor_mensual bigint check (valor_mensual >= 0),
  valor_total bigint check (valor_total >= 0),
  rubro text check (length(rubro) <= 80),                -- nombre del rubro del presupuesto
  supervisor text not null default 'Administración' check (supervisor in ('Administración', 'Consejo')),
  polizas_exigidas text check (length(polizas_exigidas) <= 500),
  documento_id bigint references public.documentos_privados (id) on delete set null,
  estado text not null default 'vigente' check (estado in ('vigente', 'terminado', 'anulado')),
  notas text check (length(notas) <= 1000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table public.polizas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('Áreas comunes (incendio y terremoto)', 'Responsabilidad civil extracontractual',
    'Manejo', 'Sustracción', 'Equipo electrónico', 'Rotura de vidrios', 'Cumplimiento de contrato', 'Otra')),
  aseguradora text not null check (length(btrim(aseguradora)) between 2 and 120),
  numero text check (length(numero) <= 60),
  cubre text check (length(cubre) <= 500),
  proveedor_id bigint references public.proveedores (id),       -- póliza de un contratista (si no, es del conjunto)
  contrato_id bigint references public.contratos (id) on delete set null,
  valor_asegurado bigint check (valor_asegurado >= 0),
  prima bigint check (prima >= 0),
  vigencia_desde date not null,
  vigencia_hasta date not null,
  documento_id bigint references public.documentos_privados (id) on delete set null,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  notas text check (length(notas) <= 1000),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (vigencia_hasta >= vigencia_desde)
);

-- Parámetros del conjunto (una sola fila).
create table public.configuracion_conjunto (
  id smallint primary key default 1 check (id = 1),
  smmlv bigint check (smmlv > 0),                       -- salario mínimo mensual vigente (lo escribe la administración)
  smmlv_anio smallint check (smmlv_anio between 2020 and 2100),
  actualizado_en timestamptz not null default now()
);
insert into public.configuracion_conjunto (id) values (1) on conflict do nothing;

create index contratos_proveedor on public.contratos (proveedor_id);
create index polizas_vigencia on public.polizas (vigencia_hasta);

alter table public.proveedores enable row level security;
alter table public.contratos enable row level security;
alter table public.polizas enable row level security;
alter table public.configuracion_conjunto enable row level security;

-- Lectura: consejo y administración. Escritura: solo administración.
create policy "consejo y administración ven proveedores" on public.proveedores for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración registra proveedores" on public.proveedores for insert to authenticated
  with check ((select privado.es_admin()));
create policy "administración cambia proveedores" on public.proveedores for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

create policy "consejo y administración ven contratos" on public.contratos for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración registra contratos" on public.contratos for insert to authenticated
  with check ((select privado.es_admin()));
create policy "administración cambia contratos" on public.contratos for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

create policy "consejo y administración ven pólizas" on public.polizas for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración registra pólizas" on public.polizas for insert to authenticated
  with check ((select privado.es_admin()));
create policy "administración cambia pólizas" on public.polizas for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

create policy "consejo y administración ven la configuración" on public.configuracion_conjunto for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración cambia la configuración" on public.configuracion_conjunto for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

-- Sin borrados: lo que sobra se marca inactivo, terminado o anulado (queda el historial).
revoke all on public.proveedores, public.contratos, public.polizas, public.configuracion_conjunto from anon, authenticated;
grant select, insert, update on public.proveedores, public.contratos, public.polizas to authenticated;
grant select, update (smmlv, smmlv_anio, actualizado_en) on public.configuracion_conjunto to authenticated;

-- Fecha de actualización automática.
create or replace function privado.marcar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := clock_timestamp();
  return new;
end;
$$;
create trigger actualizado_proveedores before update on public.proveedores for each row execute function privado.marcar_actualizado();
create trigger actualizado_contratos before update on public.contratos for each row execute function privado.marcar_actualizado();
create trigger actualizado_polizas before update on public.polizas for each row execute function privado.marcar_actualizado();

create trigger auditar_proveedores after insert or update or delete on public.proveedores for each row execute function privado.auditar();
create trigger auditar_contratos after insert or update or delete on public.contratos for each row execute function privado.auditar();
create trigger auditar_polizas after insert or update or delete on public.polizas for each row execute function privado.auditar();
create trigger auditar_configuracion_conjunto after update on public.configuracion_conjunto for each row execute function privado.auditar();
