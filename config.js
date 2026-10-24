// ===== CONFIGURACIÓN DE LA ROCKOLA =====
// Mientras supabaseUrl o supabaseKey estén vacíos, la rockola funciona en
// MODO DEMO: todo queda guardado solo en este navegador (sirve para probar).
window.ROCKOLA = {
  nombre: "Olii's Beer",
  mesas: 5,

  // Supabase → Project Settings → API (la URL y la clave "anon" o "publishable")
  supabaseUrl: "https://gwqadityhvgadixcxviu.supabase.co",
  supabaseKey: "sb_publishable_lfbK-5NP_kHWw7QZaJKvCw_eyx2yJFX",

  // Google Cloud → YouTube Data API v3 → Credenciales → Clave de API
  youtubeKey: "",

  // Canciones de respaldo cuando nadie ha pedido nada (IDs de videos de YouTube,
  // lo que va después de "watch?v=" en el link). Si queda vacío, hace silencio.
  respaldo: []
};
