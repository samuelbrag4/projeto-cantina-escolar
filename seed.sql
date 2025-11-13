CREATE DATABASE cantina_escolar;
\c cantina_escolar

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