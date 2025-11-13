// 🥐 Sistema Cantina Escolar - Versão Simplificada
// 🚀 Stack: Node.js + Express + PostgreSQL + EJS
// 👨‍🏫 Professor: Eduardo Correia (versão 2025)

import express from "express";
import session from "express-session";
import { Pool } from "pg";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🔌 Conexão com PostgreSQL
// Usa a porta definida em env PGPORT, senão tenta 7777 por compatibilidade com o seed original
const DB_PORT = process.env.PGPORT ? Number(process.env.PGPORT) : 7777;
const pool = new Pool({
  user: process.env.PGUSER || "postgres",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "cantina_escolar",
  password: process.env.PGPASSWORD || "amods",
  port: DB_PORT,
});

// Teste de conexão inicial (não derruba o servidor, só loga o resultado)
pool.query('SELECT 1').then(() => {
  console.log(`✅ Conectado ao PostgreSQL em ${pool.options.host}:${pool.options.port}`);
}).catch(err => {
  console.error('⚠️ Falha ao conectar no PostgreSQL:', err && err.message ? err.message : err);
  console.error('Dica: verifique se o serviço PostgreSQL está rodando e a porta/credenciais em server.js (PGPORT/PGPASSWORD).');

  // Habilita modo mock (fallback) lendo o arquivo seed.sql e populando arrays em memória.
  console.warn('ℹ️ Entrando em modo MOCK (fallback) usando dados de seed.sql');
  try {
    // tenta localizar seed.sql no workspace
    const possible = [
      path.join(process.cwd(), 'seed.sql'),
      path.join(__dirname, '..', 'seed.sql'),
      path.join(__dirname, 'seed.sql')
    ];
    let seedSql = null;
    for (const p of possible) {
      try { if (fs.existsSync(p)) { seedSql = fs.readFileSync(p, 'utf8'); break; } } catch(e){ }
    }
    if (!seedSql) throw new Error('seed.sql não encontrado');
    // monta mock
    setupMockDB(seedSql);
    mockMode = true;
  } catch (e) {
    console.error('❌ Não foi possível carregar seed.sql para modo mock:', e && e.message ? e.message : e);
  }
});

// Variáveis do modo mock e estrutura in-memory
let mockMode = false;
const Mock = { funcionarios: [], estoque: [], produtos: [], vendas: [] };

function parseTuples(valuesSql) {
  const tuples = [];
  const parts = valuesSql.split(/\),\s*\(/g).map(s => s.replace(/^\(|\)$/g, '').trim()).filter(Boolean);
  for (const part of parts) {
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (ch === "'") { cur += ch; inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.length) cols.push(cur.trim());
    const cleaned = cols.map(c => {
      if (!c) return null;
      const cc = c.trim();
      if (/^'.*'$/.test(cc)) return cc.slice(1, -1).replace(/''/g, "'");
      if (/^-?\d+$/.test(cc)) return Number(cc);
      if (/^-?\d+\.\d+$/.test(cc)) return Number(cc);
      if (/^NULL$/i.test(cc)) return null;
      return cc;
    });
    tuples.push(cleaned);
  }
  return tuples;
}

function setupMockDB(seedSql) {
  Mock.funcionarios = [];
  Mock.estoque = [];
  Mock.produtos = [];
  Mock.vendas = [];

  const insertRegex = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*([^;]+);/gmi;
  let m;
  while ((m = insertRegex.exec(seedSql)) !== null) {
    const table = m[1].toLowerCase();
    const cols = m[2].split(',').map(c => c.trim());
    const valuesSql = m[3].trim();
    const tuples = parseTuples(valuesSql);
    for (const t of tuples) {
      const obj = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = t[i] === undefined ? null : t[i];
      if (table === 'funcionarios') { obj.id = Mock.funcionarios.length + 1; Mock.funcionarios.push(obj); }
      else if (table === 'estoque') { obj.id = Mock.estoque.length + 1; Mock.estoque.push(obj); }
      else if (table === 'produtos') { obj.id = Mock.produtos.length + 1; Mock.produtos.push(obj); }
      else if (table === 'vendas') { obj.id = Mock.vendas.length + 1; Mock.vendas.push(obj); }
    }
  }
  console.log('ℹ️ Mock DB carregado:', { funcionarios: Mock.funcionarios.length, produtos: Mock.produtos.length, estoque: Mock.estoque.length, vendas: Mock.vendas.length });
}

