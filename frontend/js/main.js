// ==========================================
// CONFIGURACIÓN DE SUPABASE Y OPENROUTER
// ==========================================
const SUPABASE_URL = "https://azbjrrbhvbmnbyvhxxdr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hx99kGNl5tBmaLrszIn_Rg_BhwEhV9H"; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OPENROUTER_API_KEY = "AQUI_VA_LA_KEY_DE_OPENROUTER";
const MODEL = "google/gemini-2.5-flash-lite";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Eres la voz oficial de atención al cliente de una distribuidora líder de carbón vegetal natural en Bucaramanga. 
Tu objetivo es atender al comprador de forma cálida, humana y estructurada, siguiendo un flujo comercial estricto.

REGLAS DE ORO:
1. BLOQUEO TOTAL DE DESVÍOS (IMPLACABLE): Si pregunta cosas ajenas al carbón, ignóramo amablemente y redirige de inmediato a la venta de bultos (Bulto Estándar $35.000 COP, Premium $45.000 COP, Ecológico $50.000 COP).
2. VALIDACIÓN DE PAGOS: Si el cliente adjunta un archivo, evalúa si es un comprobante de transferencia bancaria válido. Si no hay compras pendientes o si el archivo es ajeno (normas, tareas, documentos sin relación), recházalo amablemente.
3. CERO NOMBRES Y CERO ETIQUETAS: NUNCA digas que eres IA o bot, y no uses nombres propios. Hablas como parte del equipo.
4. TONO HUMANO Y CERCANO: Cálido, empático, con expresiones colombianas sutiles.`;

const SOPORTE_PROMPT = `Eres el asistente experto de soporte al cliente de la distribuidora de carbón en Bucaramanga. Responde dudas sobre tiempos de entrega en la ciudad, métodos de pago (transferencia o efectivo contra entrega) y características de los bultos de carbón. Sé muy amable y directo.`;

let history = [];
let soporteHistory = [];
let busy = false;
let clienteActual = null;
let telefonoIngresado = "";
let pasoOnboarding = "INICIAL"; 

document.addEventListener("DOMContentLoaded", () => {
    const authForm = document.getElementById("auth-form");
    const statusDiv = document.getElementById("auth-status");

    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            telefonoIngresado = document.getElementById("auth-telefono").value.trim();
            statusDiv.innerText = "Verificando teléfono en Supabase...";

            try {
                const { data, error } = await supabaseClient
                    .from('clientes')
                    .select('*')
                    .eq('telefono', telefonoIngresado);

                if (error) throw error;

                if (data && data.length > 0) {
                    clienteActual = data[0];
                    pasoOnboarding = "COMPLETO";
                    iniciarDashboard(clienteActual);
                } else {
                    clienteActual = { telefono: telefonoIngresado, nombre: "", direccion_habitual: "" };
                    pasoOnboarding = "ESPERANDO_NOMBRE";
                    iniciarDashboard(clienteActual);
                }
            } catch (err) {
                statusDiv.innerText = "Error al conectar con Supabase. Revisa la consola (F12).";
                console.error("Detalle del error:", err);
            }
        });
    }

    // Navegación entre pestañas del Dashboard
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");

            const targetId = item.getAttribute("data-target");
            document.querySelectorAll(".vista-contenido").forEach(vista => {
                vista.style.display = "none";
            });
            const vistaActiva = document.getElementById(targetId);
            if (vistaActiva) vistaActiva.style.display = "block";
        });
    });

    // Manejo visual de selección de archivos adjuntos
    const chatFileInput = document.getElementById("chat-file");
    const fileIndicator = document.getElementById("file-indicator");
    const fileNameText = document.getElementById("file-name-text");

    if (chatFileInput) {
        chatFileInput.addEventListener("change", () => {
            if (chatFileInput.files && chatFileInput.files[0]) {
                const archivo = chatFileInput.files[0];
                fileNameText.innerText = `Archivo listo para enviar: ${archivo.name}`;
                fileIndicator.style.display = "flex";
            } else {
                fileIndicator.style.display = "none";
            }
        });
    }

    // Chat principal de ventas con IA
    const chatForm = document.getElementById("chat-form");
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (busy) return;

            const input = document.getElementById("chat-input");
            const mensajeTexto = input.value.trim();
            const archivoAdjunto = chatFileInput.files[0];

            if (!mensajeTexto && !archivoAdjunto) return;

            if (archivoAdjunto) {
                const nombreArchivo = archivoAdjunto.name;
                agregarMensajeUsuario(`📎 Comprobante adjuntado: ${nombreArchivo}`);
                chatFileInput.value = "";
                fileIndicator.style.display = "none";

                const { data: pedidoPendiente } = await supabaseClient
                    .from('pedidos')
                    .select('*')
                    .eq('cliente_id', clienteActual.id)
                    .eq('estado', 'PENDIENTE')
                    .order('id', { ascending: false })
                    .limit(1);

                if (!pedidoPendiente || pedidoPendiente.length === 0) {
                    agregarMensajeAgente("⚠️ No tienes ninguna compra pendiente de pago en este momento, por lo que no es necesario enviar comprobantes o archivos. ¡Escríbenos cuántos bultos deseas llevar para crear tu pedido! 🪵🔥");
                    return;
                }

                await enviarMensajeOpenRouterParaValidarPago(nombreArchivo, pedidoPendiente[0].id);
                return;
            }

            agregarMensajeUsuario(mensajeTexto);
            input.value = "";

            if (pasoOnboarding === "ESPERANDO_NOMBRE") {
                clienteActual.nombre = mensajeTexto;
                pasoOnboarding = "ESPERANDO_DIRECCION";
                agregarMensajeAgente(`Mucho gusto, ${clienteActual.nombre}. ¿Cuál es tu dirección de entrega aquí en Bucaramanga? 📍`);
                guardarHistorialLocal();
                return;
            } else if (pasoOnboarding === "ESPERANDO_DIRECCION") {
                clienteActual.direccion_habitual = mensajeTexto;
                pasoOnboarding = "COMPLETO";

                try {
                    const { data: nuevoCliente, error } = await supabaseClient
                        .from('clientes')
                        .insert([{ 
                            telefono: clienteActual.telefono, 
                            nombre: clienteActual.nombre, 
                            tipo_cliente: 'NUEVO', 
                            direccion_habitual: clienteActual.direccion_habitual 
                        }])
                        .select()
                        .single();

                    if (!error && nuevoCliente) clienteActual = nuevoCliente;
                } catch (e) {
                    console.error("Error al registrar cliente:", e);
                }

                actualizarTarjetaPerfil(clienteActual);
                document.getElementById("welcome-user-title").innerText = `¡Hola, ${clienteActual.nombre}! 👋`;
                agregarMensajeAgente(`¡Perfecto! Tus datos han quedado registrados. Bienvenido a nuestra distribuidora de carbón natural en Bucaramanga 🪵🔥. ¿Cuántos bultos de 10 Kg a $35.000 COP necesitas hoy?`);
                guardarHistorialLocal();
                await cargarPedidosSupabase();
                return;
            }

            history.push({ role: "user", content: mensajeTexto });
            guardarHistorialLocal();
            await gestionarPedidoSupabase(mensajeTexto);
            enviarMensajeOpenRouter();
        });
    }

    // Chat independiente de Soporte IA
    const soporteForm = document.getElementById("soporte-form");
    if (soporteForm) {
        soporteForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const input = document.getElementById("soporte-input");
            const texto = input.value.trim();
            if (!texto) return;

            const box = document.getElementById("soporte-chat-box");
            box.innerHTML += `<div class="msg user">${texto}</div>`;
            input.value = "";
            box.scrollTop = box.scrollHeight;

            soporteHistory.push({ role: "user", content: texto });

            // Indicador de escribiendo en soporte
            const typingId = mostrarIndicadorEscribiendo("soporte-chat-box");

            try {
                const response = await fetch(API_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: MODEL,
                        temperature: 0.4,
                        max_tokens: 400,
                        messages: [{ role: "system", content: SOPORTE_PROMPT }, ...soporteHistory.slice(-10)]
                    })
                });

                const data = await response.json();
                removerIndicadorEscribiendo(typingId);

                const respuestaSoporte = data?.choices?.[0]?.message?.content?.trim() || "¡Entendido!";
                box.innerHTML += `<div class="msg bot">${respuestaSoporte}</div>`;
                box.scrollTop = box.scrollHeight;
                soporteHistory.push({ role: "assistant", content: respuestaSoporte });
            } catch (err) {
                removerIndicadorEscribiendo(typingId);
                box.innerHTML += `<div class="msg bot">Lo siento, hubo un error de conexión en soporte.</div>`;
            }
        });
    }
});

function iniciarDashboard(cliente) {
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-dashboard").style.display = "flex";
    
    actualizarTarjetaPerfil(cliente);

    // Cargar historial previo del chat desde localStorage si existe
    cargarHistorialLocal();

    if (pasoOnboarding === "COMPLETO") {
        document.getElementById("welcome-user-title").innerText = `¡Hola, ${cliente.nombre}! 👋`;
        if (history.length === 0) {
            agregarMensajeAgente(`¡Hola ${cliente.nombre}! Qué gusto saludarte de nuevo. Bienvenido a nuestra distribuidora de carbón en Bucaramanga 🪵🔥. ¿Cuántos bultos de 10 Kg a $35.000 COP necesitas hoy?`);
        }
        cargarPedidosSupabase();
    } else {
        document.getElementById("welcome-user-title").innerText = `¡Hola, bienvenido! 👋`;
        if (history.length === 0) {
            agregarMensajeAgente(`¡Hola! Vemos que eres un nuevo cliente por aquí. Para comenzar, ¿nos podrías decir cuál es tu **nombre completo**? 😊`);
        }
    }
}

function actualizarTarjetaPerfil(cliente) {
    document.getElementById("perfil-nombre").innerText = cliente.nombre || "Registrando...";
    document.getElementById("perfil-telefono").innerText = cliente.telefono || "-";
    document.getElementById("perfil-direccion").innerText = cliente.direccion_habitual || "Bucaramanga";
}

function agregarMensajeUsuario(texto) {
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
        const div = document.createElement("div");
        div.className = "msg user";
        div.innerText = texto;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    guardarHistorialLocal();
}

function agregarMensajeAgente(texto) {
    const chatBox = document.getElementById("chat-box");
    if (chatBox) {
        const div = document.createElement("div");
        div.className = "msg bot";
        div.innerText = texto;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    guardarHistorialLocal();
}

// Funciones para indicador de escritura dinámico (UX Profesional)
function mostrarIndicadorEscribiendo(containerId) {
    const chatBox = document.getElementById(containerId);
    const id = "typing-" + Date.now();
    if (chatBox) {
        const div = document.createElement("div");
        div.id = id;
        div.className = "msg bot";
        div.innerHTML = `<span style="display:inline-flex; gap:4px; align-items:center;">Escribiendo<span style="animation: blink 1s infinite">.</span><span style="animation: blink 1s infinite 0.2s">.</span><span style="animation: blink 1s infinite 0.4s">.</span></span>`;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
    return id;
}

function removerIndicadorEscribiendo(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Persistencia en LocalStorage
function guardarHistorialLocal() {
    if (clienteActual && clienteActual.telefono) {
        localStorage.setItem(`chat_${clienteActual.telefono}`, document.getElementById("chat-box").innerHTML);
        localStorage.setItem(`history_${clienteActual.telefono}`, JSON.stringify(history));
    }
}

function cargarHistorialLocal() {
    if (clienteActual && clienteActual.telefono) {
        const savedHtml = localStorage.getItem(`chat_${clienteActual.telefono}`);
        const savedHistory = localStorage.getItem(`history_${clienteActual.telefono}`);
        if (savedHtml) {
            document.getElementById("chat-box").innerHTML = savedHtml;
        }
        if (savedHistory) {
            history = JSON.parse(savedHistory);
        }
    }
}

async function enviarMensajeOpenRouter() {
    busy = true;
    const typingId = mostrarIndicadorEscribiendo("chat-box");

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.3,
                max_tokens: 600,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-16)]
            })
        });

        const data = await response.json().catch(() => ({}));
        removerIndicadorEscribiendo(typingId);

        if (!response.ok) throw new Error(data?.error?.message || "Error al conectar con OpenRouter.");

        const content = data?.choices?.[0]?.message?.content;
        const respuestaIA = typeof content === "string" ? content.trim() : "¡Entendido!";

        agregarMensajeAgente(respuestaIA);
        history.push({ role: "assistant", content: respuestaIA });
        guardarHistorialLocal();

    } catch (error) {
        removerIndicadorEscribiendo(typingId);
        agregarMensajeAgente("Lo siento, hubo un problema de conexión con el servicio de IA.");
    } finally {
        busy = false;
    }
}

async function enviarMensajeOpenRouterParaValidarPago(nombreArchivo, pedidoId) {
    busy = true;
    const typingId = mostrarIndicadorEscribiendo("chat-box");

    const promptValidacion = `El usuario ha adjuntado el archivo "${nombreArchivo}" como comprobante de pago. Evalúa estrictamente: si el archivo es un comprobante de pago bancario válido, responde aprobándolo y afirmando que el pago es válido. Si el archivo no es un comprobante (es un documento corporativo, tarea, PDF sin relación), recházalo claramente indicando que no corresponde a un pago.`;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.2,
                max_tokens: 400,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: promptValidacion }
                ]
            })
        });

        const data = await response.json().catch(() => ({}));
        removerIndicadorEscribiendo(typingId);

        if (!response.ok) throw new Error("Error al conectar con OpenRouter.");

        const content = data?.choices?.[0]?.message?.content;
        const respuestaIA = typeof content === "string" ? content.trim() : "";

        agregarMensajeAgente(respuestaIA);

        const textoInferior = respuestaIA.toLowerCase();
        const esValido = (
            (textoInferior.includes("válido") || textoInferior.includes("aprobado") || textoInferior.includes("éxito") || textoInferior.includes("correcto")) &&
            !textoInferior.includes("no es") && !textoInferior.includes("rechazado") && !textoInferior.includes("norma")
        );

        if (esValido) {
            await supabaseClient
                .from('pedidos')
                .update({ estado: 'CONFIRMADO' })
                .eq('id', pedidoId);

            await cargarPedidosSupabase();
        }

    } catch (error) {
        removerIndicadorEscribiendo(typingId);
        agregarMensajeAgente("Lo siento, ocurrió un error al procesar el archivo adjunto.");
    } finally {
        busy = false;
    }
}

async function gestionarPedidoSupabase(mensaje) {
    if (!clienteActual || !clienteActual.id) return;

    const texto = mensaje.toLowerCase();
    const numeros = mensaje.match(/\d+/);

    if (numeros && (texto.includes("bulto") || texto.includes("quiero") || texto.includes("necesito") || texto.includes("dame"))) {
        const cantidad = parseInt(numeros[0]);
        const totalCalc = cantidad * 35000;

        await supabaseClient
            .from('pedidos')
            .insert([{
                cliente_id: clienteActual.id,
                cantidad_bultos: cantidad,
                total: totalCalc,
                estado: 'PENDIENTE',
                direccion_entrega: clienteActual.direccion_habitual || 'Bucaramanga'
            }]);

        await cargarPedidosSupabase();
    }
}

async function cargarPedidosSupabase() {
    if (!clienteActual || !clienteActual.id) return;

    const { data: pedidoActual } = await supabaseClient
        .from('pedidos')
        .select('*')
        .eq('cliente_id', clienteActual.id)
        .order('id', { ascending: false })
        .limit(1);

    const tbodyActual = document.getElementById("tabla-pedido-actual");
    if (tbodyActual) {
        tbodyActual.innerHTML = "";
        if (pedidoActual && pedidoActual.length > 0) {
            const p = pedidoActual[0];
            let botonRecibo = `<span style="color: var(--text-muted); font-size: 0.8rem;">Pendiente de pago</span>`;
            if (p.estado === 'CONFIRMADO') {
                botonRecibo = `<button onclick="generarReciboPDF(${p.id}, ${p.cantidad_bultos}, ${p.total})" style="padding: 6px 12px; background: #ea580c; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: bold;"><i class="ph-bold ph-file-pdf"></i> Ver Recibo</button>`;
            }

            tbodyActual.innerHTML = `
                <tr>
                    <td><strong>#${p.id}</strong></td>
                    <td>${p.cantidad_bultos} Bulto(s)</td>
                    <td>$${Number(p.total).toLocaleString("es-CO")}</td>
                    <td><strong style="color: ${obtenerColorEstado(p.estado)};">${p.estado}</strong></td>
                    <td>${botonRecibo}</td>
                </tr>
            `;
        } else {
            tbodyActual.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Sin pedidos activos.</td></tr>`;
        }
    }

    const { data: todosPedidos } = await supabaseClient
        .from('pedidos')
        .select('*')
        .eq('cliente_id', clienteActual.id)
        .order('id', { ascending: false });

    const tbodyCompleta = document.getElementById("tabla-pedidos-completa");
    if (tbodyCompleta && todosPedidos) {
        tbodyCompleta.innerHTML = "";
        todosPedidos.forEach(pedido => {
            let btnH = pedido.estado === 'CONFIRMADO' 
                ? `<button onclick="generarReciboPDF(${pedido.id}, ${pedido.cantidad_bultos}, ${pedido.total})" style="padding: 4px 8px; background: #334155; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">Recibo</button>` 
                : '-';

            const fila = document.createElement("tr");
            fila.innerHTML = `
                <td>#${pedido.id}</td>
                <td>${pedido.cantidad_bultos}</td>
                <td>$${Number(pedido.total).toLocaleString("es-CO")}</td>
                <td>${pedido.estado}</td>
                <td>${pedido.direccion_entrega || 'Bucaramanga'}</td>
                <td>${btnH}</td>
            `;
            tbodyCompleta.appendChild(fila);
        });
    }
}

