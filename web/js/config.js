// Conexión a Supabase. Estos dos valores son PÚBLICOS por diseño:
// la seguridad la dan las reglas de la base de datos (Row Level Security).
// NUNCA ponga aquí la clave "secret" ni la "service_role".
export const SUPABASE_URL = "https://bljgybxgkcpnlwlvflss.supabase.co";
export const SUPABASE_CLAVE = "sb_publishable_dFlPYn77x2NctKF9QOFPxQ_HBTKoPNL";

// Versión fija de la librería de Supabase (cargada desde jsdelivr). Para actualizarla, cambie solo el número.
export const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
