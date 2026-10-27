// @ts-nocheck
// Rockola → app de YouTube del televisor (con la cuenta Premium del bar).
// Los clientes piden por el QR; esta función manda cada pedido a la fila de YouTube del TV,
// en orden, y lleva la cuenta de qué está sonando. El panel del bar manda aquí sus órdenes.
//
// Se publica en Supabase como función "tv" con "Verify JWT" apagado: la seguridad la pone
// la clave del bar (las acciones de los clientes solo pueden sincronizar la fila).

// ---------- Conexión con la app de YouTube del TV ("Vincular con código de TV") ----------
const LOUNGE = 'https://www.youtube.com/api/lounge';
const form = (datos) => new URLSearchParams(Object.entries(datos).map(([k, v]) => [k, String(v)]));

// El código de 12 números que muestra el TV → identificador fijo del TV
export async function vincular(codigo) {
  const r = await fetch(LOUNGE + '/pairing/get_screen', { method: 'POST', body: form({ pairing_code: codigo.replace(/\D/g, '') }) });
  if (!r.ok) throw new Error('Código del TV inválido o vencido. Saca uno nuevo en YouTube → Configuración → Vincular con código de TV');
  const { screen } = await r.json();
  return { screenId: screen.screenId, token: screen.loungeToken, nombre: screen.name || 'TV', expira: Number(screen.expiration) };
}

// El permiso para hablarle al TV vence cada cierto tiempo: se renueva con el identificador fijo
export async function renovar(screenId) {
  const r = await fetch(LOUNGE + '/pairing/get_lounge_token_batch', { method: 'POST', body: form({ screen_ids: screenId }) });
  if (!r.ok) throw new Error('No se pudo renovar el permiso del TV (' + r.status + ')');
  const { screens } = await r.json();
  if (!screens || !screens.length) throw new Error('El TV ya no está vinculado: vincúlalo otra vez desde el panel');
  return { token: screens[0].loungeToken, expira: Number(screens[0].expiration) };
}

// La respuesta viene en trozos "largo\n[[id,[evento, datos]], …]"
function leerEventos(texto) {
  const eventos = [];
  let i = 0;
  while (i < texto.length) {
    const fin = texto.indexOf('\n', i);
    if (fin < 0) break;
    const largo = parseInt(texto.slice(i, fin), 10);
    if (!largo) break;
    const trozo = texto.slice(fin + 1, fin + 1 + largo);
    i = fin + 1 + largo;
    try { for (const [id, ev] of JSON.parse(trozo)) eventos.push([id, ev]); } catch { /* trozo incompleto */ }
  }
  return eventos;
}

