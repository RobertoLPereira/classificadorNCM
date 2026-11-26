import { state } from "./state.js";
import { $ } from "./ui.js";

const OPERATORS = [
  ["contains", "CONTÉM"],
  ["not_contains", "NÃO CONTÉM"],
  ["equals", "IGUAL A"],
  ["starts_with", "COMEÇA COM"],
  ["is_empty", "ESTÁ VAZIO / NULO"],
];

export function addFilterRow() {
  const row = document.createElement("div");
  row.className = "filter-row";

  const colSel = document.createElement("select");
  state.columns.forEach((c) => {
    const opt = new Option(c.name, c.name);
    const lower = c.name.toLowerCase();
    if (lower.includes("desc") || lower.includes("nome")) opt.selected = true;
    colSel.add(opt);
  });

  const opSel = document.createElement("select");
  OPERATORS.forEach(([val, label]) => opSel.add(new Option(label, val)));

  const valInput = document.createElement("input");
  valInput.type = "text";
  valInput.placeholder = "Valor (ex: bolo)";

  opSel.addEventListener("change", () => {
    valInput.disabled = opSel.value === "is_empty";
    if (valInput.disabled) valInput.value = "";
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn-danger-outline";
  delBtn.textContent = "X";
  delBtn.onclick = () => row.remove();

  row.append(colSel, opSel, valInput, delBtn);
  $("filters-container").appendChild(row);
}

export function getFiltersPayload() {
  return Array.from(document.querySelectorAll(".filter-row")).map((row) => {
    const [colSel, opSel, valInput] = row.querySelectorAll("select, input");
    return {
      column: colSel.value,
      operator: opSel.value,
      value: valInput.value,
    };
  });
}
