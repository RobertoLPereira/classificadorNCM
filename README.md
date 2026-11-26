# Classificador NCM — Multi-PDV

Ferramenta desktop/PWA portátil para saneamento e classificação fiscal de códigos **NCM** em lote, projetada para operar sobre diferentes estruturas de bancos de dados de sistemas PDV (**MySQL/MariaDB**, **PostgreSQL** e **SQLite**).

## Recursos Principais

* **Agnóstico a Schema:** Lê dinamicamente tabelas, colunas, tipos e chaves primárias de qualquer banco de PDV sem necessidade de alterar código.
* **Perfis de Conexão:** Salva e carrega credenciais de múltiplos clientes localmente no navegador (`localStorage`).
* **Filtros Combinados (`WHERE`):** Permite cruzar condições (`CONTÉM`, `NÃO CONTÉM`, `IGUAL A`, `COMEÇA COM`, `VAZIO`) com lógica `AND`/`OR` para isolar produtos específicos (ex.: separar *"bolo de padaria"* de *"mistura para bolo"*).
* **Atualização em Lote Segura:** Executa `UPDATE` em transação única apenas nos registros marcados, com opção de máscara (`0000.00.00` ou `00000000`) e atualização de campos auxiliares de sincronização (ex.: `sincronizado=N`).
* **Backup Automático (Rollback):** Gera um arquivo `.json` na pasta `backups/` com os valores anteriores antes de qualquer alteração no banco.
* **Zero Dependências Externas no Frontend:** Interface construída em HTML5, CSS3 e JavaScript puro (ES Modules) + PWA.

---

## Estrutura do Projeto

```text
classificador-ncm/
├── main.py                  # Backend FastAPI + SQLAlchemy Core
├── requirements.txt         # Dependências Python
├── .gitignore               # Regras de exclusão do Git
├── README.md                # Documentação do projeto
├── backups/                 # Backups JSON gerados antes de cada UPDATE
└── static/                  # Frontend PWA
    ├── index.html
    ├── style.css
    ├── manifest.json
    ├── sw.js
    └── js/
        ├── style.css        # Estilização responsiva
        ├── manifest.json    # Configuração PWA
        ├── sw.js            # Configuração PWA
        ├── main.js          # Orquestração e eventos
        ├── state.js         # Estado da sessão
        ├── api.js           # Cliente HTTP (fetch)
        ├── ui.js            # Manipulação de interface e máscaras
        ├── profiles.js      # Gerenciamento de perfis locais
        ├── filters.js       # Construtor dinâmico de filtros
        └── grid.js          # Renderização da grade e seleção
        ├── knowledge.js     # Memória de regras NCM (termos_ncm.json)
        ├── sectors.js       # Mapeamento de setores de supermercado e capítulos NCM
        ├── siscomex.js      # Consulta e importação do catálogo oficial Siscomex
        |__ index.html — Estrutura das abas (Classificação, Consulta Siscomex e Ajuda)

## Ambiente de Desenvolvimento

### 1. Criar e ativar o ambiente virtual
**Windows:**
bash
python -m venv venv
venv\Scripts\activate


**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 2. Instalar dependências
```bash
pip install -r requirements.txt pyinstaller
```

### 3. Executar em modo desenvolvimento
```bash
python main.py
```
O servidor iniciará em `http://127.0.0.1:8000` e abrirá automaticamente no navegador padrão.

---

## Gerando o Executável (`.exe`)

Com o ambiente virtual ativado, execute o comando correspondente ao seu sistema operacional na raiz do projeto:

**Windows:**
```bash
pyinstaller --noconfirm --onefile --add-data "static;static" --hidden-import="pymysql" --hidden-import="psycopg2" --collect-all="sqlalchemy" --name="ClassificadorNCM" main.py
```

**Linux / macOS:**
```bash
pyinstaller --noconfirm --onefile --add-data "static:static" --hidden-import="pymysql" --hidden-import="psycopg2" --collect-all="sqlalchemy" --name="ClassificadorNCM" main.py
```

O binário final será gerado em `dist/ClassificadorNCM.exe`.

---

## Fluxo de Uso no Cliente

1. **Conectar:** Informe os dados do banco do PDV (ou selecione um perfil salvo) e clique em **Conectar e Listar Tabelas**.
2. **Mapear:** Selecione a tabela de produtos, confirme a coluna de Chave Primária (`ID`), a coluna alvo do `NCM` e marque as colunas que deseja visualizar.
3. **Filtrar:** Adicione uma ou mais condições de busca e clique em **Pesquisar Produtos**.
4. **Classificar:** Marque os produtos desejados na grade, informe o novo código NCM de 8 dígitos e clique em **Aplicar NCM nos Marcados**.


# Classificador NCM — Multi-PDV

Ferramenta portátil (Backend Python + Frontend PWA) para saneamento fiscal e atualização em lote de códigos NCM em diferentes bancos de dados de PDVs (MySQL/MariaDB, PostgreSQL e SQLite).

# Recursos Principais

• Agnóstico a Schema: Lê dinamicamente tabelas, colunas, tipos e chaves primárias de qualquer banco de PDV.
• Perfis de Conexão Portáteis: Salva e carrega credenciais de múltiplos clientes no arquivo perfis_clientes.json ao lado do executável.
• Filtros Combinados (WHERE): Permite cruzar condições (CONTÉM, NÃO CONTÉM, IGUAL A, COMEÇA COM, VAZIO) com lógica AND/OR.
• Memória de Regras NCM: Armazena associações frequentes de termos e NCMs em termos_ncm.json para reutilização entre clientes.
• Consulta Oficial Siscomex por Setor: Permite filtrar a tabela oficial de NCMs por departamentos de supermercado (com suporte a importação offline de JSON).
• Atualização em Lote Segura com Backup: Gera backup automático em backups/ antes de cada alteração em transação única.
• Guia Integrado para Usuários: Aba de ajuda passo a passo para operadores sem conhecimento técnico.

# Como Executar em Desenvolvimento

1. Crie e ative o ambiente virtual:
python -m venv .venv
.venv\Scripts\activate
2. Instale as dependências:
pip install -r requirements.txt pyinstaller
3. Inicie a aplicação:
python main.py
4. Acesse http://127.0.0.1:8000 no navegador.

# Como Gerar o Executável (.exe)

• Automático (GitHub Actions): Ao enviar uma tag de versão (git tag v1.0.0 e git push origin v1.0.0), o workflow compila e publica o ClassificadorNCM.exe na aba Releases do repositório.
• Manual (Windows): Execute pyinstaller --noconfirm --onefile --add-data "static;static" --hidden-import="pymysql" --hidden-import="psycopg2" --collect-all="sqlalchemy" --name="ClassificadorNCM" main.py

# O site oficial para pesquisar um produto e encontrar seu ncm é:
https://portalunico.siscomex.gov.br/classif/#/sumario?perfil=publico