// Abre una sesión con el TV: devuelve cómo está (qué suena, volumen) y una función para mandarle órdenes
export async function conectar(token, nombre = "Rockola Olii's Beer") {
  const r = await fetch(LOUNGE + '/bc/bind?RID=1&VER=8&CVER=1&auth_failure_option=send_error', {
    method: 'POST',
    headers: { 'X-YouTube-LoungeId-Token': token },
    body: form({
      app: 'web', 'mdx-version': 3, name: nombre, id: crypto.randomUUID(), device: 'REMOTE_CONTROL',
      capabilities: 'que,dsdtr,atp', method: 'setPlaylist', magnaKey: 'cloudPairedDevice', ui: 'false',
      deviceContext: 'user_agent=dunno&window_width_points=&window_height_points=&os_name=android&ms=',
      theme: 'cl', loungeIdToken: token
    })
  });
  const texto = await r.text();
  if (!r.ok) {
    const e = new Error('El TV no respondió (' + r.status + ')');
    e.vencido = r.status === 401 || r.status === 403 || r.status === 410;
    throw e;
  }
  let sid = null, gsession = null, ultimoId = 0;
  const estado = { videoId: null, estado: null, tiempo: 0, volumen: null, prendido: false, eventos: [] };
  const anotar = (lista) => { for (const [id, [ev, datos]] of lista) {
    ultimoId = Math.max(ultimoId, id);
    estado.eventos.push(ev);
    if (ev === 'c') sid = datos;
    if (ev === 'S') gsession = datos;
    if (ev === 'nowPlaying' && datos) {
      estado.videoId = datos.videoId || null;
      if (datos.state != null) estado.estado = Number(datos.state);
      estado.tiempo = Number(datos.currentTime || 0);
    }
    if (ev === 'onStateChange' && datos && datos.state != null) estado.estado = Number(datos.state);
    if (ev === 'onVolumeChanged' && datos) estado.volumen = Number(datos.volume);
    if (ev === 'loungeStatus' && datos) {
      try { estado.prendido = JSON.parse(datos.devices).some((d) => d.type === 'LOUNGE_SCREEN'); } catch { /* sin datos */ }
    }
  } };
  anotar(leerEventos(texto));
  if (!sid || !gsession) throw new Error('No se pudo abrir la conexión con el TV');

  let rid = 2, ofs = 0;
  async function orden(comando, parametros = {}) {
    const datos = { count: 1, ofs: ofs++, req0__sc: comando, loungeIdToken: token };
    for (const [k, v] of Object.entries(parametros)) datos['req0_' + k] = v;
    const q = new URLSearchParams({ SID: sid, gsessionid: gsession, RID: String(rid++), VER: '8', CVER: '1', auth_failure_option: 'send_error' });
    const resp = await fetch(LOUNGE + '/bc/bind?' + q, { method: 'POST', headers: { 'X-YouTube-LoungeId-Token': token }, body: form(datos) });
    if (!resp.ok) throw new Error('El TV no recibió la orden "' + comando + '" (' + resp.status + ')');
  }
  // Al conectarse, el TV no siempre cuenta qué suena: se le pregunta y se escucha su respuesta un momento
  async function escuchar(ms) {
    const q = new URLSearchParams({ SID: sid, gsessionid: gsession, RID: 'rpc', CI: '0', TYPE: 'xmlhttp', AID: String(ultimoId), VER: '8', CVER: '1', loungeIdToken: token });
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), ms);
    let recibido = '';
    try {
      const resp = await fetch(LOUNGE + '/bc/bind?' + q, { headers: { 'X-YouTube-LoungeId-Token': token }, signal: corte.signal });
      const lector = resp.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        recibido += dec.decode(value, { stream: true });
        if (/"nowPlaying"/.test(recibido) && /"onVolumeChanged"/.test(recibido)) break;
      }
      corte.abort();
    } catch { /* se acabó el tiempo de espera */ }
    clearTimeout(reloj);
    anotar(leerEventos(recibido));
  }
  if (!estado.videoId) {
    try { await orden('getNowPlaying'); await orden('getVolume'); } catch { /* el TV puede no entenderlas */ }
    await escuchar(3500);
  }
  return { estado, orden };
}

// Estados del reproductor: -1 sin empezar, 0 terminó, 1 sonando, 2 pausa, 3 cargando, 5 en espera
const ACTIVO = [1, 2, 3];

// ---------- Base de datos (con la llave de servicio, que solo vive aquí) ----------
const env = (k) => (globalThis.Deno ? Deno.env.get(k) : process.env[k]);

// Llave de servicio: la clásica (JWT) o la nueva "sb_secret_…", según cómo esté el proyecto
function llaveServicio() {
  if (env('SUPABASE_SERVICE_ROLE_KEY')) return env('SUPABASE_SERVICE_ROLE_KEY');
  try {
    const llaves = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}');
    return llaves.default || Object.values(llaves)[0];
  } catch { return undefined; }
}

async function db(ruta, opciones = {}) {
  const llave = llaveServicio();
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + ruta, {
    ...opciones,
    headers: {
      apikey: llave, ...(llave && llave.startsWith('eyJ') ? { Authorization: 'Bearer ' + llave } : {}),
      'Content-Type': 'application/json', Prefer: 'return=representation', ...(opciones.headers || {})
    }
  });
  const texto = await r.text();
  if (!r.ok) throw new Error('Base de datos: ' + texto);
  return texto ? JSON.parse(texto) : null;
}
const patch = (ruta, datos) => db(ruta, { method: 'PATCH', body: JSON.stringify(datos) });

