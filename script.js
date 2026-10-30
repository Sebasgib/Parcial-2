/* Comportamiento compartido por index.html, blog.html y contacto.html:
   barra de progreso de lectura, botón flotante "volver arriba",
   animación de aparición al hacer scroll y copiar correo al portapapeles. */
(() => {
    'use strict';

    // Alternador de modo oscuro / claro. El tema inicial lo fija un script en el <head>;
    // aquí se gestiona el botón, se guarda la elección y se sincroniza con Bootstrap.
    const raiz = document.documentElement;
    const botonTema = document.getElementById('theme-toggle');
    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const aplicarTema = (tema) => {
        raiz.setAttribute('data-theme', tema);
        raiz.setAttribute('data-bs-theme', tema);
        if (botonTema) {
            botonTema.setAttribute('aria-label', tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
        }
    };

    if (botonTema) {
        aplicarTema(raiz.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
        botonTema.addEventListener('click', () => {
            const nuevo = raiz.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            if (!reducirMovimiento) {
                raiz.classList.add('theme-anim');
                setTimeout(() => raiz.classList.remove('theme-anim'), 450);
            }
            aplicarTema(nuevo);
            try { localStorage.setItem('tema', nuevo); } catch (e) { /* almacenamiento no disponible */ }
        });
    }

    // Si el usuario nunca eligió, sigue los cambios del sistema operativo
    const preferenciaSistema = window.matchMedia('(prefers-color-scheme: light)');
    preferenciaSistema.addEventListener('change', (e) => {
        let guardado = null;
        try { guardado = localStorage.getItem('tema'); } catch (err) { /* ignorar */ }
        if (guardado !== 'light' && guardado !== 'dark') aplicarTema(e.matches ? 'light' : 'dark');
    });

    const progressBar = document.getElementById('scroll-progress');
    if (progressBar) {
        const actualizarProgreso = () => {
            const alto = document.documentElement.scrollHeight - window.innerHeight;
            const porcentaje = alto > 0 ? (window.scrollY / alto) * 100 : 0;
            progressBar.style.width = `${porcentaje}%`;
        };
        window.addEventListener('scroll', actualizarProgreso, { passive: true });
        actualizarProgreso();
    }

    const botonSubir = document.getElementById('scroll-top');
    if (botonSubir) {
        window.addEventListener('scroll', () => {
            botonSubir.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
        botonSubir.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const elementosRevelados = document.querySelectorAll('.reveal');
    if (elementosRevelados.length) {
        if ('IntersectionObserver' in window) {
            const observador = new IntersectionObserver((entradas) => {
                entradas.forEach((entrada) => {
                    if (entrada.isIntersecting) {
                        entrada.target.classList.add('is-visible');
                        observador.unobserve(entrada.target);
                    }
                });
            }, { threshold: 0.15 });
            elementosRevelados.forEach((el) => observador.observe(el));
        } else {
            elementosRevelados.forEach((el) => el.classList.add('is-visible'));
        }
    }

    document.querySelectorAll('.contact-links a[href^="mailto:"]').forEach((enlace) => {
        enlace.addEventListener('click', () => {
            const correo = enlace.getAttribute('href').replace('mailto:', '');
            if (navigator.clipboard) {
                navigator.clipboard.writeText(correo).catch(() => {});
            }
            enlace.classList.add('copied');
            setTimeout(() => enlace.classList.remove('copied'), 1500);
        });
    });
})();
