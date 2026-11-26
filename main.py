import os
import sys
import json
import webbrowser
from datetime import datetime
from typing import List, Optional, Any, Dict
from urllib.parse import quote_plus

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import (
    create_engine,
    inspect,
    MetaData,
    Table,
    select,
    update,
    and_,
    or_,
    not_,
    cast,
    String,
)

# Ajuste de caminho para funcionar tanto em desenvolvimento quanto empacotado no PyInstaller
def get_base_path() -> str:
    if getattr(sys, "frozen", False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()
STATIC_DIR = os.path.join(BASE_PATH, "static")
BACKUP_DIR = os.path.join(os.getcwd(), "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

app = FastAPI(title="Classificador NCM PDV")

# Estado em memória da conexão ativa
db_state: Dict[str, Any] = {
    "engine": None,
    "metadata": None,
    "db_type": None,
}

# --- Modelos de Entrada (Payload JSON) ---

class ConnectionConfig(BaseModel):
    db_type: str  # "mysql", "postgresql", "sqlite"
    host: Optional[str] = "localhost"
    port: Optional[int] = None
    user: Optional[str] = ""
    password: Optional[str] = ""
    database: str  # Nome do banco ou caminho do arquivo .db/.sqlite
    charset: Optional[str] = "utf8mb4"  # Útil para MySQL legado (ex: latin1)

class FilterCondition(BaseModel):
    column: str
    operator: str  # "contains", "not_contains", "equals", "starts_with", "is_empty"
    value: Optional[str] = ""

class SearchRequest(BaseModel):
    table_name: str
    columns: List[str]
    pk_column: str
    logic: str = "AND"  # "AND" ou "OR"
    filters: List[FilterCondition] = []
    limit: int = 200

class BatchUpdateRequest(BaseModel):
    table_name: str
    pk_column: str
    target_column: str
    new_ncm: str
    format_with_dots: bool = False
    ids: List[Any]
    extra_fields: Optional[Dict[str, Any]] = None  # Ex: {"sincronizado": "N"}

# --- Rotas da API ---

@app.post("/api/connect")
def connect_db(cfg: ConnectionConfig):
    try:
        db_type = cfg.db_type.lower()
        if db_type == "sqlite":
            if not os.path.exists(cfg.database):
                raise HTTPException(status_code=400, detail="Arquivo SQLite não encontrado.")
            url = f"sqlite:///{cfg.database}"
        elif db_type == "mysql":
            port = cfg.port or 3306
            pwd = quote_plus(cfg.password or "")
            url = f"mysql+pymysql://{cfg.user}:{pwd}@{cfg.host}:{port}/{cfg.database}?charset={cfg.charset}"
        elif db_type == "postgresql":
            port = cfg.port or 5432
            pwd = quote_plus(cfg.password or "")
            url = f"postgresql+psycopg2://{cfg.user}:{pwd}@{cfg.host}:{port}/{cfg.database}"
        else:
            raise HTTPException(status_code=400, detail="Tipo de banco não suportado.")

        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            pass  # Testa conexão real

        db_state["engine"] = engine
        db_state["metadata"] = MetaData()
        db_state["db_type"] = db_type

        inspector = inspect(engine)
        tables = sorted(inspector.get_table_names())
        return {"status": "connected", "tables": tables}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar: {str(e)}")


@app.get("/api/tables/{table_name}/columns")
def get_table_columns(table_name: str):
    engine = db_state.get("engine")
    if not engine:
        raise HTTPException(status_code=400, detail="Banco de dados não conectado.")

    try:
        inspector = inspect(engine)
        columns_info = inspector.get_columns(table_name)
        pk_info = inspector.get_pk_constraint(table_name)
        pk_cols = pk_info.get("constrained_columns", [])

        columns = [
            {
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col.get("nullable", True),
                "is_pk": col["name"] in pk_cols,
            }
            for col in columns_info
        ]
        suggested_pk = pk_cols[0] if pk_cols else (columns[0]["name"] if columns else "")
        return {"columns": columns, "suggested_pk": suggested_pk}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler colunas: {str(e)}")


@app.post("/api/query")
def query_products(req: SearchRequest):
    engine = db_state.get("engine")
    if not engine:
        raise HTTPException(status_code=400, detail="Banco de dados não conectado.")

    try:
        metadata = MetaData()
        table = Table(req.table_name, metadata, autoload_with=engine)

        # Garante que a PK sempre venha no SELECT para identificar os checkboxes
        selected_cols = list(dict.fromkeys([req.pk_column] + req.columns))
        cols_to_fetch = [table.c[c] for c in selected_cols if c in table.c]

        stmt = select(*cols_to_fetch)

        clauses = []
        for f in req.filters:
            if f.column not in table.c:
                continue
            col_obj = cast(table.c[f.column], String)
            val = (f.value or "").strip()

            if f.operator == "contains" and val:
                clauses.append(col_obj.ilike(f"%{val}%"))
            elif f.operator == "not_contains" and val:
                clauses.append(not_(col_obj.ilike(f"%{val}%")))
            elif f.operator == "equals" and val:
                clauses.append(col_obj == val)
            elif f.operator == "starts_with" and val:
                clauses.append(col_obj.ilike(f"{val}%"))
            elif f.operator == "is_empty":
                clauses.append(or_(table.c[f.column].is_(None), col_obj == ""))

        if clauses:
            stmt = stmt.where(and_(*clauses) if req.logic.upper() == "AND" else or_(*clauses))

        stmt = stmt.limit(req.limit)

        with engine.connect() as conn:
            result = conn.execute(stmt)
            rows = [dict(row._mapping) for row in result]

        return {"total": len(rows), "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na consulta: {str(e)}")


@app.post("/api/update-ncm")
def update_ncm_batch(req: BatchUpdateRequest):
    engine = db_state.get("engine")
    if not engine:
        raise HTTPException(status_code=400, detail="Banco de dados não conectado.")

    if not req.ids:
        raise HTTPException(status_code=400, detail="Nenhum registro selecionado.")

    # Limpa e valida os 8 dígitos da NCM
    digits = "".join(filter(str.isdigit, req.new_ncm))
    if len(digits) != 8:
        raise HTTPException(status_code=400, detail="A NCM deve conter exatamente 8 dígitos numéricos.")

    formatted_ncm = (
        f"{digits[:4]}.{digits[4:6]}.{digits[6:]}" if req.format_with_dots else digits
    )

    try:
        metadata = MetaData()
        table = Table(req.table_name, metadata, autoload_with=engine)

        if req.pk_column not in table.c or req.target_column not in table.c:
            raise HTTPException(status_code=400, detail="Coluna chave ou coluna destino inválida.")

        pk_col = table.c[req.pk_column]
        target_col = table.c[req.target_column]

        # 1. Backup automático antes da alteração
        backup_stmt = select(pk_col, target_col).where(pk_col.in_(req.ids))
        with engine.connect() as conn:
            old_records = [dict(r._mapping) for r in conn.execute(backup_stmt)]

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"backup_{req.table_name}_{timestamp}.json")
        with open(backup_file, "w", encoding="utf-8") as bf:
            json.dump(
                {
                    "table": req.table_name,
                    "pk_column": req.pk_column,
                    "target_column": req.target_column,
                    "applied_ncm": formatted_ncm,
                    "previous_values": old_records,
                },
                bf,
                ensure_ascii=False,
                indent=2,
                default=str,
            )

        # 2. Execução do UPDATE em transação única
        values_to_update = {req.target_column: formatted_ncm}
        if req.extra_fields:
            for k, v in req.extra_fields.items():
                if k in table.c:
                    values_to_update[k] = v

        upd_stmt = (
            update(table)
            .where(pk_col.in_(req.ids))
            .values(**values_to_update)
        )

        with engine.begin() as conn:
            res = conn.execute(upd_stmt)

        return {
            "status": "success",
            "updated_count": res.rowcount,
            "applied_ncm": formatted_ncm,
            "backup_file": backup_file,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar NCM: {str(e)}")

TERMS_FILE = os.path.join(os.getcwd(), "termos_ncm.json")

class TermRule(BaseModel):
    id: Optional[str] = None
    ncm: str
    descricao_ncm: str
    termos_incluir: List[str]
    termos_excluir: List[str] = []

def load_terms() -> List[Dict[str, Any]]:
    if not os.path.exists(TERMS_FILE):
        return []
    try:
        with open(TERMS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_terms(data: List[Dict[str, Any]]):
    with open(TERMS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.get("/api/terms")
def get_terms():
    terms = load_terms()
    # Ordena pelos mais usados primeiro
    return sorted(terms, key=lambda x: x.get("usos", 0), reverse=True)

@app.post("/api/terms")
def upsert_term(rule: TermRule):
    digits = "".join(filter(str.isdigit, rule.ncm))
    if len(digits) != 8:
        raise HTTPException(status_code=400, detail="NCM inválido (precisa ter 8 dígitos).")

    formatted_ncm = f"{digits[:4]}.{digits[4:6]}.{digits[6:]}"
    terms = load_terms()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Normaliza termos em minúsculo e sem vazios
    inc = [t.strip().lower() for t in rule.termos_incluir if t.strip()]
    exc = [t.strip().lower() for t in rule.termos_excluir if t.strip()]

    if not inc:
        raise HTTPException(status_code=400, detail="Informe pelo menos um termo de inclusão.")

    # Verifica se já existe regra idêntica (mesmo NCM e mesmos termos) para incrementar uso
    existing = next(
        (t for t in terms if t["ncm"] == formatted_ncm and set(t["termos_incluir"]) == set(inc)),
        None,
    )

    if existing:
        existing["descricao_ncm"] = rule.descricao_ncm.strip() or existing["descricao_ncm"]
        existing["termos_excluir"] = exc
        existing["usos"] = existing.get("usos", 1) + 1
        existing["atualizado_em"] = now_str
    else:
        terms.append({
            "id": str(int(datetime.now().timestamp() * 1000)),
            "ncm": formatted_ncm,
            "descricao_ncm": rule.descricao_ncm.strip() or f"NCM {formatted_ncm}",
            "termos_incluir": inc,
            "termos_excluir": exc,
            "usos": 1,
            "atualizado_em": now_str,
        })

    save_terms(terms)
    return {"status": "saved", "total": len(terms)}

@app.delete("/api/terms/{term_id}")
def delete_term(term_id: str):
    terms = [t for t in load_terms() if t.get("id") != term_id]
    save_terms(terms)
    return {"status": "deleted"}
PROFILES_FILE = os.path.join(os.getcwd(), "perfis_clientes.json")

class ProfilePayload(BaseModel):
    name: str
    config: Dict[str, Any]

def load_profiles() -> Dict[str, Any]:
    if not os.path.exists(PROFILES_FILE):
        return {}
    try:
        with open(PROFILES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_profiles(data: Dict[str, Any]):
    with open(PROFILES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.get("/api/profiles")
def get_profiles_api():
    return load_profiles()

@app.post("/api/profiles")
def save_profile_api(payload: ProfilePayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome do perfil é obrigatório.")
    profiles = load_profiles()
    profiles[name] = payload.config
    save_profiles(profiles)
    return {"status": "saved"}

@app.delete("/api/profiles/{profile_name}")
def delete_profile_api(profile_name: str):
    profiles = load_profiles()
    if profile_name in profiles:
        del profiles[profile_name]
        save_profiles(profiles)
    return {"status": "deleted"}
import urllib.request

NCM_TABLE_FILE = os.path.join(os.getcwd(), "tabela_ncm_siscomex.json")
SISCOMEX_NCM_URL = "https://siscomex.gov.br"
ncm_cache: List[Dict[str, str]] = []

BUNDLED_NCM_FILE = os.path.join(STATIC_DIR, "tabela_ncm_siscomex.json")

class NcmImportPayload(BaseModel):
    content: Dict[str, Any]

def load_ncm_catalog() -> List[Dict[str, str]]:
    global ncm_cache
    if ncm_cache:
        return ncm_cache

    target_file = NCM_TABLE_FILE if os.path.exists(NCM_TABLE_FILE) else BUNDLED_NCM_FILE
    if not os.path.exists(target_file):
        return []

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            raw = json.load(f)
        items = raw.get("Nomenclaturas", [])
        ncm_cache = [
            {
                "codigo": item["Codigo"],
                "digits": "".join(filter(str.isdigit, item["Codigo"])),
                "descricao": item["Descricao"],
            }
            for item in items
            if len("".join(filter(str.isdigit, item.get("Codigo", "")))) == 8
        ]
        return ncm_cache
    except Exception:
        return []

@app.post("/api/ncm-catalog/import")
def import_ncm_catalog(payload: NcmImportPayload):
    global ncm_cache
    if "Nomenclaturas" not in payload.content:
        raise HTTPException(
            status_code=400,
            detail="Arquivo JSON inválido. Esperado formato oficial do Siscomex ('Nomenclaturas').",
        )
    try:
        with open(NCM_TABLE_FILE, "w", encoding="utf-8") as f:
            json.dump(payload.content, f, ensure_ascii=False)
        ncm_cache = []
        catalog = load_ncm_catalog()
        return {"status": "imported", "total_ncms": len(catalog)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar tabela NCM: {str(e)}")
    
@app.post("/api/ncm-catalog/sync")
def sync_ncm_catalog():
    global ncm_cache
    try:
        req = urllib.request.Request(
            SISCOMEX_NCM_URL,
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            content = resp.read().decode("utf-8")
        with open(NCM_TABLE_FILE, "w", encoding="utf-8") as f:
            f.write(content)
        ncm_cache = []
        catalog = load_ncm_catalog()
        return {"status": "synced", "total_ncms": len(catalog)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao baixar tabela do Siscomex: {str(e)}")

@app.get("/api/ncm-catalog/search")
def search_ncm_catalog(chapters: str = "", q: str = "", limit: int = 1500):
    catalog = load_ncm_catalog()
    if not catalog:
        return {"loaded": False, "total": 0, "showing": 0, "items": []}

    chapter_list = [c.strip() for c in chapters.split(",") if c.strip()]
    query = q.strip().lower()

    matched = []
    for item in catalog:
        if chapter_list and item["digits"][:2] not in chapter_list:
            continue
        if query and (
            query not in item["descricao"].lower()
            and query not in item["digits"]
            and query not in item["codigo"]
        ):
            continue
        matched.append(item)

    return {
        "loaded": True,
        "total": len(matched),
        "showing": min(len(matched), limit),
        "items": matched[:limit],
    }

# --- Servir Frontend Estático (PWA) ---

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    port = 8000
    webbrowser.open(f"http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
