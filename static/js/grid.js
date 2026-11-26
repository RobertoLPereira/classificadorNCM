import { state } from "./state.js";
import { $ } from "./ui.js";

export function updateSelectionUI() {
  const count = state.selectedIds.size;
  $("selected-counter").textContent = `${count} selecionado(s)`;
  $("btn-apply-ncm").disabled = count === 0;
}

function toggleRowSelection(id, isSelected, trElement) {
  const originalRow = state.rows.find((r) => String(r[state.pkColumn]) === id);
  const typedId = originalRow ? originalRow[state.pkColumn] : id;

  if (isSelected) {
    state.selectedIds.add(typedId);
    trElement.classList.add("selected-row");
  } else {
    state.selectedIds.delete(typedId);
    trElement.classList.remove("selected-row");
  }
  updateSelectionUI();
}

export function renderTable(cols) {
  const thead = $("results-thead");
  const tbody = $("results-tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const displayCols = Array.from(new Set([state.pkColumn, ...cols]));

  // Cabeçalho
  const trHead = document.createElement("tr");
  const thChk = document.createElement("th");
  const chkAll = document.createElement("input");
  chkAll.type = "checkbox";

  chkAll.addEventListener("change", (e) => {
    const checked = e.target.checked;
    tbody.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = checked;
      toggleRowSelection(cb.dataset.id, checked, cb.closest("tr"));
    });
  });

  thChk.appendChild(chkAll);
  trHead.appendChild(thChk);

  displayCols.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col === state.targetColumn ? `${col} (ALVO NCM)` : col;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  // Linhas
  state.rows.forEach((row) => {
    const pkVal = String(row[state.pkColumn]);
    const tr = document.createElement("tr");

    const tdChk = document.createElement("td");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.id = pkVal;
    cb.addEventListener("change", (e) =>
      toggleRowSelection(pkVal, e.target.checked, tr)
    );
    tdChk.appendChild(cb);
    tr.appendChild(tdChk);

    displayCols.forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] ?? "";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  updateSelectionUI();
}
