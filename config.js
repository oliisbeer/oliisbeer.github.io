// ===== CONFIGURACIÓN DE LA ROCKOLA =====
// Mientras supabaseUrl o supabaseKey estén vacíos, la rockola funciona en
// MODO DEMO: todo queda guardado solo en este navegador (sirve para probar).
window.ROCKOLA = {
  nombre: "Olii's Beer",
  mesas: 5,
  instagram: "oliisbeercerveceria",

  // Dónde suena la música:
  //  "youtube-tv" → en la app de YouTube del televisor (con la cuenta Premium del bar).
  //                 Se vincula una vez desde el panel con el código del TV.
  //  "navegador"  → en la página bar.html abierta en un computador conectado al TV.
  pantalla: "youtube-tv",

  // Supabase → Project Settings → API (la URL y la clave "anon" o "publishable")
  supabaseUrl: "https://gwqadityhvgadixcxviu.supabase.co",
  supabaseKey: "sb_publishable_lfbK-5NP_kHWw7QZaJKvCw_eyx2yJFX",
  // Llave "anon" clásica (también pública): la pide la función del TV para dejarla llamar
  supabaseAnon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3cWFkaXR5aHZnYWRpeGN4dml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3OTQ1NDUsImV4cCI6MjEwODM3MDU0NX0.WDG3GLnTV0TtabI4tyfA91rgI4k3oBNLyy0fMSGZxKg",

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
