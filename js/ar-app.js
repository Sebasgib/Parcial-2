const coloresProducto = ['#2AFF6B', '#2A75FF', '#FF2AEE', '#FFCC00'];
const claveMetricas = 'ar_metrics';

document.addEventListener('DOMContentLoaded', () => {
    const producto = document.querySelector('#objeto-producto');

    producto.addEventListener('click', () => {
        const colorActual = producto.getAttribute('color');
        const coloresDisponibles = coloresProducto.filter((color) => color !== colorActual);
        const colorAleatorio = coloresDisponibles[Math.floor(Math.random() * coloresDisponibles.length)];

        producto.setAttribute('color', colorAleatorio);
        registrarInteraccion('Clic en Producto AR', colorAleatorio);
    });
});

function registrarInteraccion(evento, detalle) {
    try {
        const datos = JSON.parse(localStorage.getItem(claveMetricas) ?? '[]');
        const interaccion = { fecha: new Date().toISOString(), evento, detalle };

        datos.push(interaccion);
        localStorage.setItem(claveMetricas, JSON.stringify(datos));
        console.log('Métrica AR registrada:', interaccion);
    } catch (error) {
        console.warn('No se pudo guardar la métrica AR.', error);
    }
}
