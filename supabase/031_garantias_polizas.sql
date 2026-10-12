-- =====================================================================
-- Aragón en línea · Fase 3c (ampliación) · Aseguradoras, coberturas y garantías exigidas
-- Pegar en Supabase → SQL Editor → Run (una sola vez, después de 030).
--
--  * La aseguradora de cada póliza es un proveedor de la base general (servicio «Seguros»).
--  * Coberturas de cada póliza (incendio, terremoto, cumplimiento, salarios...) con su valor asegurado.
--  * Garantías exigidas (tabla editable por la administración, con su fuente):
--      - Conjunto: Ley 675 de 2001 art. 15 (incendio y terremoto, obligatorio), RPH art. 34 (también actos
--        malintencionados y terrorismo, por el valor del avalúo; y las recomendadas del parágrafo 2) y
--        RPH art. 63 (manejo, 4 salarios mínimos).
--      - Vigilancia: Decreto Ley 356 de 1994 (responsabilidad civil por uso de armas, mínimo 400 SMMLV).
--      - Todos los contratistas: referencia de la contratación estatal (Decreto 1082 de 2015: cumplimiento
--        mínimo 10 % y salarios y prestaciones mínimo 5 % del valor del contrato). Son EXIGENCIAS DEL
--        CONJUNTO, no obligaciones legales; el consejo las ajusta.
--  * Valor del último avalúo de los bienes comunes (para comparar incendio y terremoto).
-- Lo ven el consejo y la administración; lo mantiene la administración.
-- =====================================================================

alter table public.polizas add column if not exists aseguradora_id bigint references public.proveedores (id);
alter table public.configuracion_conjunto
  add column if not exists avaluo_valor bigint check (avaluo_valor > 0),
  add column if not exists avaluo_fecha date;
grant update (avaluo_valor, avaluo_fecha) on public.configuracion_conjunto to authenticated;

-- Coberturas que se pueden registrar y exigir.
create or replace function privado.cobertura_valida(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t in ('Incendio', 'Terremoto', 'Actos malintencionados de terceros (AMIT)', 'Terrorismo', 'Manejo',
               'Responsabilidad civil extracontractual', 'Sustracción', 'Equipo electrónico', 'Rotura de vidrios',
               'Cumplimiento', 'Salarios y prestaciones sociales', 'Calidad del servicio',
               'RC por uso de armas y elementos de vigilancia', 'Otra');
$$;

create table public.poliza_coberturas (
  id bigint generated always as identity primary key,
  poliza_id bigint not null references public.polizas (id) on delete cascade,
  cobertura text not null check (privado.cobertura_valida(cobertura)),
  valor_asegurado bigint check (valor_asegurado >= 0),
  deducible text check (length(deducible) <= 200),
  nota text check (length(nota) <= 300)
);
create index poliza_coberturas_poliza on public.poliza_coberturas (poliza_id);

create table public.requisitos_poliza (
  id bigint generated always as identity primary key,
  ambito text not null check (ambito in ('Conjunto', 'Todos los contratistas', 'Vigilancia', 'Aseo y servicios generales',
    'Mantenimiento de piscina', 'Mantenimiento eléctrico', 'Mantenimiento general', 'Jardinería', 'Contabilidad',
    'Administración', 'Asesoría jurídica', 'Seguros', 'Otro')),
  cobertura text not null check (privado.cobertura_valida(cobertura)),
  minimo_tipo text not null check (minimo_tipo in ('obligatoria', 'avaluo', 'smmlv', 'porcentaje_contrato', 'recomendada')),
  minimo_valor numeric check (minimo_valor >= 0),          -- % del avalúo, número de SMMLV o % del contrato
  vigencia text check (length(vigencia) <= 200),
  fuente text not null check (length(btrim(fuente)) between 3 and 200),
  nivel text not null check (nivel in ('ley', 'rph', 'conjunto', 'recomendada')),
  nota text check (length(nota) <= 500),
  activo boolean not null default true
);

alter table public.poliza_coberturas enable row level security;
alter table public.requisitos_poliza enable row level security;

create policy "consejo y administración ven coberturas" on public.poliza_coberturas for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración registra coberturas" on public.poliza_coberturas for insert to authenticated with check ((select privado.es_admin()));
create policy "administración cambia coberturas" on public.poliza_coberturas for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy "administración quita coberturas" on public.poliza_coberturas for delete to authenticated using ((select privado.es_admin()));

create policy "consejo y administración ven requisitos" on public.requisitos_poliza for select to authenticated
  using ((select privado.es_admin()) or (select privado.es_consejo()));
create policy "administración registra requisitos" on public.requisitos_poliza for insert to authenticated with check ((select privado.es_admin()));
create policy "administración cambia requisitos" on public.requisitos_poliza for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));

