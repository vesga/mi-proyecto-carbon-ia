// ==========================================
// CONFIGURACIÓN DE SUPABASE Y OPENROUTER
// ==========================================
const SUPABASE_URL = "https://azbjrrbhvbmnbyvhxxdr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hx99kGNl5tBmaLrszIn_Rg_BhwEhV9H"; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OPENROUTER_API_KEY = "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";
const MODEL = "google/gemini-2.5-flash-lite";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `Eres la voz oficial de atención al cliente de una distribuidora líder de carbón vegetal natural en Bucaramanga. 
Tu objetivo es atender al comprador de forma cálida, humana y estructurada, siguiendo un flujo comercial implacable.

REGLAS ESTRICTAS:
1. BLOQUEO TOTAL DE DESVÍOS (IMPLACABLE): Si pregunta cosas ajenas al carbón, ignóralo amablemente y redirige de inmediato a la venta de bultos a $35.000 COP.
2. CERO NOMBRES Y CERO ETIQUETAS: NUNCA digas que eres IA o bot, y no uses nombres propios (como Carlos o Juan). Hablas como parte del equipo.
3. TONO HUMANO Y CERCANO: Cálido, empático, con expresiones colombianas sutiles.`;

let history = [];
let busy = false;
let clienteActual = null;
let telefonoBuscado = "";

document.addEventListener("DOMContentLoaded", () => {
    const authForm = document.getElementById("auth-form");
    const nombreContainer = document.getElementById("nombre-container");
    const authNombreInput = document.getElementById("auth-nombre");
    const authBtn = document.getElementById("auth-btn");
    const statusDiv = document.getElementById("auth-status");

    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const telefono = document.getElementById("auth-telefono").value.trim();

            try {
                if (nombreContainer.style.display === "none") {
                    statusDiv.innerText = "Verificando teléfono en Supabase...";

                    let { data: clienteExistente, error } = await supabaseClient
                        .from('clientes')
                        .select('*')
                        .eq('telefono', telefono)
                        .maybeSingle();

                    if (error) throw error;

                    if (clienteExistente) {
                        clienteActual = clienteExistente;
                        iniciarSesionExitosa(clienteActual.nombre || "Cliente");
                    } else {
                        telefonoBuscado = telefono;
                        nombreContainer.style.display = "block";
                        authNombreInput.required = true;
                        authBtn.innerText = "Crear Cuenta y Entrar";
                        statusDiv.innerText = "Número no registrado. Escribe tu nombre completo para crear tu cuenta.";
                    }
                } else {
                    const nombre = authNombreInput.value.trim();
                    if (!nombre) return;

                    statusDiv.innerText = "Creando cuenta en Supabase...";

                    let { data: nuevoCliente, error: errInsert } = await supabaseClient
                        .from('clientes')
                        .insert([{ 
                            telefono: telefonoBuscado || telefono, 
                            nombre: nombre, 
                            tipo_cliente: 'NUEVO', 
                            direccion_habitual: 'Bucaramanga' 
                        }])
                        .select()
                        .single();

                    if (errInsert) throw errInsert;

                    clienteActual = nuevoCliente;
                    iniciarSesionExitosa(clienteActual.nombre);
                }
            } catch (err) {
                statusDiv.innerText = "Error de conexión con Supabase. Revisa la consola.";
                console.error("Detalle del error Supabase:", err);
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

    // Chat con IA (OpenRouter)
    const chatForm = document.getElementById("chat-form");
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (busy) return;

            const input = document.getElementById("chat-input");
            const mensajeTexto = input.value.trim();
            if (!mensajeTexto) return;

            agregarMensajeUsuario(mensajeTexto);
            history.push({ role: "user", content: mensajeTexto });
            input.value = "";

            await gestionarPedidoSupabase(mensajeTexto);
            enviarMensajeOpenRouter();
        });
    }
});

async function iniciarSesionExitosa(nombre) {
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-dashboard").style.display = "flex";
    document.getElementById("welcome-user-title").innerText = `¡Hola, ${nombre}! 👋`;

    agregarMensajeAgente(`¡Hola ${nombre}! Qué gusto saludarte. Bienvenido a nuestra distribuidora de carbón natural en Bucaramanga 🪵🔥. ¿Cuántos bultos de 10 Kg a $35.000 COP necesitas hoy?`);
    await cargarPedidosSupabase();
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
}

async function enviarMensajeOpenRouter() {
    busy = true;
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
                max_tokens: 600,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history.slice(-16)]
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || "Error al conectar con OpenRouter.");

        const content = data?.choices?.[0]?.message?.content;
        const respuestaIA = typeof content === "string" ? content.trim() : "¡Entendido!";

        agregarMensajeAgente(respuestaIA);
        history.push({ role: "assistant", content: respuestaIA });

    } catch (error) {
        agregarMensajeAgente("Lo siento, hubo un problema de conexión con el servicio de IA.");
    } finally {
        busy = false;
    }
}

async function gestionarPedidoSupabase(mensaje) {
    if (!clienteActual) return;

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
                direccion_entrega: 'Bucaramanga'
            }]);

        await cargarPedidosSupabase();
    }

    if (texto.includes("pague") || texto.includes("listo") || texto.includes("comprobante") || texto.includes("transferencia")) {
        const { data: ultimosPedidos } = await supabaseClient
            .from('pedidos')
            .select('*')
            .eq('cliente_id', clienteActual.id)
            .eq('estado', 'PENDIENTE')
            .order('id', { ascending: false })
            .limit(1);

        if (ultimosPedidos && ultimosPedidos.length > 0) {
            await supabaseClient
                .from('pedidos')
                .update({ estado: 'CONFIRMADO' })
                .eq('id', ultimosPedidos[0].id);
            await cargarPedidosSupabase();
        }
    }
}

async function cargarPedidosSupabase() {
    const tbody = document.getElementById("tabla-pedidos");
    const tbodyCompleta = document.getElementById("tabla-pedidos-completa");
    if (!tbody) return;

    let query = supabaseClient.from('pedidos').select('*').order('id', { ascending: false });
    if (clienteActual) {
        query = query.eq('cliente_id', clienteActual.id);
    }

    const { data: pedidos, error } = await query;
    if (error || !pedidos) return;

    tbody.innerHTML = "";
    if (tbodyCompleta) tbodyCompleta.innerHTML = "";

    pedidos.forEach(pedido => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td><strong>#${pedido.id}</strong></td>
            <td>${pedido.cantidad_bultos} Bulto(s) Carbón Natural</td>
            <td>$${Number(pedido.total).toLocaleString("es-CO")} COP</td>
            <td><strong style="color: ${obtenerColorEstado(pedido.estado)};">${pedido.estado}</strong></td>
        `;
        tbody.appendChild(fila);

        if (tbodyCompleta) {
            const filaComp = document.createElement("tr");
            filaComp.innerHTML = `
                <td>#${pedido.id}</td>
                <td>${pedido.cantidad_bultos}</td>
                <td>$${Number(pedido.total).toLocaleString("es-CO")}</td>
                <td>${pedido.estado}</td>
                <td>${pedido.direccion_entrega || 'Bucaramanga'}</td>
            `;
            tbodyCompleta.appendChild(filaComp);
        }
    });
}

function obtenerColorEstado(estado) {
    switch (estado) {
        case 'CONFIRMADO': return '#22c55e';
        case 'PENDIENTE': return '#f59e0b';
        case 'ENTREGADO': return '#3b82f6';
        default: return '#6b7280';
    }
}