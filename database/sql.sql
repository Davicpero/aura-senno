CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'funcionario'
        CHECK (perfil IN ('admin', 'funcionario')),
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS clientes (
    id_cliente SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    telefone VARCHAR(20),
    cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produtos (
    id_produto SERIAL PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10,2) NOT NULL CHECK (preco > 0),
    estoque INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'confirmado', 'pago', 'entregue', 'cancelado')),
    valor_total NUMERIC(10,2) DEFAULT 0,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE IF NOT EXISTS itens_pedido (
    id_item SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL,
    id_produto INTEGER NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    FOREIGN KEY (id_produto) REFERENCES produtos(id_produto),
    UNIQUE (id_pedido, id_produto)
);

CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    acao VARCHAR(50) NOT NULL,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    detalhe TEXT
);

-- Usuários de demonstração (senhas conforme documentação no README)
INSERT INTO usuarios (nome, email, senha_hash, perfil)
VALUES
(
    'Administrador',
    'admin@comercial.com',
    crypt('admin123', gen_salt('bf', 10)),
    'admin'
),
(
    'Funcionário',
    'funcionario@comercial.com',
    crypt('func123', gen_salt('bf', 10)),
    'funcionario'
),
(
    'Carlos Silva',
    'carlos@comercial.com',
    crypt('123456', gen_salt('bf', 10)),
    'funcionario'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO clientes (nome, email, telefone, cpf_cnpj)
VALUES
('João Pereira', 'joao@email.com', '48999990001', '11111111111'),
('Maria Oliveira', 'maria@email.com', '48999990002', '22222222222'),
('Pedro Santos', 'pedro@email.com', '48999990003', '33333333333'),
('Ana Costa', 'ana@email.com', '48999990004', '44444444444')
ON CONFLICT (cpf_cnpj) DO NOTHING;

INSERT INTO produtos (nome, descricao, preco, estoque)
VALUES
('Notebook', 'Notebook para uso profissional', 3500.00, 15),
('Mouse', 'Mouse USB', 80.00, 50),
('Teclado', 'Teclado USB', 120.00, 30),
('Monitor', 'Monitor 24 polegadas', 950.00, 12),
('Headset', 'Headset com microfone', 180.00, 25),
('Webcam', 'Webcam Full HD', 250.00, 18)
ON CONFLICT DO NOTHING;

INSERT INTO pedidos (id_cliente, id_usuario, status, valor_total)
VALUES
(1, 1, 'pago', 3580.00),
(2, 2, 'confirmado', 300.00),
(3, 1, 'pago', 950.00)
ON CONFLICT DO NOTHING;

INSERT INTO itens_pedido
(id_pedido, id_produto, quantidade, preco_unitario, subtotal)
VALUES
(1, 1, 1, 3500.00, 3500.00),
(1, 2, 1, 80.00, 80.00),
(2, 3, 1, 120.00, 120.00),
(2, 5, 1, 180.00, 180.00),
(3, 4, 1, 950.00, 950.00)
ON CONFLICT DO NOTHING;