async function runQuery(sql, params = []) {
  if (!mockMode) {
    const result = await pool.query(sql, params);
    return result.rows;
  }
  const s = sql.trim().toLowerCase();
  // login
  if (s.startsWith('select id, nome, tipo, email from funcionarios') && s.includes('where')) {
    const username = params[0]; const senha = params[1];
    const found = Mock.funcionarios.filter(u => (u.email === username || u.nome === username) && u.senha === senha);
    return found.map(u => ({ id: u.id, nome: u.nome, tipo: u.tipo, email: u.email }));
  }
  // produtos baixos
  if (s.includes('from produtos') && s.includes('left join estoque') && s.includes('< 5')) {
    return Mock.produtos.map(p => {
      const est = Mock.estoque.find(e => Number(e.id_produto) === Number(p.id));
      return { id: p.id, nome: p.nome, preco: p.preco, quantidade: est ? Number(est.quantidade) : 0 };
    }).filter(p => p.quantidade < 5);
  }
  if (s.startsWith('select count') && s.includes('from produtos')) return [{ cnt: Mock.produtos.length }];
  if (s.startsWith('select count') && s.includes('from vendas')) return [{ cnt: Mock.vendas.length }];

  if (s.includes('from produtos p') && s.includes('left join estoque')) {
    if (s.includes('where p.nome ilike')) {
      const term = (params[0] || '').toLowerCase().replace(/%/g, '');
      return Mock.produtos.filter(p => p.nome.toLowerCase().includes(term)).map(p => ({ id: p.id, id_estoque: p.id_estoque, nome: p.nome, preco: p.preco, quantidade: (Mock.estoque.find(e => Number(e.id_produto)===Number(p.id))||{}).quantidade || 0 }));
    }
    return Mock.produtos.map(p => ({ id: p.id, id_estoque: p.id_estoque, nome: p.nome, preco: p.preco, quantidade: (Mock.estoque.find(e => Number(e.id_produto)===Number(p.id))||{}).quantidade || 0 }));
  }
  if (s.startsWith('insert into produtos')) {
    const id_estoque = params[0] || 0; const nome = params[1] || ''; const preco = params[2] || 0; const id = Mock.produtos.length + 1;
    Mock.produtos.push({ id, id_estoque, nome, preco }); Mock.estoque.push({ id: Mock.estoque.length + 1, id_produto: id, quantidade: 0 }); return [{ id }];
  }
  if (s.startsWith('update produtos set')) { const id = params[2] || params[3] || params[4]; const p = Mock.produtos.find(x => Number(x.id) === Number(id)); if (p) { p.nome = params[0] || p.nome; p.preco = params[1] || p.preco; } return []; }
  if (s.startsWith('delete from estoque')) { const id = params[0]; Mock.estoque = Mock.estoque.filter(e => Number(e.id_produto) !== Number(id)); return []; }
  if (s.startsWith('delete from produtos')) { const id = params[0]; Mock.produtos = Mock.produtos.filter(p => Number(p.id) !== Number(id)); return []; }
  if (s.includes('from vendas')) { return Mock.vendas.slice().reverse().slice(0,20).map(v=>{ const p = Mock.produtos.find(x=>Number(x.id)===Number(v.id_produto))||{}; const f = Mock.funcionarios.find(x=>Number(x.id)===Number(v.id_funcionario))||{}; return { id: v.id, produto: p.nome, funcionario: f.nome, quantidade: v.quantidade, preco_total: v.preco_total }; }); }
  if (s.startsWith('select preco from produtos')) { const id = params[0]; const p = Mock.produtos.find(x=>Number(x.id)===Number(id)); return p ? [{ preco: p.preco }] : []; }
  if (s.startsWith('select * from estoque where id_produto')) { const id = params[0]; return Mock.estoque.filter(x=>Number(x.id_produto)===Number(id)); }
  if (s.startsWith('insert into estoque')) { Mock.estoque.push({ id: Mock.estoque.length + 1, id_produto: params[0], quantidade: params[1] }); return []; }
  if (s.startsWith('update estoque set quantidade')) { const qty = params[0]; const pid = params[1]; const e = Mock.estoque.find(x=>Number(x.id_produto)===Number(pid)); if (e) e.quantidade = qty; return []; }
  if (s.startsWith('insert into vendas')) { const id = Mock.vendas.length + 1; Mock.vendas.push({ id, id_funcionario: params[0], id_produto: params[1], quantidade: params[2], preco_total: params[3] }); return []; }
  return [];
}