async function claveCorrecta(clave) {
  if (!clave) return false;
  return db('rpc/bar_verificar', { method: 'POST', body: JSON.stringify({ p_clave: clave }) });
}

// Abre la conexión con el TV, renovando el permiso si venció
async function abrirTV() {
  const [tv] = await db('tv?select=*&id=eq.1');
  if (!tv || !tv.screen_id) return null;
  let token = tv.token;
  if (!token || !tv.expira || tv.expira < Date.now() + 5 * 60e3) {
    ({ token } = await renovarYGuardar(tv.screen_id));
  }
  try {
    return { tv, ...(await conectar(token)) };
  } catch (e) {
    if (!e.vencido) throw e;
    ({ token } = await renovarYGuardar(tv.screen_id));
    return { tv, ...(await conectar(token)) };
  }
}
async function renovarYGuardar(screenId) {
  const nuevo = await renovar(screenId);
  await patch('tv?id=eq.1', { token: nuevo.token, expira: nuevo.expira });
  return nuevo;
}

async function tituloDe(videoId) {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId));
    return r.ok ? (await r.json()).title : '';
  } catch { return ''; }
}

// ---------- Mandar los pedidos nuevos y llevar la cuenta de lo que suena ----------
async function sincronizar() {
  const con = await abrirTV();
  if (!con) return { vinculado: false };
  const { tv, estado, orden } = con;
  let actual = estado.videoId;
  let activo = ACTIVO.includes(estado.estado) && !!actual;
  // Si el TV no contó qué suena, se usa lo que la rockola mandó: si hay un pedido sonando o en la
  // fila de los últimos 15 minutos, el TV está ocupado y lo nuevo va a la fila (no lo interrumpe)
  if (!activo && estado.estado == null) {
    const recientes = await db('pedidos?select=id&estado=in.(cola,sonando)&enviado_en=gt.' +
      encodeURIComponent(new Date(Date.now() - 15 * 60e3).toISOString()) + '&limit=1');
    if (recientes && recientes.length) activo = true;
  }

  // 1. Pedidos que aún no se han mandado: se "reservan" primero para no mandarlos dos veces
  const nuevos = (await patch('pedidos?estado=eq.cola&enviado_en=is.null', { enviado_en: new Date().toISOString() }) || [])
    .sort((a, b) => a.id - b.id);
  let ultimoMandado = actual;
  for (const p of nuevos) {
    if (!activo) {
      // El TV no está sonando nada: este pedido suena ya
      await orden('setPlaylist', { videoId: p.video_id, currentTime: 0, currentIndex: 0 });
      actual = p.video_id;
      activo = true;
    } else {
      await orden('addVideo', { videoId: p.video_id });
      // Se anota detrás de qué video quedó, para notar si alguien borra la fila en el TV
      await patch('pedidos?id=eq.' + p.id, { tras_video: ultimoMandado });
    }
    ultimoMandado = p.video_id;
  }

  // 2. Qué pedido está sonando y cuáles ya sonaron
  const enviados = (await db('pedidos?select=id,video_id,titulo,mesa,estado,tras_video&enviado_en=not.is.null' +
    '&estado=in.(cola,sonando,saltado)&creado=gt.' + encodeURIComponent(new Date(Date.now() - 12 * 3600e3).toISOString()) +
    '&order=id.asc')) || [];
  const vivos = enviados.filter((p) => p.estado !== 'saltado');
  const i = actual ? vivos.findIndex((p) => p.video_id === actual) : -1;
  let sonando = null;
  if (i >= 0) {
    sonando = vivos[i];
    if (sonando.estado !== 'sonando') await patch('pedidos?id=eq.' + sonando.id, { estado: 'sonando' });
    const pasados = vivos.slice(0, i).map((p) => p.id);
    if (pasados.length) await patch('pedidos?id=in.(' + pasados + ')', { estado: 'hecho' });
  } else {
    const terminados = vivos.filter((p) => p.estado === 'sonando').map((p) => p.id);
    if (terminados.length) await patch('pedidos?id=in.(' + terminados + ')', { estado: 'hecho' });
    // Si el TV ya pasó del video tras el cual se mandó un pedido y ese pedido no sonó,
    // se perdió de la fila (alguien la borró en el TV): se vuelve a mandar
    const perdidos = vivos.filter((p) => p.estado === 'cola' && p.tras_video && p.tras_video !== actual && !terminados.length);
    for (const p of perdidos) {
      await orden(activo ? 'addVideo' : 'setPlaylist', { videoId: p.video_id });
      activo = true;
      await patch('pedidos?id=eq.' + p.id, { tras_video: actual });
    }
  }

  // 3. El bar quitó una canción que ya estaba en la fila del TV: si empezó a sonar, se salta
  const quitada = enviados.find((p) => p.estado === 'saltado' && p.video_id === actual);
  if (quitada && ACTIVO.includes(estado.estado)) {
    await orden('next');
    await patch('pedidos?id=eq.' + quitada.id, { tras_video: null, enviado_en: null });
  }

  // 4. Lo que está sonando, para el panel y para los clientes
  const [antes] = await db('ahora?select=video_id,titulo&id=eq.1');
  let info;
  if (sonando) info = { video_id: sonando.video_id, titulo: sonando.titulo, mesa: sonando.mesa, automatica: false };
  else if (actual && ACTIVO.includes(estado.estado)) {
    const titulo = antes && antes.video_id === actual && antes.titulo ? antes.titulo : await tituloDe(actual);
    info = { video_id: actual, titulo, mesa: null, automatica: true };
  } else info = { video_id: null, titulo: null, mesa: null, automatica: false };
  await db('ahora', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 1, ...info, actualizado: new Date().toISOString() })
  });

  return { vinculado: true, nombre: tv.nombre, prendido: estado.prendido, estado: estado.estado, volumen: estado.volumen, sonando: actual, eventos: estado.eventos, mandados: nuevos.length };
}