revoke all on public.poliza_coberturas, public.requisitos_poliza from anon, authenticated;
grant select, insert, update, delete on public.poliza_coberturas to authenticated;
grant select, insert, update on public.requisitos_poliza to authenticated;

create trigger auditar_poliza_coberturas after insert or update or delete on public.poliza_coberturas for each row execute function privado.auditar();
create trigger auditar_requisitos_poliza after insert or update or delete on public.requisitos_poliza for each row execute function privado.auditar();

-- ---------- Garantías exigidas precargadas (fuentes verificadas el 2026-10-12) ----------
insert into public.requisitos_poliza (ambito, cobertura, minimo_tipo, minimo_valor, vigencia, fuente, nivel, nota) values
  ('Conjunto', 'Incendio', 'avaluo', 100, 'Siempre vigente', 'Ley 675 de 2001, art. 15, parágrafo 1; RPH art. 34', 'ley',
   'Bienes comunes asegurables. El RPH pide ajustar el valor al avalúo pericial para evitar el infraseguro.'),
  ('Conjunto', 'Terremoto', 'avaluo', 100, 'Siempre vigente', 'Ley 675 de 2001, art. 15, parágrafo 1; RPH art. 34', 'ley', null),
  ('Conjunto', 'Actos malintencionados de terceros (AMIT)', 'obligatoria', null, 'Siempre vigente', 'RPH art. 34', 'rph', null),
  ('Conjunto', 'Terrorismo', 'obligatoria', null, 'Siempre vigente', 'RPH art. 34', 'rph', null),
  ('Conjunto', 'Manejo', 'smmlv', 4, 'Siempre vigente', 'RPH art. 63', 'rph', 'Cubre el manejo de los dineros por el administrador y el presidente del consejo.'),
  ('Conjunto', 'Responsabilidad civil extracontractual', 'recomendada', null, null, 'RPH art. 34, parágrafo 2', 'recomendada', null),
  ('Conjunto', 'Sustracción', 'recomendada', null, null, 'RPH art. 34, parágrafo 2', 'recomendada', null),
  ('Conjunto', 'Equipo electrónico', 'recomendada', null, null, 'RPH art. 34, parágrafo 2', 'recomendada', null),
  ('Conjunto', 'Rotura de vidrios', 'recomendada', null, null, 'RPH art. 34, parágrafo 2', 'recomendada', null),
  ('Vigilancia', 'RC por uso de armas y elementos de vigilancia', 'smmlv', 400, 'Durante el contrato', 'Decreto Ley 356 de 1994', 'ley',
   'Exigida a las empresas de vigilancia: responsabilidad civil extracontractual por uso indebido de armas u otros elementos de vigilancia.'),
  ('Todos los contratistas', 'Cumplimiento', 'porcentaje_contrato', 10, 'Plazo del contrato y su liquidación', 'Referencia: Decreto 1082 de 2015 (contratación estatal)', 'conjunto',
   'Exigencia del conjunto, no obligación legal. Ajuste el porcentaje si el consejo lo decide.'),
  ('Todos los contratistas', 'Salarios y prestaciones sociales', 'porcentaje_contrato', 5, 'Plazo del contrato y tiempo adicional que defina el conjunto', 'Referencia: Decreto 1082 de 2015 (contratación estatal)', 'conjunto',
   'Exigencia del conjunto, no obligación legal. Aplica cuando el contratista tiene trabajadores.'),
  ('Todos los contratistas', 'Calidad del servicio', 'obligatoria', null, 'La que defina el contrato', 'Referencia: Decreto 1082 de 2015 (contratación estatal)', 'conjunto',
   'El valor y el plazo los define el conjunto según el contrato.'),
  ('Todos los contratistas', 'Responsabilidad civil extracontractual', 'obligatoria', null, 'Plazo del contrato', 'Exigencia del conjunto', 'conjunto',
   'El valor lo define el consejo según el riesgo del servicio.');
