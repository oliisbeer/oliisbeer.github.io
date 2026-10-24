// Todo lo que lee o guarda la rockola pasa por aquí (Supabase o modo demo).
(function () {
  const C = window.ROCKOLA;
  // ?demo en el link fuerza el modo prueba (para mostrarla sin tocar la cola real)
  const demo = !C.supabaseUrl || !C.supabaseKey || new URLSearchParams(location.search).has('demo');
  const CLAVE_DEMO = 'rockola-demo-pedidos';

  // Catálogo pequeño para probar sin clave de YouTube
  const CATALOGO_DEMO = [
    { video_id: 'fJ9rUzIMcZQ', titulo: 'Queen – Bohemian Rhapsody', canal: 'Queen Official' },
    { video_id: '1w7OgIMMRc4', titulo: "Guns N' Roses – Sweet Child O' Mine", canal: "Guns N' Roses" },
    { video_id: 'hTWKbfoikeg', titulo: 'Nirvana – Smells Like Teen Spirit', canal: 'Nirvana' },
    { video_id: 'v2AC41dglnM', titulo: 'AC/DC – Thunderstruck', canal: 'AC/DC' },
    { video_id: 'btPJPFnesV4', titulo: 'Survivor – Eye Of The Tiger', canal: 'Survivor' },
    { video_id: 'lDK9QqIzhwk', titulo: "Bon Jovi – Livin' On A Prayer", canal: 'Bon Jovi' },
    { video_id: 'kJQP7kiw5Fk', titulo: 'Luis Fonsi – Despacito ft. Daddy Yankee', canal: 'Luis Fonsi' },
    { video_id: 'dQw4w9WgXcQ', titulo: 'Rick Astley – Never Gonna Give You Up', canal: 'Rick Astley' }
  ];

  function leerDemo() {
    try { return JSON.parse(localStorage.getItem(CLAVE_DEMO)) || []; } catch { return []; }
  }
  function guardarDemo(lista) {
    try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(lista.slice(-200))); } catch {}
  }

  async function rest(ruta, opciones = {}) {
    const r = await fetch(C.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + ruta, {
      ...opciones,
      headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
    });
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).message; } catch {}
      throw new Error(msg || 'Error de conexión (' + r.status + ')');
    }
    const texto = await r.text();
    return texto ? JSON.parse(texto) : null;
  }

  function decodificar(s) {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }

  async function buscarEnYouTube(q) {
    const p = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10',
      maxResults: '12', regionCode: 'CO', q, key: C.youtubeKey
    });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p);
    const d = await r.json();
    if (d.error) {
      const razon = d.error.errors && d.error.errors[0] && d.error.errors[0].reason;
      throw new Error(razon === 'quotaExceeded'
        ? 'El buscador descansa por hoy 😴 Abre YouTube, copia el link de la canción (Compartir → Copiar enlace) y pégalo arriba'
        : 'No se pudo buscar en YouTube');
    }
    return d.items.map(i => ({
      video_id: i.id.videoId,
      titulo: decodificar(i.snippet.title),
      canal: decodificar(i.snippet.channelTitle)
    }));
  }

  // Un video suele tener varias etiquetas (Soda Stereo: rock + pop + latina).
  // El género principal es la primera de esta lista que tenga: rock gana sobre pop,
  // y el reguetón (hip hop) no se confunde con salsa o vallenato (solo "latina").
  const PRIORIDAD_GENEROS = [
    'Rock_music', 'Hip_hop_music', 'Electronic_music', 'Reggae', 'Rhythm_and_blues', 'Soul_music',
    'Jazz', 'Country_music', 'Classical_music', 'Christian_music', 'Music_of_Latin_America',
    'Music_of_Asia', 'Pop_music', 'Independent_music'
  ];

  function enCola(lista) {
    return lista
      .filter(p => p.estado === 'cola' || p.estado === 'sonando')
      .sort((a, b) => a.id - b.id);
  }

  const Rockola = {
    demo,
    sinYouTube: !C.youtubeKey,

    miniatura: id => 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',

    async buscar(texto) {
      const q = texto.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100);
      if (!q) return [];

      if (!C.youtubeKey && !demo) {
        throw new Error('Busca la canción en YouTube, toca Compartir → Copiar enlace y pega el link arriba 👆');
      }
      if (!C.youtubeKey) {
        const palabras = q.split(' ');
        return CATALOGO_DEMO.filter(c =>
          palabras.every(w => (c.titulo + ' ' + c.canal).toLowerCase().includes(w)));
      }

      // Las búsquedas repetidas salen de Supabase para no gastar el cupo de YouTube
      if (!demo) {
        try {
          const desde = new Date(Date.now() - 7 * 864e5).toISOString();
          const filas = await rest('busquedas?select=resultados&q=eq.' + encodeURIComponent(q) +
            '&creado=gt.' + encodeURIComponent(desde));
          if (filas && filas.length) return filas[0].resultados;
        } catch {}
      }

      const resultados = await buscarEnYouTube(q);
      if (!demo) {
        rest('busquedas', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ q, resultados, creado: new Date().toISOString() })
        }).catch(() => {});
      }
      return resultados;
    },

    // Plan B: el cliente pega un link de YouTube (no gasta cupo ni necesita clave)
    idDeLink(texto) {
      const m = texto.trim().match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    },

    async porLink(texto) {
      const id = Rockola.idDeLink(texto);
      if (!id) throw new Error('Ese link no parece de YouTube');
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent('https://www.youtube.com/watch?v=' + id));
      if (r.status === 401 || r.status === 403) throw new Error('Ese video no se puede poner fuera de YouTube 😕 Prueba con otro');
      if (!r.ok) throw new Error('No encontramos ese video');
      const d = await r.json();
      return { video_id: id, titulo: d.title, canal: d.author_name };
    },

    async cola() {
      if (demo) return enCola(leerDemo());
      return rest('pedidos?select=id,video_id,titulo,canal,mesa,estado,creado' +
        '&estado=in.(cola,sonando)&order=id.asc');
    },

    async pedir(mesa, cancion) {
      const actual = await Rockola.cola();
      if (actual.some(p => p.video_id === cancion.video_id)) {
        throw new Error('Esa canción ya está en la cola 😉');
      }
      const pedido = {
        video_id: cancion.video_id,
        titulo: cancion.titulo.slice(0, 200),
        canal: (cancion.canal || '').slice(0, 120),
        mesa
      };
      if (demo) {
        const lista = leerDemo();
        lista.push({ ...pedido, id: Date.now(), estado: 'cola', creado: new Date().toISOString() });
        guardarDemo(lista);
      } else {
        await rest('pedidos', { method: 'POST', body: JSON.stringify(pedido) });
      }
      return (await Rockola.cola()).filter(p => p.estado === 'cola').length;
    },

    // Últimas canciones pedidas que ya sonaron, de la más reciente a la más vieja
    async ultimas() {
      if (demo) return leerDemo().filter(p => p.estado === 'hecho').map(p => p.video_id).reverse().slice(0, 10);
      const filas = await rest('pedidos?select=video_id&estado=eq.hecho&order=id.desc&limit=10');
      return (filas || []).map(f => f.video_id);
    },

    // Género principal de cada video según YouTube (1 punto de cupo por cada 50).
    // Devuelve un Map id → género, o null si no se pudo saber (sin clave o sin cupo).
    async generos(ids) {
      if (!C.youtubeKey || !ids.length) return null;
      const resultado = new Map();
      for (let i = 0; i < ids.length; i += 50) {
        const p = new URLSearchParams({ part: 'topicDetails', id: ids.slice(i, i + 50).join(','), key: C.youtubeKey });
        const d = await (await fetch('https://www.googleapis.com/youtube/v3/videos?' + p)).json();
        if (d.error) return null;
        for (const v of d.items || []) {
          const temas = ((v.topicDetails && v.topicDetails.topicCategories) || []).map(t => t.split('/').pop());
          resultado.set(v.id, PRIORIDAD_GENEROS.find(g => temas.includes(g)) || 'otro');
        }
      }
      return resultado;
    },

    // Solo la pantalla del bar cambia estados (con la clave del bar)
    async marcar(id, estado, clave) {
      if (demo) {
        guardarDemo(leerDemo().map(p => (p.id === id ? { ...p, estado } : p)));
        return;
      }
      await rest('rpc/bar_marcar', {
        method: 'POST',
        body: JSON.stringify({ p_id: id, p_estado: estado, p_clave: clave })
      });
    },

    async verificarClave(clave) {
      if (demo) return true;
      return rest('rpc/bar_verificar', { method: 'POST', body: JSON.stringify({ p_clave: clave }) });
    },

    // Llama a fn cada vez que la cola pueda haber cambiado
    escuchar(fn, cadaMs = 4000) {
      setInterval(fn, cadaMs);
      if (demo) window.addEventListener('storage', e => { if (e.key === CLAVE_DEMO) fn(); });
    }
  };

  window.Rockola = Rockola;
})();
