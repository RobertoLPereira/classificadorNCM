export const $ = (id) => document.getElementById(id);

export function showToast(msg, isError = false) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.style.background = isError ? "#991b1b" : "#111827";
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 4500);
}

export function toggleDbFields() {
  const isSqlite = $("db-type").value === "sqlite";
  document.querySelectorAll(".server-field").forEach((el) => {
    el.classList.toggle("hidden", isSqlite);
  });
  $("lbl-database").textContent = isSqlite
    ? "Caminho do arquivo (.db / .sqlite)"
    : "Nome do Banco";

  if (!isSqlite) {
    $("db-port").value = $("db-type").value === "mysql" ? 3306 : 5432;
  }
}

export function applyNcmMask(inputElement) {
  let digits = inputElement.value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 6) {
    inputElement.value = `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  } else if (digits.length > 4) {
    inputElement.value = `${digits.slice(0, 4)}.${digits.slice(4)}`;
  } else {
    inputElement.value = digits;
  }
}
