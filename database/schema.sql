-- Creación de la base de datos (PostgreSQL / MySQL)

-- 1. Tabla de Clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    telefono VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100),
    tipo_cliente VARCHAR(20) DEFAULT 'NUEVO', -- 'NUEVO' o 'ANTIGUO'
    direccion_habitual TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Productos (Bultos de Carbón)
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL, -- Ej: 'Bulto Carbón Natural 10kg'
    descripcion TEXT,
    precio_bulto DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0
);

-- 3. Tabla de Pedidos
CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES clientes(id),
    cantidad_bultos INT NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    direccion_entrega TEXT NOT NULL,
    estado VARCHAR(30) DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'CONFIRMADO', 'ENTREGADO', 'CANCELADO'
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Pagos
CREATE TABLE pagos (
    id SERIAL PRIMARY KEY,
    pedido_id INT REFERENCES pedidos(id),
    metodo_pago VARCHAR(50), -- 'TRANSFERENCIA', 'NEQUI', 'EFECTIVO'
    estado_pago VARCHAR(20) DEFAULT 'PENDIENTE', -- 'PENDIENTE', 'APROBADO', 'RECHAZADO'
    comprobante_url TEXT,
    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos iniciales de prueba para el producto
INSERT INTO productos (nombre, descripcion, precio_bulto, stock) 
VALUES ('Bulto Carbón Natural Premium', 'Bulto de carbón vegetal natural de 15kg', 35000.00, 100);