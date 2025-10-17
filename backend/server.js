import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config();

const app = express();

const isProduction = process.env.NODE_ENV === "production";

const clientURL = isProduction
  ? process.env.CLIENT_URL_PROD
  : process.env.CLIENT_URL_DEV;

const dbConfig = isProduction
  ? {
      url: process.env.DATABASE_URI_PROD,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }
  : {
      url: process.env.DATABASE_URI_DEV,
    };

// --- Conexão com o Banco de Dados ---
export const db = createClient(dbConfig);

// --- Middlewares ---
const corsOptions = {
  origin: clientURL,
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
};

app.use(cors(corsOptions));
app.use(express.json()); // Habilita o parsing de JSON para requisições POST/PUT

// Middleware para forçar o cabeçalho UTF-8 em todas as rotas da API.
app.use("/api", (req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// ===============================================
// === ROTAS PÚBLICAS (para o index.html) ========
// ===============================================

// Rota para buscar normas com funcionalidade de busca (ex: /api/v2/normas?q=decreto)
app.get("/api/v2/normas", async (req, res) => {
  const searchTerm = req.query.q;
  let sql = "SELECT * FROM normas";
  const params = [];

  if (searchTerm) {
    const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`;
    sql +=
      " WHERE LOWER(nome) LIKE ? OR LOWER(link) LIKE ? OR LOWER(preambulo) LIKE ?";
    params.push(lowerSearchTerm, lowerSearchTerm, lowerSearchTerm);
  }

  sql += " ORDER BY nome";

  try {
    const result = await db.execute(sql, params);
    res.status(200).json({ data: result.rows });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para buscar todos os tipos de compensação
app.get("/api/v2/tipos", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM tipos_compensacao");
    res.status(200).json({ data: result.rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rota para buscar todas as modalidades de compensação
app.get("/api/v2/modalidades", async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM modalidades");
    res.status(200).json({ data: result.rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Rota para obter as normas associadas a um tipo de compensação
app.get("/api/v2/tipos/:id/normas", async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT n.* FROM normas n JOIN normas_tipos_compensacao ntc ON n.id = ntc.norma_id WHERE ntc.tipo_id = ?",
      args: [req.params.id],
    });
    res.status(200).json({ data: result.rows });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ===============================================
// === NOVAS ROTAS PARA CONSULTA AO IDE SISEMA ===
// ===============================================
// A URL base para o GeoServer da IDE SISEMA, onde os serviços OWS estão disponíveis.
const WFS_BASE_URL = "http://geoserver.meioambiente.mg.gov.br/ows";

// Rota para consultar Unidades de Conservação Estaduais (Polígonos)
// Seu frontend chamará esta rota para obter os dados das UCs.
app.get("/api/v2/sisema/unidades-conservacao", async (req, res) => {
  // O typename que você descobriu para as Unidades de Conservação.
  const TYPENAME = "ide_2010_mg_unidades_conservacao_estaduais_pol";

  // Constrói a URL completa para a requisição WFS GetFeature.
  // Solicitamos a versão 2.0.0 do WFS e a saída em formato GeoJSON.
  let wfsUrl = `${WFS_BASE_URL}?service=WFS&version=2.0.0&request=GetFeature&typename=${TYPENAME}&outputFormat=application/json`;

  // Incluímos lógica para filtros opcionais que podem vir do frontend,
  // como uma caixa delimitadora (bbox) ou um filtro CQL (Common Query Language).
  // Isso permite que você refine as consultas no futuro, se necessário.
  if (req.query.bbox) {
    wfsUrl += `&bbox=${req.query.bbox}`;
  }

  if (req.query.cql_filter) {
    wfsUrl += `&cql_filter=${req.query.cql_filter}`;
  }

  try {
    // Log para acompanhar a requisição no console do seu backend.
    console.log(`Consultando WFS (UCs): ${wfsUrl}`);

    // Faz a requisição HTTP para o GeoServer do SISEMA usando axios.
    const response = await axios.get(wfsUrl);

    // Retorna os dados GeoJSON recebidos diretamente para o frontend.
    res.json(response.data);
  } catch (error) {
    // Em caso de erro na requisição, registra no console e envia uma resposta de erro para o frontend.
    console.error("Erro ao consultar UCs do SISEMA:", error.message);
    res.status(500).json({ error: "Falha ao obter dados de UCs do SISEMA." });
  }
});

// Rota para consultar Imóveis Disponíveis para Compensação (Pontos)
// Similar à rota das UCs, mas focada nos imóveis.
app.get("/api/v2/sisema/imoveis-compensacao", async (req, res) => {
  // O typename que você encontrou para os Imóveis disponíveis para Compensação.
  const TYPENAME = "ide_2104_mg_imoveis_disponiveis_compensacao_ambiental_pto";

  // Constrói a URL WFS para a camada de imóveis.
  let wfsUrl = `${WFS_BASE_URL}?service=WFS&version=2.0.0&request=GetFeature&typename=${TYPENAME}&outputFormat=application/json`;

  // Adiciona os mesmos filtros opcionais (bbox, cql_filter) para flexibilidade.
  if (req.query.bbox) {
    wfsUrl += `&bbox=${req.query.bbox}`;
  }

  if (req.query.cql_filter) {
    wfsUrl += `&cql_filter=${req.query.cql_filter}`;
  }

  try {
    // Log da requisição.
    console.log(`Consultando WFS (Imóveis): ${wfsUrl}`);

    // Faz a requisição para o GeoServer.
    const response = await axios.get(wfsUrl);

    // Retorna os dados GeoJSON.
    res.json(response.data);
  } catch (error) {
    // Tratamento de erro.
    console.error("Erro ao consultar Imóveis do SISEMA:", error.message);
    res
      .status(500)
      .json({ error: "Falha ao obter dados de Imóveis do SISEMA." });
  }
});

// ===============================================
// === ROTAS DA ÁREA ADMINISTRATIVA (CRUD) ======
// ===============================================

// --- NORMAS ---
// Rota para criar uma nova norma
app.post("/api/v2/normas", async (req, res) => {
  const { nome, link, preambulo } = req.body;

  try {
    const result = await db.execute({
      sql: "INSERT INTO normas (nome, link, preambulo) VALUES (?, ?, ?)",
      args: [nome, link, preambulo],
    });
    res.status(201).json({ message: "Norma criada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para atualizar uma norma existente
app.put("/api/v2/normas/:id", async (req, res) => {
  const { nome, link, preambulo } = req.body;

  try {
    await db.execute({
      sql: "UPDATE normas SET nome = ?, link = ?, preambulo = ? WHERE id = ?",
      args: [nome, link, preambulo, req.params.id],
    });
    res.status(200).json({ message: "Norma atualizada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para deletar uma norma
app.delete("/api/v2/normas/:id", async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM normas WHERE id = ?",
      args: [req.params.id],
    });
    res.status(200).json({ message: "Norma deletada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- TIPOS ---
// Rota para criar um novo tipo de compensação
app.post("/api/v2/tipos", async (req, res) => {
  const { nome } = req.body;

  try {
    const result = await db.execute({
      sql: "INSERT INTO tipos_compensacao (nome) VALUES (?)",
      args: [nome],
    });
    res.status(201).json({
      message: "Tipo de compensação criado com sucesso",
      id: Number(result.lastInsertRowid),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para atualizar um tipo de compensação
app.put("/api/v2/tipos/:id", async (req, res) => {
  const { nome } = req.body;

  try {
    await db.execute({
      sql: "UPDATE tipos_compensacao SET nome = ? WHERE id = ?",
      args: [nome, req.params.id],
    });
    res.status(200).json({ message: "Tipo atualizado com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para deletar um tipo de compensação
app.delete("/api/v2/tipos/:id", async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM tipos_compensacao WHERE id = ?",
      args: [req.params.id],
    });
    res.status(200).json({ message: "Tipo deletado com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- NORMAS-TIPOS COMPENSAÇÃO ---
// Rota para associar normas a um tipo de compensação
app.post("/api/v2/normas-tipos-compensacao", async (req, res) => {
  const { tipo_id, norma_id } = req.body;

  try {
    await db.execute({
      sql: "INSERT INTO normas_tipos_compensacao (tipo_id, norma_id) VALUES (?, ?)",
      args: [tipo_id, norma_id],
    });
    res.status(201).json({ message: "Associação criada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- MODALIDADES ---
// Rota para criar uma nova modalidade de compensação
app.post("/api/v2/modalidades", async (req, res) => {
  const sql = `INSERT INTO modalidades (tipo_id, nome, proporcao, forma, especificidades, vantagens, desvantagens, observacao, documentos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const p = req.body;

  try {
    const result = await db.execute({
      sql,
      args: [
        p.tipo_id,
        p.nome,
        p.proporcao,
        p.forma,
        p.especificidades,
        p.vantagens,
        p.desvantagens,
        p.observacao,
        p.documentos,
      ],
    });
    res.status(201).json({ message: "Modalidade criada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para atualizar uma modalidade de compensação
app.put("/api/v2/modalidades/:id", async (req, res) => {
  const sql = `UPDATE modalidades SET tipo_id = ?, nome = ?, proporcao = ?, forma = ?, especificidades = ?, vantagens = ?, desvantagens = ?, observacao = ?, documentos = ? WHERE id = ?`;
  const p = req.body;

  try {
    await db.execute({
      sql,
      args: [
        p.tipo_id,
        p.nome,
        p.proporcao,
        p.forma,
        p.especificidades,
        p.vantagens,
        p.desvantagens,
        p.observacao,
        p.documentos,
        req.params.id,
      ],
    });
    res.status(200).json({ message: "Modalidade atualizada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Rota para deletar uma modalidade de compensação
app.delete("/api/v2/modalidades/:id", async (req, res) => {
  try {
    await db.execute({
      sql: "DELETE FROM modalidades WHERE id = ?",
      args: [req.params.id],
    });
    res.status(200).json({ message: "Modalidade deletada com sucesso" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Servindo os arquivos estáticos do Frontend ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Serve a small JS file that defines window.env so the frontend can load runtime env before other scripts
app.get("/env.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(
    `window.env = ${JSON.stringify({
      NODE_ENV: process.env.NODE_ENV,
      API_URL_DEV: process.env.API_URL_DEV,
      API_URL_PROD: process.env.API_URL_PROD,
    })};`
  );
});

// --- Inicialização do Servidor ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em ${clientURL}`);
  console.log(`
Acesse as novas rotas do IDE SISEMA para testar:
- Unidades de Conservação: ${clientURL}/api/v2/sisema/unidades-conservacao
- Imóveis de Compensação: ${clientURL}/api/v2/sisema/imoveis-compensacao
`);
});
