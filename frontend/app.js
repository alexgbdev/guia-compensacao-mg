document.addEventListener("DOMContentLoaded", async () => {
  const tipoSelect = document.getElementById("tipo-compensacao");
  const modalidadesList = document.getElementById("lista-modalidades");
  const detalhesDiv = document.getElementById("detalhes-modalidade");
  const normasDiv = document.getElementById("normas-relacionadas");
  const siscalBtnContainer = document.getElementById("siscal-btn-container");

  if (!tipoSelect) {
    console.error(
      "ERRO CRÍTICO: Elemento 'tipo-compensacao' não encontrado no HTML."
    );
    return;
  }

  const isProduction = window.env.NODE_ENV === "production";

  const API_BASE_URL = isProduction
    ? window.env.API_URL_PROD
    : window.env.API_URL_DEV;

  let tipos = [],
    modalidades = [],
    normas = [];

  const fetchData = async (endpoint) => {
    try {
      const response = await fetch(`${API_BASE_URL}/${endpoint}`);
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      return (await response.json()).data;
    } catch (error) {
      console.error(`Falha ao buscar ${endpoint}:`, error);
      modalidadesList.innerHTML = `<li>Erro ao carregar dados. Verifique o console.</li>`;
      return [];
    }
  };

  const loadInitialData = async () => {
    [tipos, modalidades, normas] = await Promise.all([
      fetchData("tipos"),
      fetchData("modalidades"),
      fetchData("normas"),
    ]);

    tipoSelect.innerHTML = '<option value="">-- Selecione um Tipo --</option>';

    tipos.forEach((tipo) => {
      const option = document.createElement("option");
      option.value = tipo.id;
      option.textContent = tipo.nome;
      tipoSelect.appendChild(option);
    });
  };

  const displayModalidades = async (tipoId) => {
    detalhesDiv.style.display = "none";
    modalidadesList.innerHTML = "";

    // Always hide button here
    siscalBtnContainer.style.display = "none";
    siscalBtnContainer.innerHTML = "";

    const filteredModalidades = modalidades.filter((m) => m.tipo_id == tipoId);
    if (filteredModalidades.length === 0) {
      if (tipoId)
        modalidadesList.innerHTML =
          "<li>Nenhuma modalidade encontrada para este tipo.</li>";
    } else {
      filteredModalidades.forEach((modalidade) => {
        const li = document.createElement("li");
        li.textContent = modalidade.nome;
        li.dataset.id = modalidade.id;

        li.addEventListener("click", () => {
          document
            .querySelectorAll("#lista-modalidades li")
            .forEach((item) => item.classList.remove("active"));
          li.classList.add("active");
          displayDetalhes(modalidade.id);
        });

        modalidadesList.appendChild(li);
      });
    }

    if (!tipoId) {
      normasDiv.style.display = "none";
      return;
    }

    const tipo = tipos.find((t) => t.id == tipoId);
    if (!tipo) return;

    const normasRelacionadas = await fetchData(`tipos/${tipoId}/normas`);

    const normasListUl = normasDiv.querySelector("ul");
    normasListUl.innerHTML = "";

    if (normasRelacionadas.length > 0) {
      normasRelacionadas.forEach((norma) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = norma.link;
        a.textContent = norma.nome;
        a.target = "_blank";
        li.appendChild(a);
        normasListUl.appendChild(li);
      });
      normasDiv.style.display = "block";
    } else {
      normasDiv.style.display = "none";
    }
  };

  const displayDetalhes = (modalidadeId) => {
    const modalidade = modalidades.find((m) => m.id == modalidadeId);
    const tipo = tipos.find((t) => t.id == modalidade.tipo_id);
    if (!modalidade || !tipo) return;

    let detalhesHtml = `<h3>${modalidade.nome}</h3>`;

    const campos = {
      Proporção: modalidade.proporcao,
      Forma: modalidade.forma,
      "Especificidades da Área": modalidade.especificidades,
      Vantagens: modalidade.vantagens,
      Desvantagens: modalidade.desvantagens,
      "Documentos Necessários": modalidade.documentos,
      Observações: modalidade.observacao,
    };

    for (const [chave, valor] of Object.entries(campos)) {
      if (valor && valor.trim() !== "")
        detalhesHtml += `<strong>${chave}:</strong><p>${valor.replace(
          /\n/g,
          "<br>"
        )}</p>`;
    }

    detalhesDiv.innerHTML = detalhesHtml;
    detalhesDiv.style.display = "block";

    // Show button ONLY if SNUC and Pagamento are selected
    siscalBtnContainer.style.display = "none";
    siscalBtnContainer.innerHTML = "";

    if (
      tipo &&
      tipo.nome.trim().toUpperCase() === "SNUC" &&
      modalidade.nome.trim().toUpperCase() === "PAGAMENTO"
    ) {
      siscalBtnContainer.innerHTML = `
        <a href="https://siscal.netlify.app/" target="_blank" class="siscal-btn" style="display:inline-block;padding:10px 20px;background:#1976d2;color:#fff;border:none;border-radius:4px;text-decoration:none;font-weight:bold;">Cálculo de Compensação</a>
      `;
      siscalBtnContainer.style.display = "block";
    }
  };

  tipoSelect.addEventListener("change", () =>
    displayModalidades(tipoSelect.value)
  );

  await loadInitialData();
});
