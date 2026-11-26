
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Erro na comunicação com o servidor.");
  }
  return data;
}

export const api = {
  connect: (payload) =>
    request("/api/connect", { method: "POST", body: JSON.stringify(payload) }),

  getColumns: (table) =>
    request(`/api/tables/${encodeURIComponent(table)}/columns`),

  queryProducts: (payload) =>
    request("/api/query", { method: "POST", body: JSON.stringify(payload) }),

  updateNcm: (payload) =>
    request("/api/update-ncm", { method: "POST", body: JSON.stringify(payload) }),
  
  getTerms: () => request("/api/terms"),

  saveTerm: (payload) =>
    request("/api/terms", { method: "POST", body: JSON.stringify(payload) }),

  deleteTerm: (id) =>
    request(`/api/terms/${encodeURIComponent(id)}`, { method: "DELETE" }),

    getProfiles: () => request("/api/profiles"),

  saveProfile: (name, config) =>
    request("/api/profiles", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    }),

  deleteProfile: (name) =>
    request(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" }),

    importSiscomex: (content) =>
    request("/api/ncm-catalog/import", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  searchSiscomex: (chapters, q) =>
    request(`/api/ncm-catalog/search?chapters=${encodeURIComponent(chapters)}&q=${encodeURIComponent(q)}`),

};
