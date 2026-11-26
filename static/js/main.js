import { state } from "./state.js";
import { api } from "./api.js";
import { $, showToast, toggleDbFields, applyNcmMask } from "./ui.js";
import { initProfiles } from "./profiles.js";
import { addFilterRow, getFiltersPayload } from "./filters.js";
import { renderTable } from "./grid.js";
import { initKnowledgeBase } from "./knowledge.js";
import {initSiscomexTab} from "./siscomex.js";

// Registra Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/sw.js").catch(() => {});
}

// Inicializa perfis salvos e listeners básicos
initProfiles();
initKnowledgeBase();
initSiscomexTab();
$("db-type").addEventListener("change", toggleDbFields);
$("btn-add-filter").addEventListener("click", addFilterRow);
$("input-new-ncm").addEventListener("input", (e) => applyNcmMask(e.target));

// 1. Conectar ao Banco
$("form-connect").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    db_type: $("db-type").value,
    host: $("db-host").value,
    port: Number($("db-port").value) || null,
    user: $("db-user").value,
    password: $("db-pass").value,
    database: $("db-name").value.trim(),
    charset: $("db-charset").value,
  };

  try {
    const data = await api.connect(payload);
    $("conn-status").textContent = `Conectado (${payload.db_type.toUpperCase()})`;
    $("conn-status").className = "status connected";

    const selectTable = $("select-table");
    selectTable.innerHTML = '<option value="">Selecione a tabela...</option>';
    data.tables.forEach((t) => selectTable.add(new Option(t, t)));

    $("section-mapping").classList.remove("hidden");
    showToast(`${data.tables.length} tabelas encontradas.`);
  } catch (err) {
    showToast(err.message, true);
  }
});

// 2. Carregar Colunas da Tabela Escolhida
$("select-table").addEventListener("change", async (e) => {
  const table = e.target.value;
  if (!table) return;

  try {
    const data = await api.getColumns(table);
    state.columns = data.columns;

    const pkSelect = $("select-pk");
    const targetSelect = $("select-target-ncm");
    const chkGrid = $("columns-checkboxes");

    pkSelect.innerHTML = "";
    targetSelect.innerHTML = "";
    chkGrid.innerHTML = "";

    data.columns.forEach((col) => {
      pkSelect.add(new Option(`${col.name} (${col.type})`, col.name));
      targetSelect.add(new Option(`${col.name} (${col.type})`, col.name));

      const lower = col.name.toLowerCase();
      if (lower.includes("ncm")) targetSelect.value = col.name;

      const lbl = document.createElement("label");
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.value = col.name;
      if (
        col.is_pk ||
        lower.includes("desc") ||
        lower.includes("nome") ||
        lower.includes("ncm") ||
        lower.includes("cod")
      ) {
        chk.checked = true;
      }
      lbl.append(chk, ` ${col.name}`);
      chkGrid.appendChild(lbl);
    });

    if (data.suggested_pk) {
      pkSelect.value = Array.isArray(data.suggested_pk)
        ? data.suggested_pk[0]
        : data.suggested_pk;
    }

    $("filters-container").innerHTML = "";
    addFilterRow();
    $("section-filters").classList.remove("hidden");
  } catch (err) {
    showToast(err.message, true);
  }
});

// 3. Executar Pesquisa
$("btn-search").addEventListener("click", async () => {
  const pkCol = $("select-pk").value;
  const targetCol = $("select-target-ncm").value;

  const visibleCols = Array.from(
    $("columns-checkboxes").querySelectorAll("input:checked")
  ).map((c) => c.value);

  if (!visibleCols.includes(targetCol)) visibleCols.push(targetCol);

  try {
    const data = await api.queryProducts({
      table_name: $("select-table").value,
      columns: visibleCols,
      pk_column: pkCol,
      logic: $("filter-logic").value,
      filters: getFiltersPayload(),
      limit: Number($("query-limit").value) || 200,
    });

    state.pkColumn = pkCol;
    state.targetColumn = targetCol;
    state.rows = data.rows;
    state.selectedIds.clear();

    renderTable(visibleCols);
    $("section-results").classList.remove("hidden");
    showToast(`${data.total} registros carregados.`);
  } catch (err) {
    showToast(err.message, true);
  }
});

// 4. Aplicar NCM em Lote
$("btn-apply-ncm").addEventListener("click", async () => {
  const rawNcm = $("input-new-ncm").value;
  const digits = rawNcm.replace(/\D/g, "");
  if (digits.length !== 8) {
    showToast("Informe um código NCM válido com 8 dígitos.", true);
    return;
  }

  const count = state.selectedIds.size;
  const confirmMsg = `Confirmar atualização da coluna "${state.targetColumn}" para "${rawNcm}" em ${count} produto(s)?\n\n(Um backup JSON será gerado automaticamente antes da alteração.)`;
  if (!confirm(confirmMsg)) return;

  let extraFields = null;
  const extraRaw = $("input-extra-field").value.trim();
  if (extraRaw.includes("=")) {
    const [k, v] = extraRaw.split("=");
    extraFields = { [k.trim()]: v.trim() };
  }

  try {
    const data = await api.updateNcm({
      table_name: $("select-table").value,
      pk_column: state.pkColumn,
      target_column: state.targetColumn,
      new_ncm: digits,
      format_with_dots: $("chk-format-dots").checked,
      ids: Array.from(state.selectedIds),
      extra_fields: extraFields,
    });

    showToast(
      `Sucesso! ${data.updated_count} registro(s) atualizado(s) para ${data.applied_ncm}.`
    );
    $("btn-search").click();
  } catch (err) {
    showToast(err.message, true);
  }
});
