// Memoria del sistema
let pedidosDB = [];
let contadorPedidos = 101;

// Contexto que maneja el Agente de IA para la interacción
let contextoAgente = {
    clienteIdentificado: false,
    nombreCliente: "",
    tipoCliente: "NUEVO",
    bultosSolicitados: 0,
    esperandoComprobante: false
};

document.addEventListener("DOMContentLoaded", () => {
    // Mensaje inicial del Agente de IA
    agregarMensajeAgente("¡Hola! Soy el Agente de IA encargado de la comercialización de carbón natural por bultos. ¿En qué te puedo colaborar hoy?");
    
    document.getElementById("chat-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("chat-input");
        const mensajeTexto = input.value.trim();
        if (!mensajeTexto) return;

        agregarMensajeUsuario(mensajeTexto);
        input.value = "";

        // El Agente analiza y procesa el mensaje
        setTimeout(() => {
            procesarIntencionAgenteIA(mensajeTexto);
        }, 500);
    });
});

function agregarMensajeUsuario(texto) {
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "msg user";
    div.innerText = texto;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function agregarMensajeAgente(texto) {
    const chatBox = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "msg bot";
    div.innerText = texto;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Lógica de razonamiento conversacional del Agente de IA
function procesarIntencionAgenteIA(mensaje) {
    const texto = mensaje.toLowerCase();
    const numeros = mensaje.match(/\d+/);

    // 1. Confirmación de comprobante / pago recibido
    if (contextoAgente.esperandoComprobante || texto.includes("pague") || texto.includes("transferencia") || texto.includes("comprobante") || texto.includes("listo")) {
        contextoAgente.esperandoComprobante = false;
        const ultimoPedido = pedidosDB[0];
        if (ultimoPedido) {
            ultimoPedido.estado = "PAGADO";
            actualizarDashboard();
            agregarMensajeAgente(`He verificado tu comprobante de pago exitosamente. El pedido #${ultimoPedido.id} ha pasado a estado PAGADO y se encuentra programado para despacho. ¡Muchas gracias!`);
        }
        return;
    }

    // 2. Extracción de cantidad de bultos
    if (numeros && (texto.includes("bulto") || texto.includes("quiero") || texto.includes("necesito") || texto.includes("mándame") || contextoAgente.bultosSolicitados === 0)) {
        contextoAgente.bultosSolicitados = parseInt(numeros[0]);
        const total = contextoAgente.bultosSolicitados * 35000;

        if (!contextoAgente.clienteIdentificado) {
            agregarMensajeAgente(`Entendido. ${contextoAgente.bultosSolicitados} bultos de carbón natural tienen un costo total de $${total.toLocaleString("es-CO")} COP. ¿Cuál es tu nombre completo para consultar si eres cliente registrado?`);
        } else {
            confirmarPedidoAgente();
        }
        return;
    }

    // 3. Identificación del cliente y diferanciación Nuevo vs. Antiguo
    if (contextoAgente.bultosSolicitados > 0 && !contextoAgente.clienteIdentificado) {
        contextoAgente.nombreCliente = mensaje;
        contextoAgente.clienteIdentificado = true;

        // Si el usuario ingresa nombres comunes de prueba, se clasifica como antiguo
        if (texto.includes("carlos") || texto.includes("maria") || texto.includes("restaurante") || texto.includes("juan")) {
            contextoAgente.tipoCliente = "ANTIGUO";
            agregarMensajeAgente(`¡Un gusto saludarte de nuevo, ${contextoAgente.nombreCliente}! Como cliente frecuente te aplicamos despacho prioritario.`);
        } else {
            contextoAgente.tipoCliente = "NUEVO";
            agregarMensajeAgente(`Bienvenido a nuestro servicio, ${contextoAgente.nombreCliente}. Hemos registrado tu perfil de cliente nuevo.`);
        }

        confirmarPedidoAgente();
        return;
    }

    // 4. Preguntas generales
    if (texto.includes("precio") || texto.includes("cuanto") || texto.includes("costo") || texto.includes("valor")) {
        agregarMensajeAgente("Comercializamos carbón natural de alta calidad por bultos de 15kg a $35.000 COP cada uno. Indícame cuántos bultos requiere tu negocio o domicilio y gestiono tu pedido de inmediato.");
    } else {
        agregarMensajeAgente("Puedo gestionarte la venta de carbón por bultos de forma automática. ¿Cuántos bultos necesitas para tu pedido?");
    }
}

function confirmarPedidoAgente() {
    const totalCalc = contextoAgente.bultosSolicitados * 35000;
    
    const nuevoPedido = {
        id: contadorPedidos++,
        cliente: contextoAgente.nombreCliente,
        telefono: "+57 300 " + Math.floor(1000000 + Math.random() * 9000000),
        tipo: contextoAgente.tipoCliente,
        bultos: contextoAgente.bultosSolicitados,
        total: totalCalc,
        estado: "PENDIENTE_PAGO"
    };

    pedidosDB.unshift(nuevoPedido);
    actualizarDashboard();

    contextoAgente.esperandoComprobante = true;
    
    setTimeout(() => {
        agregarMensajeAgente(`He generado la orden #${nuevoPedido.id} por ${nuevoPedido.bultos} bultos ($${totalCalc.toLocaleString("es-CO")} COP). Puedes realizar la transferencia a nuestra cuenta Nequi/Bancolombia y responder "Listo" o enviar la confirmación por aquí.`);
    }, 800);

    // Reiniciar valores temporales
    contextoAgente.bultosSolicitados = 0;
    contextoAgente.clienteIdentificado = false;
}

function actualizarDashboard() {
    const tbody = document.getElementById("tabla-pedidos");
    tbody.innerHTML = "";

    let totalBultos = 0;
    let clientesNuevos = 0;
    let ventasTotales = 0;

    pedidosDB.forEach(pedido => {
        totalBultos += pedido.bultos;
        ventasTotales += pedido.total;
        if (pedido.tipo === "NUEVO") clientesNuevos++;

        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>#${pedido.id}</td>
            <td><strong>${pedido.cliente}</strong><br><small style="color: var(--text-muted);">${pedido.telefono}</small></td>
            <td><span class="badge ${pedido.tipo.toLowerCase()}">${pedido.tipo}</span></td>
            <td>${pedido.bultos} bultos</td>
            <td>$${pedido.total.toLocaleString("es-CO")}</td>
            <td><strong style="color: ${obtenerColorEstado(pedido.estado)};">${pedido.estado}</strong></td>
        `;
        tbody.appendChild(fila);
    });

    document.getElementById("total-pedidos").innerText = pedidosDB.length;
    document.getElementById("total-bultos").innerText = totalBultos;
    document.getElementById("clientes-nuevos").innerText = clientesNuevos;
    document.getElementById("ventas-totales").innerText = "$" + ventasTotales.toLocaleString("es-CO");
}

function obtenerColorEstado(estado) {
    switch (estado) {
        case 'PAGADO': return '#22c55e';
        case 'PENDIENTE_PAGO': return '#f59e0b';
        default: return '#3b82f6';
    }
}