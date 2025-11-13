CREATE DATABASE cantina_escolar;
\c cantina_escolar;

CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    id_estoque INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    preco DECIMAL(10, 2) NOT NULL
);

CREATE TABLE estoque (
    id SERIAL PRIMARY KEY,
    id_produto INT NOT NULL,
    quantidade INT NOT NULL
);

CREATE TABLE vendas (
    id SERIAL PRIMARY KEY,
    id_funcionario INT NOT NULL,
    id_produto INT NOT NULL,
    quantidade INT NOT NULL,
    preco_total DECIMAL(10, 2) NOT NULL
);

CREATE TABLE funcionarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'comum',
    email VARCHAR(100) NOT NULL,
    senha VARCHAR(100) NOT NULL
);

-- INSERÇÕES

-- FUNCIONÁRIOS
INSERT INTO funcionarios (nome, tipo, email, senha) VALUES
('André Almeida', 'admin', 'andre.a3@cantinaescolar.com', 'admin5657'),
('Beatriz Souza', 'comum', 'beatriz.souza@cantinaescolar.com', 'senha1234');

-- ESTOQUE
INSERT INTO estoque (id_produto, quantidade) VALUES
(1, 50),
(2, 30),
(3, 20),
(4, 15),
(5, 40);

-- PRODUTOS
INSERT INTO produtos (id_estoque, nome, preco) VALUES
(1, 'Sanduíche Natural', 8.50),
(2, 'Suco de Laranja', 5.00),
(3, 'Salada de Frutas', 6.00),
(4, 'Bolo de Chocolate', 4.50),
(5, 'Água Mineral', 2.00);

-- VENDAS
INSERT INTO vendas (id_funcionario, id_produto, quantidade, preco_total) VALUES
(1, 1, 2, 17.00),
(2, 3, 1, 6.00),
(1, 4, 3, 13.50),
(2, 2, 2, 10.00);