// ⚙️ Configurações globais
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "cantina2025",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 🔒 Middleware para proteger rotas
function proteger(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// 🧰 Função para consultar o banco (implementada acima - suporta modo mock quando o Postgres falha)

// 🏠 LOGIN
app.get("/", (req, res) => res.render("login", { erro: null }));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await runQuery(
      "SELECT id, nome, tipo, email FROM funcionarios WHERE (email = $1 OR nome = $1) AND senha = $2",
      [username, password]
    );

    if (user.length === 0) {
      return res.render("login", { erro: "Usuário ou senha incorretos!" });
    }

    req.session.user = user[0];
    res.redirect("/dashboard");
  } catch (err) {
    // Log detalhado para ajudar no diagnóstico (não remove a mensagem original)
    console.error('Erro na rota /login:', err);
    const msg = err && err.message ? err.message : String(err);
    res.send('Erro ao tentar autenticar: ' + msg);
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// 🧭 DASHBOARD
app.get("/dashboard", proteger, async (req, res) => {
  // Produtos com estoque baixo (<5)
  const produtosBaixos = await runQuery(
    `SELECT p.id, p.nome, p.preco, COALESCE(e.quantidade,0) AS quantidade
     FROM produtos p
     LEFT JOIN estoque e ON e.id_produto = p.id
     WHERE COALESCE(e.quantidade,0) < 5
     ORDER BY p.nome`
  );

  const totalProdutos = (await runQuery("SELECT COUNT(*)::int AS cnt FROM produtos"))[0].cnt;
  const totalMov = (await runQuery("SELECT COUNT(*)::int AS cnt FROM vendas"))[0].cnt;

  res.render("dashboard", {
    usuario: req.session.user,
    produtosBaixos,
    totalProdutos,
    totalMov,
  });
});

// 📦 CADASTRO DE PRODUTO
app.get("/cadastro-produto", proteger, async (req, res) => {
  const busca = req.query.busca || "";

  const baseQuery = `SELECT p.id, p.id_estoque, p.nome, p.preco, COALESCE(e.quantidade,0) AS quantidade
    FROM produtos p LEFT JOIN estoque e ON e.id_produto = p.id`;

  const produtos = busca
    ? await runQuery(baseQuery + " WHERE p.nome ILIKE $1 ORDER BY p.nome", [`%${busca}%`])
    : await runQuery(baseQuery + " ORDER BY p.nome");

  res.render("cadastro-produto", { usuario: req.session.user, produtos, busca });
});

app.post("/cadastro-produto", proteger, async (req, res) => {
  const { id_estoque, nome, preco } = req.body;
  if (!nome) return res.send("⚠️ Informe o nome do produto.");

  const inserted = await runQuery(
    "INSERT INTO produtos (id_estoque, nome, preco) VALUES ($1,$2,$3) RETURNING id",
    [id_estoque || 0, nome, preco || 0]
  );

  const produtoId = inserted[0].id;
  await runQuery("INSERT INTO estoque (id_produto, quantidade) VALUES ($1,$2)", [produtoId, 0]);

  res.redirect("/cadastro-produto");
});

app.post("/cadastro-produto/update/:id", proteger, async (req, res) => {
  const { id } = req.params;
  const { nome, preco } = req.body;

  await runQuery("UPDATE produtos SET nome=$1, preco=$2 WHERE id=$3", [nome, preco, id]);
  res.redirect("/cadastro-produto");
});

app.post("/cadastro-produto/delete/:id", proteger, async (req, res) => {
  const { id } = req.params;
  await runQuery("DELETE FROM estoque WHERE id_produto=$1", [id]);
  await runQuery("DELETE FROM produtos WHERE id=$1", [id]);
  res.redirect("/cadastro-produto");
});

// 🧾 GESTÃO DE ESTOQUE
app.get("/gestao-estoque", proteger, async (req, res) => {
  const produtos = await runQuery(
    `SELECT p.id, p.nome, p.preco, COALESCE(e.quantidade,0) AS quantidade
     FROM produtos p LEFT JOIN estoque e ON e.id_produto = p.id ORDER BY p.nome`
  );

  // Usar tabela `vendas` como movimentações de saída (vendas recentes)
  const movimentos = await runQuery(
    `SELECT v.id, p.nome AS produto, f.nome AS funcionario, v.quantidade, v.preco_total
     FROM vendas v
     JOIN produtos p ON p.id = v.id_produto
     JOIN funcionarios f ON f.id = v.id_funcionario
     ORDER BY v.id DESC LIMIT 20`
  );

  res.render("gestao-estoque", { usuario: req.session.user, produtos, movimentos });
});

app.post("/gestao-estoque", proteger, async (req, res) => {
  const { product_id, type, quantity } = req.body; // type: 'entrada' | 'saida'
  const user_id = req.session.user.id;
  const prodId = Number(product_id);
  const qty = Number(quantity);
  if (!prodId || Number.isNaN(qty)) return res.send("Dados inválidos.");

  const produto = await runQuery("SELECT preco FROM produtos WHERE id=$1", [prodId]);
  const precoUnit = produto[0] ? Number(produto[0].preco) : 0;

  const existing = await runQuery("SELECT * FROM estoque WHERE id_produto=$1", [prodId]);
  const saldoAtual = existing.length ? Number(existing[0].quantidade) : 0;
  const novoSaldo = type === "entrada" ? saldoAtual + qty : saldoAtual - qty;

  if (existing.length === 0) {
    await runQuery("INSERT INTO estoque (id_produto, quantidade) VALUES ($1,$2)", [prodId, novoSaldo]);
  } else {
    await runQuery("UPDATE estoque SET quantidade=$1 WHERE id_produto=$2", [novoSaldo, prodId]);
  }

  if (type === "saida") {
    // registra venda
    const precoTotal = precoUnit * qty;
    await runQuery(
      "INSERT INTO vendas (id_funcionario, id_produto, quantidade, preco_total) VALUES ($1,$2,$3,$4)",
      [user_id, prodId, qty, precoTotal]
    );
  }

  res.redirect("/gestao-estoque");
});

// 🚀 INICIA SERVIDOR
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`)
);
 