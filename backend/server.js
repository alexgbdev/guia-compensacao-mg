const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
const PORT = 3000;

// --- Conexão com o Banco de Dados SQLite ---
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) {
    console.error(
      "ERRO GRAVE: Não foi possível conectar ao database.sqlite.",
      err.message
    );
    // Opcional: Terminar o processo se não conseguir conectar ao DB
    // process.exit(1);
  }
  console.log("Conectado ao banco de dados database.sqlite com sucesso.");
});

// --- Middlewares ---
app.use(cors()); // Habilita o CORS para todas as requisições
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
app.get("/api/v2/normas", (req, res) => {
  const searchTerm = req.query.q;
  let sql = "SELECT * FROM normas";
  const params = [];

  if (searchTerm) {
    const lowerSearchTerm = `%${searchTerm.toLowerCase()}%`;
    sql +=
      " WHERE LOWER(nome) LIKE ? OR LOWER(link) LIKE ? OR LOWER(preambulo) LIKE ?";
    params.push(lowerSearchTerm, lowerSearchTerm, lowerSearchTerm);
  }

  sql += " ORDER BY nome"; // Ordena os resultados pelo nome da norma

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Rota para buscar todos os tipos de compensação
app.get("/api/v2/tipos", (req, res) =>
  db.all("SELECT * FROM tipos_compensacao", [], (err, rows) =>
    err
      ? res.status(400).json({ error: err.message })
      : res.json({ data: rows })
  )
);

// Rota para buscar todas as modalidades de compensação
app.get("/api/v2/modalidades", (req, res) =>
  db.all("SELECT * FROM modalidades", [], (err, rows) =>
    err
      ? res.status(400).json({ error: err.message })
      : res.json({ data: rows })
  )
);

// Buscar todas as normas associadas a um tipo de compensação específico
app.get("/api/v2/normas-tipos-compensacao/:tipo_id", (req, res) => {
  db.all(
    "SELECT n.* FROM normas n JOIN normas_tipos_compensacao ntc ON n.id = ntc.norma_id WHERE ntc.tipo_id = ?",
    [req.params.tipo_id],
    (err, rows) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json({ data: rows });
    }
  );
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
app.post("/api/v2/normas", (req, res) => {
  const { nome, link, preambulo } = req.body;

  db.run(
    "INSERT INTO normas (nome, link, preambulo) VALUES (?, ?, ?)",
    [nome, link, preambulo],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(201).json({ id: this.lastID }); // Retorna o ID do novo registro
    }
  );
});

// Rota para atualizar uma norma existente
app.put("/api/v2/normas/:id", (req, res) => {
  const { nome, link, preambulo } = req.body;

  db.run(
    "UPDATE normas SET nome = ?, link = ?, preambulo = ? WHERE id = ?",
    [nome, link, preambulo, req.params.id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(200).json({ message: "Norma atualizada com sucesso" });
    }
  );
});

// Rota para deletar uma norma
app.delete("/api/v2/normas/:id", (req, res) => {
  db.run("DELETE FROM normas WHERE id = ?", req.params.id, function (err) {
    if (err) return res.status(400).json({ error: err.message });

    if (this.changes === 0)
      return res.status(404).json({ message: "Norma não encontrada." }); // Se nenhuma linha foi afetada, a norma não existia
    res.status(200).json({ message: "Norma deletada com sucesso" });
  });
});

// --- TIPOS ---
// Rota para criar um novo tipo de compensação
app.post("/api/v2/tipos", (req, res) => {
  const { nome } = req.body;

  db.run(
    "INSERT INTO tipos_compensacao (nome) VALUES (?)",
    [nome],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Rota para atualizar um tipo de compensação
app.put("/api/v2/tipos/:id", (req, res) => {
  const { nome } = req.body;

  db.run(
    "UPDATE tipos_compensacao SET nome = ?, WHERE id = ?",
    [nome, req.params.id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(200).json({ message: "Tipo atualizado com sucesso" });
    }
  );
});

// Rota para deletar um tipo de compensação
app.delete("/api/v2/tipos/:id", (req, res) => {
  db.run(
    "DELETE FROM tipos_compensacao WHERE id = ?",
    req.params.id,
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      if (this.changes === 0)
        return res.status(404).json({ message: "Tipo não encontrado." });
      res.status(200).json({ message: "Tipo deletado com sucesso" });
    }
  );
});

// --- MODALIDADES ---
// Rota para criar uma nova modalidade de compensação
app.post("/api/v2/modalidades", (req, res) => {
  const sql = `INSERT INTO modalidades (tipo_id, nome, proporcao, forma, especificidades, vantagens, desvantagens, observacao, documentos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const p = req.body;

  db.run(
    sql,
    [
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
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Rota para atualizar uma modalidade de compensação
app.put("/api/v2/modalidades/:id", (req, res) => {
  const sql = `UPDATE modalidades SET tipo_id = ?, nome = ?, proporcao = ?, forma = ?, especificidades = ?, vantagens = ?, desvantagens = ?, observacao = ?, documentos = ? WHERE id = ?`;
  const p = req.body;

  db.run(
    sql,
    [
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
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(200).json({ message: "Modalidade atualizada com sucesso" });
    }
  );
});

// Rota para deletar uma modalidade de compensação
app.delete("/api/v2/modalidades/:id", (req, res) => {
  db.run("DELETE FROM modalidades WHERE id = ?", req.params.id, function (err) {
    if (err) return res.status(400).json({ error: err.message });
    if (this.changes === 0)
      return res.status(404).json({ message: "Modalidade não encontrada." });
    res.status(200).json({ message: "Modalidade deletada com sucesso" });
  });
});

// --- Servindo os arquivos estáticos do Frontend ---
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// --- Inicialização do Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Servindo arquivos do frontend da pasta: ${frontendPath}`);
  console.log(`
Acesse as novas rotas do IDE SISEMA para testar:
- Unidades de Conservação: http://localhost:${PORT}/api/v2/sisema/unidades-conservacao
- Imóveis de Compensação: http://localhost:${PORT}/api/v2/sisema/imoveis-compensacao
`);
});
