'use strict';

const HistorialJuego = (() => {
  const LIMITE = 200;
  const guardadoFallido = new Set();
  const prefijo = juego => `wilo.historial.v1.${juego}.`;
  const formatoFecha = new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' });

  function claves(juego) {
    const lista = [];
    const inicio = prefijo(juego);
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave?.startsWith(inicio)) lista.push(clave);
    }
    return lista.sort().reverse();
  }

  function registrar(juego, partida) {
    try {
      const ahora = new Date();
      const id = `${ahora.getTime()}.${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      // Una clave por partida permite guardar desde varias pestañas sin sobrescribir resultados.
      localStorage.setItem(prefijo(juego) + id, JSON.stringify({ ...partida, fecha: ahora.toISOString() }));
      guardadoFallido.delete(juego);
      for (const clave of claves(juego).slice(LIMITE)) localStorage.removeItem(clave);
    } catch {
      guardadoFallido.add(juego);
    }
  }

  function leer(juego) {
    try {
      const partidas = [];
      for (const clave of claves(juego).slice(0, LIMITE)) {
        const dato = localStorage.getItem(clave);
        try {
          const partida = JSON.parse(dato);
          if (partida && typeof partida.marcador === 'string' && typeof partida.fecha === 'string' && Number.isFinite(Date.parse(partida.fecha))) {
            partidas.push(partida);
          }
        } catch {
          // Una partida dañada no impide consultar las demás.
        }
      }
      return partidas;
    } catch {
      return null;
    }
  }

  function elemento(tipo, contenido) {
    const nodo = document.createElement(tipo);
    nodo.textContent = contenido;
    return nodo;
  }

  function resumen(partida) {
    const detalles = [];
    if (typeof partida.contexto === 'string') detalles.push(partida.contexto);
    if (Number.isFinite(partida.duracion) && partida.duracion >= 0) {
      const segundos = Math.round(partida.duracion);
      detalles.push(`${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`);
    }
    for (const [nombre, valor] of Object.entries(partida.metricas ?? {})) {
      if (typeof valor === 'string' || Number.isFinite(valor)) detalles.push(`${nombre} ${valor}`);
    }
    return detalles.join(' · ');
  }

  function abrir(juego) {
    const dialogo = document.querySelector('.game-history') ?? crearDialogo();
    const partidas = leer(juego);
    const estado = dialogo.querySelector('p');
    const lista = dialogo.querySelector('ol');
    let mensaje = '';
    if (!partidas) mensaje = 'El almacenamiento local no está disponible.';
    else if (guardadoFallido.has(juego)) mensaje = 'No se pudo guardar la última partida.';
    else if (!partidas.length) mensaje = 'Todavía no hay partidas guardadas.';
    estado.hidden = !mensaje;
    estado.textContent = mensaje;
    lista.replaceChildren();

    for (const partida of partidas ?? []) {
      const item = document.createElement('li');
      const tiempo = elemento('time', formatoFecha.format(new Date(partida.fecha)));
      tiempo.dateTime = partida.fecha;
      const marcador = typeof partida.resultado === 'string' ? `${partida.marcador} · ${partida.resultado}` : partida.marcador;
      item.append(elemento('strong', marcador), tiempo, elemento('span', resumen(partida)));
      lista.append(item);
    }
    dialogo.showModal();
  }

  function crearDialogo() {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'game-history';
    dialogo.setAttribute('aria-labelledby', 'game-history-title');
    const titulo = elemento('h2', 'Historial de partidas');
    titulo.id = 'game-history-title';
    const cerrar = elemento('button', 'Cerrar');
    cerrar.type = 'button';
    cerrar.autofocus = true;
    cerrar.addEventListener('click', () => dialogo.close());
    dialogo.addEventListener('keydown', evento => evento.stopPropagation());
    const cabecera = document.createElement('header');
    cabecera.append(titulo, cerrar);
    const lista = document.createElement('ol');
    lista.setAttribute('role', 'list');
    dialogo.append(cabecera, document.createElement('p'), lista);
    document.body.append(dialogo);
    return dialogo;
  }

  document.addEventListener('click', evento => {
    const boton = evento.target.closest('[data-game-history]');
    if (boton) abrir(boton.dataset.gameHistory);
  });

  return { registrar };
})();
