document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = "http://localhost:3000/api/v2";

  let allNormas = [],
    allTipos = [],
    allModalidades = [];

  let editState = { type: null, id: null };

  // Seletores de Formulários
  const forms = {
    normas: document.getElementById("norma-form"),
    tipos: document.getElementById("tipo-form"),
    modalidades: document.getElementById("modalidade-form"),
  };

  // Funções Genéricas da API
  const fetchData = async (endpoint) =>
    (await fetch(`${API_BASE_URL}/${endpoint}`)).json();

  const sendData = async (endpoint, data, id = null) => {
    const method = id ? "PUT" : "POST";

    const url = id
      ? `${API_BASE_URL}/${endpoint}/${id}`
      : `${API_BASE_URL}/${endpoint}`;

    return fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const deleteData = async (endpoint, id) =>
    fetch(`${API_BASE_URL}/${endpoint}/${id}`, { method: "DELETE" });

  // Funções de Renderização
  const createButton = (className, text, type, id) =>
    `<button class="${className}" data-type="${type}" data-id="${id}">${text}</button>`;

  const renderNormas = () => {
    document.getElementById("normas-list").innerHTML =
      allNormas
        .map(
          (n) =>
            `<li><span>${n.nome}</span><div>${createButton(
              "edit-btn",
              "Editar",
              "normas",
              n.id
            )}${createButton("delete-btn", "X", "normas", n.id)}</div></li>`
        )
        .join("") || "<li>Nenhuma norma cadastrada.</li>";

    document.getElementById("tipo-normas-checkboxes").innerHTML =
      "<label>Vincular Normas:</label>" +
      allNormas
        .map(
          (n) =>
            `<div><input type="checkbox" id="norma-${n.id}" value="${n.id}"><label for="norma-${n.id}">${n.nome}</label></div>`
        )
        .join("");
  };

  const renderTipos = () => {
    document.getElementById("tipos-list").innerHTML =
      allTipos
        .map(
          (t) =>
            `<li><span>${t.nome}</span><div>${createButton(
              "edit-btn",
              "Editar",
              "tipos",
              t.id
            )}${createButton("delete-btn", "X", "tipos", t.id)}</div></li>`
        )
        .join("") || "<li>Nenhum tipo cadastrado.</li>";

    document.getElementById("modalidade-tipo-select").innerHTML =
      '<option value="">-- Selecione o Tipo --</option>' +
      allTipos
        .map((t) => `<option value="${t.id}">${t.nome}</option>`)
        .join("");
  };

  const renderModalidades = () => {
    document.getElementById("modalidades-list").innerHTML =
      allModalidades
        .map((m) => {
          const tipo = allTipos.find((t) => t.id == m.tipo_id);
          return `<li><span><strong>${m.nome}</strong> (Tipo: ${
            tipo ? tipo.nome : "N/A"
          })</span><div>${createButton(
            "edit-btn",
            "Editar",
            "modalidades",
            m.id
          )}${createButton("delete-btn", "X", "modalidades", m.id)}</div></li>`;
        })
        .join("") || "<li>Nenhuma modalidade cadastrada.</li>";
  };

  // Funções de Gerenciamento de Formulário
  const resetForm = (form) => {
    form.reset();
    const type = form.id.split("-")[0] + "s";
    form.querySelector('button[type="submit"]').textContent = `Salvar`;
    const cancelButton = form.querySelector(".cancel-edit-btn");
    if (cancelButton) cancelButton.remove();
    editState = { type: null, id: null };
  };

  const populateFormForEdit = (type, id) => {
    const form = forms[type];

    const dataMap = {
      normas: allNormas,
      tipos: allTipos,
      modalidades: allModalidades,
    };

    const item = dataMap[type].find((i) => i.id == id);
    if (!item) return;

    Object.values(forms).forEach((f) => resetForm(f)); // Limpa todos os outros forms
    editState = { type, id };

    // CORREÇÃO: Mapeia nomes de campo do formulário para chaves do item de dados
    const fieldMapping = {
      "norma-nome": "nome",
      "norma-link": "link",
      "norma-preambulo": "preambulo",
      "tipo-nome": "nome",
      "modalidade-tipo-select": "tipo_id",
      "modalidade-nome": "nome",
      "modalidade-proporcao": "proporcao",
      "modalidade-forma": "forma",
      "modalidade-especificidades": "especificidades",
      "modalidade-vantagens": "vantagens",
      "modalidade-desvantagens": "desvantagens",
      "modalidade-observacao": "observacao",
      "modalidade-documentos": "documentos",
    };

    for (const element of form.elements) {
      const dataKey = fieldMapping[element.id];

      if (dataKey) {
        element.value = item[dataKey] || "";
      }
    }

    if (type === "tipos") {
      const ids = (item.norma_ids || "").split(",");

      form
        .querySelectorAll("#tipo-normas-checkboxes input")
        .forEach((cb) => (cb.checked = ids.includes(cb.value)));
    }

    form.querySelector('button[type="submit"]').textContent = "Atualizar";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar Edição";
    cancelButton.className = "cancel-edit-btn";
    cancelButton.onclick = () => resetForm(form);
    form.appendChild(cancelButton);
    form.scrollIntoView({ behavior: "smooth" });
  };

  const carregarTudo = async () => {
    try {
      [{ data: allNormas }, { data: allTipos }, { data: allModalidades }] =
        await Promise.all([
          fetchData("normas"),
          fetchData("tipos"),
          fetchData("modalidades"),
        ]);

      renderNormas();
      renderTipos();
      renderModalidades();
    } catch (error) {
      alert("Não foi possível carregar os dados do servidor.");
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    // CORREÇÃO: O endpoint deve ser plural
    const type = form.id.split("-")[0] + "s";
    let data;

    if (type === "normas")
      data = {
        nome: form.elements["norma-nome"].value,
        link: form.elements["norma-link"].value,
        preambulo: form.elements["norma-preambulo"].value,
      };

    if (type === "tipos") {
      data = {
        nome: form.elements["tipo-nome"].value,
      };

      const normasAssociadas = Array.from(
        form.querySelectorAll("#tipo-normas-checkboxes input:checked")
      ).map((checkbox) => Number(checkbox.value));

      const response = await sendData(type, data, editState.id);

      if (response.ok) {
        const tipoId = editState.id || (await response.json()).id;

        // Create associations with normas
        await Promise.all(
          normasAssociadas.map(async (normaId) => {
            await sendData("normas-tipos-compensacao", {
              tipo_id: tipoId,
              norma_id: normaId,
            });
          })
        );

        alert(`Item ${editState.id ? "atualizado" : "salvo"} com sucesso!`);
        resetForm(form);
        carregarTudo();
      } else {
        alert("Erro ao salvar o item.");
      }

      return;
    }

    if (type === "modalidades")
      data = {
        tipo_id: form.elements["modalidade-tipo-select"].value,
        nome: form.elements["modalidade-nome"].value,
        proporcao: form.elements["modalidade-proporcao"].value,
        forma: form.elements["modalidade-forma"].value,
        especificidades: form.elements["modalidade-especificidades"].value,
        vantagens: form.elements["modalidade-vantagens"].value,
        desvantagens: form.elements["modalidade-desvantagens"].value,
        observacao: form.elements["modalidade-observacao"].value,
        documentos: form.elements["modalidade-documentos"].value,
      };

    const response = await sendData(type, data, editState.id);

    if (response.ok) {
      alert(`Item ${editState.id ? "atualizado" : "salvo"} com sucesso!`);
      resetForm(form);
      carregarTudo();
    } else {
      alert("Erro ao salvar o item.");
    }
  };

  Object.values(forms).forEach((form) =>
    form.addEventListener("submit", handleFormSubmit)
  );

  document
    .querySelector(".admin-container")
    .addEventListener("click", async (e) => {
      const button = e.target;
      const { type, id } = button.dataset;
      if (!type || !id) return;

      if (button.classList.contains("edit-btn")) {
        populateFormForEdit(type, id);
      }

      if (
        button.classList.contains("delete-btn") &&
        confirm("Tem certeza que deseja deletar este item?")
      ) {
        const response = await deleteData(type, id);
        if (response.ok) {
          alert("Item deletado com sucesso!");

          if (editState.id == id) {
            const formType = editState.type;
            resetForm(forms[formType]);
          }
          carregarTudo();
        } else {
          alert("Erro ao deletar o item.");
        }
      }
    });

  carregarTudo();
});
