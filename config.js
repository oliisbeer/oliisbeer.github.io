// ===== CONFIGURACIÓN DE LA ROCKOLA =====
// Mientras supabaseUrl o supabaseKey estén vacíos, la rockola funciona en
// MODO DEMO: todo queda guardado solo en este navegador (sirve para probar).
window.ROCKOLA = {
  nombre: "Olii's Beer",
  mesas: 5,
  instagram: "oliisbeercerveceria",

  // Supabase → Project Settings → API (la URL y la clave "anon" o "publishable")
  supabaseUrl: "https://gwqadityhvgadixcxviu.supabase.co",
  supabaseKey: "sb_publishable_lfbK-5NP_kHWw7QZaJKvCw_eyx2yJFX",

  // Google Cloud → YouTube Data API v3 → Credenciales → Clave de API
  youtubeKey: "AIzaSyCsPwdfn1wzDvmbfPQ-PYuy3-oipDkTkls",

  // Cuando la cola se vacía, suena una mezcla de YouTube parecida a la última
  // canción pedida y del MISMO género (si fue rock, no pasa a rap; si fue salsa, sigue salsa).
  // Si todavía nadie ha pedido nada, arranca con el tema del bar: una de estas al azar
  // (ID del video: lo que va después de "watch?v=" en el link).
  semillas: [
    "T_FkEw27XJ0", // Soda Stereo – De Música Ligera
    "hReAuaAuJOE", // Enanitos Verdes – Lamento Boliviano
    "WRcCBI5rFfM", // Los Prisioneros – Tren al Sur
    "1w7OgIMMRc4", // Guns N' Roses – Sweet Child O' Mine
    "vx2u5uUu3DE", // Bon Jovi – It's My Life
    "lDK9QqIzhwk", // Bon Jovi – Livin' On A Prayer
    "JkK8g6FMEXE"  // Aerosmith – I Don't Want to Miss a Thing
  ]
};
