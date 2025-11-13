// 🥐 Sistema Cantina Escolar - Versão Simplificada
// 🚀 Stack: Node.js + Express + PostgreSQL + EJS
// 👨‍🏫 Professor: Eduardo Correia (versão 2025)

import express from "express";
import session from "express-session";
import { Pool } from "pg";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🔌 Conexão com PostgreSQL
const pool = new Pool({
  user: "postgres", // ajuste se necessário
  host: "localhost",
  database: "cantina_escolar",
  password: "amods",
  port: 5432,
});

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

// 🧰 Função para consultar o banco
async function runQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

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
    res.send("Erro ao tentar autenticar: " + err.message);
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
 