function generarReciboPDF(idPedido, cantidad, total) {
    const ventanaRecibo = window.open('', '_blank', 'width=700,height=800');
    ventanaRecibo.document.write(`
        <html>
        <head>
            <title>Recibo de Compra #${idPedido} - Carbón IA</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; color: #1e293b; background: #f8fafc; }
                .receipt-container { background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 500px; margin: auto; }
                h2 { color: #ea580c; margin-bottom: 5px; }
                .info { margin-bottom: 20px; font-size: 0.9rem; color: #475569; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
                th { background: #f1f5f9; }
                .total-row { font-weight: bold; font-size: 1.1rem; color: #0f172a; }
                .footer { text-align: center; margin-top: 30px; font-size: 0.80rem; color: #94a3b8; }
                .btn-print { display: block; width: 100%; padding: 12px; background: #ea580c; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-top: 25px; text-align: center; }
                @media print { .btn-print { display: none; } }
            </style>
        </head>
        <body>
            <div class="receipt-container">
                <h2>🔥 Carbón IA Bucaramanga</h2>
                <div class="info">
                    <p><strong>Comprobante de Transacción Digital</strong></p>
                    <p>Fecha: ${new Date().toLocaleDateString()} | Pedido #${idPedido}</p>
                    <p>Cliente: ${clienteActual.nombre} (${clienteActual.telefono})</p>
                    <p>Dirección de Entrega: ${clienteActual.direccion_habitual || 'Bucaramanga'}</p>
                </div>
                <table>
                    <tr>
                        <th>Descripción</th>
                        <th>Cant.</th>
                        <th>Total</th>
                    </tr>
                    <tr>
                        <td>Bulto de Carbón Vegetal (10 Kg)</td>
                        <td>${cantidad}</td>
                        <td>$${Number(total).toLocaleString("es-CO")} COP</td>
                    </tr>
                    <tr class="total-row">
                        <td colspan="2">Total Pagado:</td>
                        <td>$${Number(total).toLocaleString("es-CO")} COP</td>
                    </tr>
                </table>
                <p style="margin-top: 20px; color: #22c55e; font-weight: bold; text-align: center;">ESTADO: PAGO CONFIRMADO ✅</p>
                <button class="btn-print" onclick="window.print()">Imprimir / Guardar como PDF</button>
                <div class="footer">¡Gracias por tu compra en Carbón IA! Calidad garantizada para tus asados.</div>
            </div>
        </body>
        </html>
    `);
    ventanaRecibo.document.close();
}

function obtenerColorEstado(estado) {
    switch (estado) {
        case 'CONFIRMADO': return '#22c55e';
        case 'PENDIENTE': return '#f59e0b';
        case 'ENTREGADO': return '#3b82f6';
        default: return '#6b7280';
    }
}