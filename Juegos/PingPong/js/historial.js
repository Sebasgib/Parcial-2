'use strict';

/*
 * Historial de partidos y récords (High Scores) de Pong.
 *
 * Todo se guarda como un único documento JSON en localStorage (clave CLAVE) y se
 * puede exportar/importar como archivo .json. Formato (version 1):
 *
 * {
 *   "version": 1,
 *   "jugadores": { "j1": "Ana", "j2": "Luis" },          // últimos nombres usados
 *   "partidos": [ { id, fecha, modo, dificultad, escenario, nombreIzq, nombreDer,
 *                   puntosIzq, puntosDer, ganador, duracion, rallyMax,
 *                   disparosPotentes } ],                 // los más recientes primero (máx. 200)
 *   "records": { "pvp": [ entrada, ... ], "cpu-facil": [ ... ], ... },   // Top 10 por categoría
 *   "estadisticas": { partidos, victoriasJ1, victoriasJ2, victoriasCPU, empates,
 *                     puntosJ1, puntosOponente, rallyMax, disparosPotentes, segundosJugados }
 * }
 *
 * Los datos leídos del navegador (o de un archivo importado) nunca se usan tal cual:
 * `sanitizar` reconstruye el documento campo por campo con tipos y límites válidos.
 */
const Historial = (() => {
  const CLAVE = 'pong.historial.v1';
  const VERSION = 1;
  const MAX_PARTIDOS = 200;
  const TOP = 10;

  const CATEGORIAS = {
    pvp: '2 Jugadores',
    'cpu-facil': 'CPU Fácil',
    'cpu-normal': 'CPU Normal',
    'cpu-dificil': 'CPU Difícil',
    'cpu-imposible': 'CPU Imposible'
  };
  const MODOS = ['pvp', 'cpu'];
  const DIFICULTADES = ['facil', 'normal', 'dificil', 'imposible'];
  const ESCENARIOS = ['clasico', 'neon', 'espacial', 'retro'];
  const RESULTADOS = ['victoria', 'derrota', 'empate'];

  let almacenamientoDisponible = true;

  /* ---------- Validación ---------- */
  const num = (v, min, max, def = 0) => {
    v = Number(v);
    return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
  };
  const txt = (v, max, def = '') => {
    if (typeof v !== 'string') return def;
    const limpio = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
    return limpio || def;
  };
  const opcion = (v, lista, def) => (lista.includes(v) ? v : def);
  const fecha = v => {
    const d = new Date(v);
    return typeof v === 'string' && !isNaN(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
  };
  const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  const ordenRecords = (a, b) =>
    b.puntos - a.puntos || (b.puntos - b.rival) - (a.puntos - a.rival) || a.fecha.localeCompare(b.fecha);

  const vacio = () => ({
    version: VERSION,
    jugadores: { j1: 'Jugador 1', j2: 'Jugador 2' },
    partidos: [],
    records: Object.fromEntries(Object.keys(CATEGORIAS).map(k => [k, []])),
    estadisticas: {
      partidos: 0, victoriasJ1: 0, victoriasJ2: 0, victoriasCPU: 0, empates: 0,
      puntosJ1: 0, puntosOponente: 0, rallyMax: 0, disparosPotentes: 0, segundosJugados: 0
    }
  });

  const sanitizarPartido = p => {
    if (!esObjeto(p)) return null;
    const modo = opcion(p.modo, MODOS, null);
    if (!modo) return null;
    const izq = num(p.puntosIzq, 0, 999), der = num(p.puntosDer, 0, 999);
    return {
      id: txt(p.id, 24, Math.random().toString(36).slice(2, 10)),
      fecha: fecha(p.fecha),
      modo,
      dificultad: modo === 'cpu' ? opcion(p.dificultad, DIFICULTADES, 'normal') : null,
      escenario: opcion(p.escenario, ESCENARIOS, 'clasico'),
      nombreIzq: txt(p.nombreIzq, 12, 'Jugador 1'),
      nombreDer: txt(p.nombreDer, 12, modo === 'cpu' ? 'CPU' : 'Jugador 2'),
      puntosIzq: izq,
      puntosDer: der,
      ganador: izq > der ? 'izquierda' : der > izq ? 'derecha' : 'empate', // siempre coherente con el marcador
      duracion: num(p.duracion, 0, 3600),
      rallyMax: num(p.rallyMax, 0, 9999),
      disparosPotentes: num(p.disparosPotentes, 0, 9999)
    };
  };

  const sanitizarEntrada = e => {
    if (!esObjeto(e)) return null;
    return {
      id: txt(e.id, 24, ''),
      nombre: txt(e.nombre, 12, 'Jugador'),
      puntos: num(e.puntos, 0, 999),
      rival: num(e.rival, 0, 999),
      resultado: opcion(e.resultado, RESULTADOS, 'empate'),
      escenario: opcion(e.escenario, ESCENARIOS, 'clasico'),
      fecha: fecha(e.fecha)
    };
  };

  /** Reconstruye un documento válido a partir de datos desconocidos; devuelve null si no es del formato esperado. */
  const sanitizar = raw => {
    if (!esObjeto(raw) || raw.version !== VERSION) return null;
    const d = vacio();
    if (esObjeto(raw.jugadores)) {
      d.jugadores.j1 = txt(raw.jugadores.j1, 12, 'Jugador 1');
      d.jugadores.j2 = txt(raw.jugadores.j2, 12, 'Jugador 2');
    }
    if (Array.isArray(raw.partidos)) {
      d.partidos = raw.partidos.slice(0, MAX_PARTIDOS).map(sanitizarPartido).filter(Boolean);
    }
    if (esObjeto(raw.records)) {
      for (const cat of Object.keys(CATEGORIAS)) {
        if (!Array.isArray(raw.records[cat])) continue;
        d.records[cat] = raw.records[cat].map(sanitizarEntrada).filter(e => e && e.puntos > 0).sort(ordenRecords).slice(0, TOP);
      }
    }
    if (esObjeto(raw.estadisticas)) {
      for (const k of Object.keys(d.estadisticas)) d.estadisticas[k] = num(raw.estadisticas[k], 0, 1e9);
    }
    return d;
  };

  /* ---------- Lectura / escritura en localStorage ---------- */
  const cargar = () => {
    try {
      const crudo = window.localStorage.getItem(CLAVE);
      if (!crudo) return vacio();
      return sanitizar(JSON.parse(crudo)) || vacio(); // datos corruptos: se empieza de cero sin romper el juego
    } catch (e) {
      almacenamientoDisponible = false; // modo privado, bloqueado o JSON ilegible
      return vacio();
    }
  };

  let datos = cargar();

  const guardar = () => {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(datos));
      almacenamientoDisponible = true;
      return true;
    } catch (e) {
      almacenamientoDisponible = false; // cuota llena o almacenamiento bloqueado
      return false;
    }
  };

  /* ---------- API ---------- */
  const categoriaDe = (modo, dificultad) => (modo === 'cpu' ? 'cpu-' + dificultad : 'pvp');

  /**
   * Guarda un partido terminado, actualiza estadísticas y récords y devuelve los logros
   * conseguidos (puesto en el Top 10 de su categoría).
   */
  function registrarPartido(info) {
    const modo = opcion(info.modo, MODOS, 'pvp');
    const partido = sanitizarPartido({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      fecha: new Date().toISOString(),
      modo,
      dificultad: info.dificultad,
      escenario: info.escenario,
      nombreIzq: info.nombreIzq,
      nombreDer: info.nombreDer,
      puntosIzq: info.puntosIzq,
      puntosDer: info.puntosDer,
      duracion: info.duracion,
      rallyMax: info.rallyMax,
      disparosPotentes: info.disparosPotentes
    });

    datos.partidos.unshift(partido);
    if (datos.partidos.length > MAX_PARTIDOS) datos.partidos.length = MAX_PARTIDOS;

    const s = datos.estadisticas;
    s.partidos++;
    s.puntosJ1 += partido.puntosIzq;
    s.puntosOponente += partido.puntosDer;
    s.segundosJugados += partido.duracion;
    s.rallyMax = Math.max(s.rallyMax, partido.rallyMax);
    s.disparosPotentes += partido.disparosPotentes;
    if (partido.ganador === 'empate') s.empates++;
    else if (partido.ganador === 'izquierda') s.victoriasJ1++;
    else if (modo === 'cpu') s.victoriasCPU++;
    else s.victoriasJ2++;

    // Récords: la CPU no puntúa; en 2 jugadores compiten ambos lados
    const categoria = categoriaDe(modo, partido.dificultad);
    const lados = [{ nombre: partido.nombreIzq, puntos: partido.puntosIzq, rival: partido.puntosDer, gana: partido.ganador === 'izquierda' }];
    if (modo === 'pvp') lados.push({ nombre: partido.nombreDer, puntos: partido.puntosDer, rival: partido.puntosIzq, gana: partido.ganador === 'derecha' });

    const logros = [];
    for (const l of lados) {
      if (l.puntos <= 0) continue;
      const entrada = sanitizarEntrada({
        id: partido.id, nombre: l.nombre, puntos: l.puntos, rival: l.rival,
        resultado: partido.ganador === 'empate' ? 'empate' : l.gana ? 'victoria' : 'derrota',
        escenario: partido.escenario, fecha: partido.fecha
      });
      const lista = datos.records[categoria];
      lista.push(entrada);
      lista.sort(ordenRecords);
      lista.length = Math.min(lista.length, TOP);
      const puesto = lista.indexOf(entrada) + 1; // 0 si quedó fuera del Top 10
      if (puesto > 0) logros.push({ categoria, nombre: l.nombre, puntos: l.puntos, puesto, esRecord: puesto === 1 });
    }

    const guardado = guardar();
    return { partido, logros, guardado };
  }

  /** Lista de récords de una categoría, o la combinación de todas (con su categoría) si `cat` es 'todas'. */
  function recordsDe(cat) {
    if (cat !== 'todas') return datos.records[cat].map(e => ({ ...e, categoria: cat }));
    const todos = [];
    for (const c of Object.keys(CATEGORIAS)) datos.records[c].forEach(e => todos.push({ ...e, categoria: c }));
    return todos.sort(ordenRecords).slice(0, TOP);
  }

  function guardarNombres(j1, j2) {
    datos.jugadores.j1 = txt(j1, 12, 'Jugador 1');
    datos.jugadores.j2 = txt(j2, 12, 'Jugador 2');
    guardar();
  }

  function importar(texto) {
    let nuevo = null;
    try { nuevo = sanitizar(JSON.parse(texto)); } catch (e) { nuevo = null; }
    if (!nuevo) return { ok: false, error: 'El archivo no tiene el formato del historial de Pong (version 1).' };
    datos = nuevo;
    return { ok: true, guardado: guardar(), partidos: datos.partidos.length };
  }

  function borrar() {
    const nombres = datos.jugadores;
    datos = vacio();
    datos.jugadores = nombres;
    return guardar();
  }

  return {
    CATEGORIAS,
    TOP,
    categoriaDe,
    registrarPartido,
    recordsDe,
    partidos: () => datos.partidos,
    estadisticas: () => datos.estadisticas,
    nombres: () => ({ ...datos.jugadores }),
    guardarNombres,
    mejor: () => recordsDe('todas')[0] || null,
    exportar: () => JSON.stringify(datos, null, 2),
    importar,
    borrar,
    almacenamientoDisponible: () => almacenamientoDisponible,
    // Solo para pruebas
    _sanitizar: sanitizar
  };
})();
