'use strict';

/* Panel "Historial y récords": pestañas, tablas y botones de exportar / importar / borrar.
   Todo el texto de los datos se inserta con textContent (nunca como HTML). */
const HistorialUI = (() => {
  const $ = id => document.getElementById(id);
  const panel = $('history');
  const abrirBtn = $('history-btn');
  const cerrarBtn = $('history-close');
  const filtro = $('filter-category');
  const mensaje = $('history-msg');
  const mejorLinea = $('best-line');
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const vistas = { records: $('tab-records'), historial: $('tab-historial'), stats: $('tab-stats') };

  const celda = (texto, clase) => {
    const td = document.createElement('td');
    td.textContent = texto;
    if (clase) td.className = clase;
    return td;
  };

  const fechaCorta = iso => {
    const d = new Date(iso);
    if (isNaN(d.getTime()) || d.getTime() === 0) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };

  const escenarioNombre = k => (typeof ESCENARIOS !== 'undefined' && ESCENARIOS[k] ? ESCENARIOS[k].nombre : k);

  const modoTexto = p => (p.modo === 'cpu' ? 'CPU ' + (DIFICULTADES[p.dificultad] ? DIFICULTADES[p.dificultad].etiqueta : p.dificultad) : '2 Jugadores');

  function vaciarTabla(id, mensajeVacio, columnas) {
    const cuerpo = $(id).tBodies[0];
    cuerpo.replaceChildren();
    if (mensajeVacio) {
      const fila = document.createElement('tr');
      const td = celda(mensajeVacio, 'vacio');
      td.colSpan = columnas;
      fila.appendChild(td);
      cuerpo.appendChild(fila);
    }
    return cuerpo;
  }

  function pintarRecords() {
    const lista = Historial.recordsDe(filtro.value);
    const cuerpo = vaciarTabla('records-table', lista.length ? '' : 'Todavía no hay récords. ¡Juega un partido!', 7);
    lista.forEach((e, i) => {
      const fila = document.createElement('tr');
      if (i === 0) fila.className = 'oro';
      fila.append(
        celda(String(i + 1), 'num'),
        celda(e.nombre),
        celda(String(e.puntos), 'num fuerte'),
        celda(e.resultado === 'victoria' ? 'Victoria' : e.resultado === 'derrota' ? 'Derrota' : 'Empate'),
        celda(Historial.CATEGORIAS[e.categoria]),
        celda(escenarioNombre(e.escenario)),
        celda(fechaCorta(e.fecha), 'fecha')
      );
      cuerpo.appendChild(fila);
    });
  }

  function pintarPartidos() {
    const lista = Historial.partidos();
    const cuerpo = vaciarTabla('history-table', lista.length ? '' : 'Aún no has jugado ningún partido.', 6);
    lista.slice(0, 50).forEach(p => {
      const fila = document.createElement('tr');
      const quien = p.ganador === 'empate' ? 'Empate' : 'Ganó ' + (p.ganador === 'izquierda' ? p.nombreIzq : p.nombreDer);
      fila.append(
        celda(fechaCorta(p.fecha), 'fecha'),
        celda(modoTexto(p) + ' · ' + escenarioNombre(p.escenario)),
        celda(p.nombreIzq + '  ' + p.puntosIzq + ' - ' + p.puntosDer + '  ' + p.nombreDer, 'fuerte'),
        celda(quien),
        celda(String(p.rallyMax), 'num'),
        celda(String(p.disparosPotentes), 'num')
      );
      cuerpo.appendChild(fila);
    });
  }

  function pintarEstadisticas() {
    const s = Historial.estadisticas();
    const min = Math.floor(s.segundosJugados / 60), seg = s.segundosJugados % 60;
    const filas = [
      ['Partidos jugados', s.partidos],
      ['Victorias Jugador 1', s.victoriasJ1],
      ['Victorias Jugador 2', s.victoriasJ2],
      ['Victorias de la CPU', s.victoriasCPU],
      ['Empates', s.empates],
      ['Puntos anotados (izquierda)', s.puntosJ1],
      ['Puntos anotados (derecha)', s.puntosOponente],
      ['Mayor intercambio (golpes seguidos)', s.rallyMax],
      ['Disparos potentes', s.disparosPotentes],
      ['Tiempo jugado', min + ' min ' + seg + ' s']
    ];
    const lista = $('stats-list');
    lista.replaceChildren();
    for (const [k, v] of filas) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = String(v);
      lista.append(dt, dd);
    }
  }

  function mostrarMensaje(texto, error) {
    mensaje.textContent = texto;
    mensaje.className = error ? 'history-msg error' : 'history-msg';
  }

  function refrescar() {
    pintarRecords();
    pintarPartidos();
    pintarEstadisticas();
    actualizarMejor();
    if (!Historial.almacenamientoDisponible()) {
      mostrarMensaje('Este navegador no permite guardar datos: el historial solo durará mientras la página esté abierta.', true);
    }
  }

  /** Línea del menú con el mejor puntaje guardado. */
  function actualizarMejor() {
    const m = Historial.mejor();
    mejorLinea.textContent = m
      ? '★ Récord: ' + m.puntos + ' pts — ' + m.nombre + ' (' + Historial.CATEGORIAS[m.categoria] + ')'
      : 'Aún sin récords: ¡juega tu primer partido!';
  }

  function seleccionarTab(nombre) {
    tabs.forEach(t => {
      const activa = t.dataset.tab === nombre;
      t.classList.toggle('selected', activa);
      t.setAttribute('aria-selected', String(activa));
    });
    for (const k of Object.keys(vistas)) vistas[k].hidden = k !== nombre;
  }

  const estaAbierto = () => !panel.hidden;

  function abrir() {
    mostrarMensaje('', false);
    refrescar();
    seleccionarTab('records');
    panel.hidden = false;
    cerrarBtn.focus();
  }

  function cerrar() {
    panel.hidden = true;
    abrirBtn.focus();
  }

  /* ---------- Exportar / importar / borrar ---------- */
  function exportar() {
    const blob = new Blob([Historial.exportar()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pong-historial-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    mostrarMensaje('Archivo exportado.', false);
  }

  function importarArchivo(archivo) {
    if (!archivo) return;
    if (archivo.size > 2 * 1024 * 1024) { mostrarMensaje('El archivo es demasiado grande (máximo 2 MB).', true); return; }
    const lector = new FileReader();
    lector.onload = () => {
      if (!window.confirm('Importar reemplazará tu historial y récords actuales. ¿Continuar?')) return;
      const r = Historial.importar(String(lector.result));
      if (!r.ok) { mostrarMensaje(r.error, true); return; }
      refrescar();
      mostrarMensaje('Importados ' + r.partidos + ' partidos.' + (r.guardado ? '' : ' (No se pudo guardar en el navegador.)'), !r.guardado);
    };
    lector.onerror = () => mostrarMensaje('No se pudo leer el archivo.', true);
    lector.readAsText(archivo);
  }

  function borrarTodo() {
    if (!window.confirm('Se borrarán todos los partidos y récords guardados. Esta acción no se puede deshacer. ¿Continuar?')) return;
    Historial.borrar();
    refrescar();
    mostrarMensaje('Historial borrado.', false);
  }

  /* ---------- Eventos ---------- */
  abrirBtn.addEventListener('click', abrir);
  cerrarBtn.addEventListener('click', cerrar);
  panel.addEventListener('click', e => { if (e.target === panel) cerrar(); });
  tabs.forEach(t => t.addEventListener('click', () => seleccionarTab(t.dataset.tab)));
  filtro.addEventListener('change', pintarRecords);
  $('btn-export').addEventListener('click', exportar);
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', e => { importarArchivo(e.target.files[0]); e.target.value = ''; });
  $('btn-clear').addEventListener('click', borrarTodo);

  for (const [clave, etiqueta] of [['todas', 'Todas las categorías'], ...Object.entries(Historial.CATEGORIAS)]) {
    filtro.appendChild(new Option(etiqueta, clave));
  }
  actualizarMejor();

  return { estaAbierto, cerrar, actualizarMejor, refrescar };
})();
