import { api } from "./api.js";
import { state } from "./state.js";
import { $, showToast } from "./ui.js";
import { addFilterRow, getFiltersPayload } from "./filters.js";

let cachedTerms = [];

export async function loadKnowledgeBase() {
  try {
    cachedTerms = await api.getTerms();
    renderKnowledgeSelect();
  } catch (err) {
    console.error(err);
  }
}

function renderKnowledgeSelect() {
  const select = $("select-knowledge");
  if (!select) return;

  select.innerHTML = '<option value="">-- Aplicar Regra da Memória NCM --</option>';
  cachedTerms.forEach((item) => {
    const incText = item.termos_incluir.join(" + ");
    const excText = item.termos_excluir.length ? ` (exceto: ${item.termos_excluir.join(", ")})` : "";
    const label = `[${item.ncm}] ${item.descricao_ncm} -> ${incText}${excText}`;
    select.add(new Option(label, item.id));
  });
}

export function initKnowledgeBase() {
  loadKnowledgeBase();

  // Botão: Aplicar regra salva nos filtros e no campo NCM
  $("btn-use-knowledge")?.addEventListener("click", () => {
    const id = $("select-knowledge").value;
    const rule = cachedTerms.find((t) => t.id === id);
    if (!rule) {
      showToast("Selecione uma regra salva na lista.", true);
      return;
    }

    // Descobre a coluna padrão de descrição na tabela atual
        const descCol =
      state.columns.find((c) => {
        const l = c.name.toLowerCase();
        return l.includes("desc") || l.includes("nome") || l.includes("prod");
      })?.name || state.columns?.[0]?.name;

    if (!descCol) {
      showToast("Conecte e selecione uma tabela antes de aplicar a regra.", true);
      return;
    }

    // Limpa filtros atuais e recria com os termos da memória
    const container = $("filters-container");
    container.innerHTML = "";
    $("filter-logic").value = "AND";

    rule.termos_incluir.forEach((term) => {
      addFilterRow();
      const lastRow = container.lastElementChild;
      const [colSel, opSel, valInput] = lastRow.querySelectorAll("select, input");
      colSel.value = descCol;
      opSel.value = "contains";
      valInput.value = term;
    });

    rule.termos_excluir.forEach((term) => {
      addFilterRow();
      const lastRow = container.lastElementChild;
      const [colSel, opSel, valInput] = lastRow.querySelectorAll("select, input");
      colSel.value = descCol;
      opSel.value = "not_contains";
      valInput.value = term;
    });

    // Preenche o campo NCM destino e dispara a pesquisa automaticamente
    $("input-new-ncm").value = rule.ncm;
    showToast(`Regra "${rule.descricao_ncm}" aplicada. Pesquisando...`);
    $("btn-search").click();
  });

  // Botão: Salvar filtro + NCM atual na memória
  $("btn-save-knowledge")?.addEventListener("click", async () => {
    const rawNcm = $("input-new-ncm").value;
    const digits = rawNcm.replace(/\D/g, "");
    if (digits.length !== 8) {
      showToast("Preencha um NCM de 8 dígitos antes de salvar na memória.", true);
      return;
    }

    const currentFilters = getFiltersPayload();
    const inc = currentFilters
      .filter((f) => f.operator === "contains" || f.operator === "starts_with" || f.operator === "equals")
      .map((f) => f.value)
      .filter(Boolean);

    const exc = currentFilters
      .filter((f) => f.operator === "not_contains")
      .map((f) => f.value)
      .filter(Boolean);

    if (!inc.length) {
      showToast("Crie pelo menos um filtro CONTÉM antes de salvar a regra.", true);
      return;
    }

    const desc = prompt(
      `Descrição para lembrar desta regra (NCM ${rawNcm}):\nTermos: ${inc.join(", ")}`,
      inc.join(" ").toUpperCase()
    );
    if (!desc) return;

    try {
      await api.saveTerm({
        ncm: digits,
        descricao_ncm: desc,
        termos_incluir: inc,
        termos_excluir: exc,
      });
      await loadKnowledgeBase();
      showToast("Regra salva na memória (termos_ncm.json)!");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
