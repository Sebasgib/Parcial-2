/* Comportamiento compartido por index.html, blog.html y contacto.html:
   barra de progreso de lectura, botón flotante "volver arriba",
   animación de aparición al hacer scroll y copiar correo al portapapeles. */
(() => {
    'use strict';

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
