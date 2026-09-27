-- =====================================================================
-- Aragón en línea · Entrega 2a · Datos iniciales
-- Pegar en Supabase → SQL Editor después de 001_esquema.sql.
-- No contiene datos de personas: solo las casas y la versión de la política.
-- =====================================================================

-- Las 40 casas: Tipo 1 (casas 1 a 24) y Tipo 2 (casas 25 a 40), según el Reglamento.
insert into public.unidades (id, tipo)
select n, case when n <= 24 then 1 else 2 end
from generate_series(1, 40) as n;

-- Política de tratamiento de datos. Mientras el consejo no apruebe la definitiva, se usa el borrador
-- SOLO para pruebas. Al aprobarla se agrega la versión "1.0" y se activa (ver docs/guia-tecnica.md):
-- la plataforma pedirá a todos aceptar la nueva versión.
insert into public.politicas (version, vigente_desde, url, texto_autorizacion, activa)
values (
  '1.0-borrador',
  current_date,
  'https://github.com/aragonenlinea/aragonenlinea.github.io/blob/main/docs/politica-tratamiento-datos.md',
  'Autorizo al Conjunto Residencial Aragón – P.H., NIT 900.140.902-3, para tratar los datos personales que registre en esta plataforma, incluidos los de los habitantes de mi casa de quienes declaro tener autorización (de los menores de edad, solo nombre y parentesco), para las finalidades de administración de la copropiedad, comunicación, PQRS, reservas, seguridad y control de acceso, cobro de expensas y consultas a la comunidad, descritas en la Política de Tratamiento de Datos Personales, que leí. Autorizo que los datos se almacenen con proveedores en Estados Unidos. Sé que puedo conocer, actualizar, rectificar y pedir la supresión de mis datos, y revocar esta autorización.',
  true
);