// ---------- Órdenes del panel del bar ----------
async function ordenDelBar(accion, cuerpo) {
  if (accion === 'quitar') {
    const id = Number(cuerpo.id);
    await patch('pedidos?id=eq.' + id + '&estado=in.(cola,sonando)', { estado: 'saltado' });
    return sincronizar();
  }
  const con = await abrirTV();
  if (!con) throw new Error('Primero vincula el TV');
  const { estado, orden } = con;
  if (accion === 'saltar') await orden('next');
  if (accion === 'pausa') await orden('pause');
  if (accion === 'seguir') await orden('play');
  if (accion === 'volumen_mas' || accion === 'volumen_menos') {
    const v = estado.volumen == null ? 50 : estado.volumen;
    const nuevo = Math.max(0, Math.min(100, v + (accion === 'volumen_mas' ? 10 : -10)));
    await orden('setVolume', { volume: nuevo });
    return { volumen: nuevo };
  }
  return { ok: true };
}

// ---------- Entrada de la función ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (datos, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Varios clientes pidiendo a la vez: una sola sincronización corre en cada instancia
let enCurso = null;
const sincronizarUnaVez = () => (enCurso ||= sincronizar().finally(() => { enCurso = null; }));

async function atender(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cuerpo = await req.json().catch(() => ({}));
    const accion = cuerpo.accion || 'sincronizar';
    if (accion === 'sincronizar') return responder(await sincronizarUnaVez());

    if (!(await claveCorrecta(cuerpo.clave))) return responder({ error: 'Clave incorrecta' }, 401);
    if (accion === 'vincular') {
      const nuevo = await vincular(String(cuerpo.codigo || ''));
      await db('tv', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: 1, screen_id: nuevo.screenId, token: nuevo.token, nombre: nuevo.nombre, expira: nuevo.expira })
      });
      return responder(await sincronizar());
    }
    if (accion === 'estado') return responder(await sincronizar());
    if (['saltar', 'pausa', 'seguir', 'volumen_mas', 'volumen_menos', 'quitar'].includes(accion)) {
      return responder(await ordenDelBar(accion, cuerpo));
    }
    return responder({ error: 'Acción desconocida' }, 400);
  } catch (err) {
    console.error(err);
    return responder({ error: err.message }, 500);
  }
}

if (globalThis.Deno) Deno.serve(atender);
