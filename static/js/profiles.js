import { api } from "./api.js";
import { $, showToast, toggleDbFields } from "./ui.js";

let cachedProfiles = {};

export async function loadProfilesDropdown() {
  try {
    cachedProfiles = await api.getProfiles();
    const select = $("saved-profiles");
    select.innerHTML = '<option value="">-- Perfis Salvos --</option>';

    Object.keys(cachedProfiles)
      .sort()
      .forEach((name) => {
        select.add(new Option(name, name));
      });
  } catch (err) {
    console.error("Erro ao carregar perfis:", err);
  }
}

export function initProfiles() {
  loadProfilesDropdown();

  $("btn-save-profile").addEventListener("click", async () => {
    const name = prompt("Nome do cliente/perfil (Ex: Padaria Central - MySQL):");
    if (!name || !name.trim()) return;

    const config = {
      db_type: $("db-type").value,
      host: $("db-host").value,
      port: $("db-port").value,
      user: $("db-user").value,
      password: $("db-pass").value,
      database: $("db-name").value,
      charset: $("db-charset").value,
    };

    try {
      await api.saveProfile(name.trim(), config);
      await loadProfilesDropdown();
      $("saved-profiles").value = name.trim();
      showToast(`Perfil "${name.trim()}" salvo em perfis_clientes.json.`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  $("saved-profiles").addEventListener("change", (e) => {
    const p = cachedProfiles[e.target.value];
    if (!p) return;

    $("db-type").value = p.db_type;
    $("db-host").value = p.host;
    $("db-port").value = p.port;
    $("db-user").value = p.user;
    $("db-pass").value = p.password;
    $("db-name").value = p.database;
    $("db-charset").value = p.charset || "utf8mb4";
    toggleDbFields();
  });

  $("btn-del-profile").addEventListener("click", async () => {
    const name = $("saved-profiles").value;
    if (!name) return;
    if (!confirm(`Excluir o perfil "${name}"?`)) return;

    try {
      await api.deleteProfile(name);
      await loadProfilesDropdown();
      showToast("Perfil removido.");
    } catch (err) {
      showToast(err.message, true);
    }
  });
}
