import { api } from "./api.js";
import { $, showToast } from "./ui.js";
import { SUPERMARKET_SECTORS } from "./sectors.js";

export function initSiscomexTab() {
  const sectorSelect = $("siscomex-sector");
  if (!sectorSelect) return;

  SUPERMARKET_SECTORS.forEach((s, idx) => {
    const label = `${s.setor} (Cap. ${s.capitulos.join(", ")})`;
    sectorSelect.add(new Option(label, idx));
  });

  // Alternância entre abas principais
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      $("tab-classificacao").classList.toggle("hidden", target !== "classificacao");
      $("tab-siscomex").classList.toggle("hidden", target !== "siscomex");
      $("tab-ajuda").classList.toggle("hidden", target !== "ajuda");
    });
  });

  // Baixar / Atualizar JSON oficial do Siscomex
  const fileInput = $("file-siscomex");

  $("btn-import-siscomex")?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const btn = $("btn-import-siscomex");
    btn.disabled = true;
    btn.textContent = "Importando...";

    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text);
      const res = await api.importSiscomex(parsedJson);
      showToast(`Tabela importada! ${res.total_ncms} NCMs válidos carregados.`);
      searchCatalog();
    } catch (err) {
      showToast(`Falha ao importar JSON: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Importar JSON";
      fileInput.value = "";
    }
  });

  async function searchCatalog() {
    const sectorIdx = sectorSelect.value;
    const chapters = sectorIdx !== "" ? SUPERMARKET_SECTORS[sectorIdx].capitulos.join(",") : "";
    const q = $("siscomex-query").value.trim();

    try {
      const data = await api.searchSiscomex(chapters, q);
      const tbody = $("siscomex-tbody");
      tbody.innerHTML = "";

      if (!data.loaded) {
        tbody.innerHTML = `<tr><td colspan="3">Base local não encontrada. Clique em <strong>Atualizar Base Siscomex</strong> acima.</td></tr>`;
        return;
      }

      data.items.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${item.codigo}</strong></td>
          <td>${item.descricao}</td>
          <td><button type="button" class="btn-primary btn-sm">Usar NCM</button></td>
        `;
        tr.querySelector("button").addEventListener("click", () => {
          $("input-new-ncm").value = item.codigo;
          // Volta automaticamente para a aba de classificação com o NCM preenchido
          document.querySelector('[data-tab="classificacao"]').click();
          showToast(`NCM ${item.codigo} selecionado!`);
        });
        tbody.appendChild(tr);
        const idx = sectorSelect.value;
        const baseHint = idx !== "" ? `Exemplos: ${SUPERMARKET_SECTORS[idx].exemplos}. ` : "";
        const countHint = data.total > data.showing
            ? `Exibindo ${data.showing} de ${data.total} NCMs (digite uma palavra acima para refinar).`
            : `${data.total} NCM(s) encontrado(s).`;
            $("sector-hint").textContent = baseHint + countHint;

      });
    } catch (err) {
      showToast(err.message, true);
    }
  }

  sectorSelect.addEventListener("change", () => {
    const idx = sectorSelect.value;
    $("sector-hint").textContent = idx !== "" ? `Exemplos: ${SUPERMARKET_SECTORS[idx].exemplos}` : "";
    searchCatalog();
  });

  $("btn-search-siscomex")?.addEventListener("click", searchCatalog);
  $("siscomex-query")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchCatalog();
  });

  searchCatalog();
}
