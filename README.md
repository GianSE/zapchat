# 💬 ZapChat
## Gian Pedro Rodrigues | RA: 2503638
### Projeto 1 de **EC48B — Programação Web Back-End**

[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/gianse/zapchat?utm_source=readme&utm_medium=badge)


Temática: **mensagens instantâneas** · Node.js + MongoDB Driver, sem frameworks.

Aplicação back-end que gerencia usuários, agenda de contatos, conversas privadas e em grupo,
mensagens (texto e mídia), controle de leitura e reações — com CRUD completo, validação dos campos
obrigatórios, tratamento de exceções e registro de logs em arquivo.

**5 coleções** (`usuarios`, `contatos`, `conversas`, `mensagens`, `reacoes`) e **6 classes**
(`Modelo` abstrata + 5 entidades), organizadas em **MVC**:

| Camada | Onde está |
| --- | --- |
| **Model** | `src/models/` e `src/services/` |
| **View** | `src/views/Terminal.js` e `web/publico/` |
| **Controller** | `src/controllers/` e `web/servidor.js` |

Modelagem e estrutura do código em **[ARQUITETURA.md](ARQUITETURA.md)** · roteiro de testes em
**[TESTES.md](TESTES.md)**.

---

## 1. Instalação

Requisitos: **Node.js 18+** (`node -v`) e **MongoDB 5+ em execução** (`Get-Service MongoDB` →
`Running`). Se faltar o MongoDB: `winget install MongoDB.Server` e, se preciso, `net start MongoDB`.
No Linux, `sudo systemctl start mongod`; no macOS, `brew services start mongodb-community`.

```bash
cd zapchat
npm install        # instala a única dependência: mongodb
npm run setup      # cria as coleções e os 22 índices
npm run seed       # carrega os dados de exemplo
npm start          # abre o menu
```

Nada precisa ser configurado: a aplicação usa `mongodb://localhost:27017` e cria o banco `zapchat`.
Após o `seed`: **5 usuários, 9 contatos, 4 conversas, 15 mensagens e 5 reações**. A senha de todos
os usuários de exemplo é **`senha123`** (`ana@`, `bruno@`, `carla@`, `diego@` e `eva@zapchat.dev`).

---

## 2. Como testar

| Caminho | Comando | Para quê |
| --- | --- | --- |
| **Trilha guiada** | `npm start` → opção **14** | conhecer a aplicação inteira em 6 blocos, com pausas |
| **Demonstração automática** | `npm run demo` | tudo numa saída só, sem interação |
| **Menu** | `npm start` | usar a aplicação opção por opção |
| **Visualizador web** (extra) | `npm run web` | ver os dados no navegador |
| **Logs** | abrir `logs/errors.log` | conferir o registro das exceções |

**Trilha guiada (opção 14)** — inserção nas 5 coleções → consultas e agregações → atualizações →
exclusão lógica e definitiva → validação e 8 exceções tratadas → logs. Cria os próprios dados e os
**remove no final**, então pode rodar quantas vezes quiser.

**`npm run demo`** — o mesmo percurso, sem interação e mais a fundo: termina com
`✅ 34 excecoes capturadas, tratadas e registradas em log`.

**Visualizador web** — página **somente leitura** em `http://localhost:3000`, feita com o módulo
`http` nativo e HTML/CSS/JS puros (~650 linhas, 4 rotas `GET`). Escrita responde `405`: todas as
operações de escrita ficam no menu. Nada em `src/` depende dessa pasta.

O passo a passo de cada caminho está em [TESTES.md](TESTES.md).

---

## 3. Comandos e configuração

| Comando | O que faz |
| --- | --- |
| `npm start` | menu interativo (inclui a trilha guiada, opção 14) |
| `npm run demo` | demonstração automática: CRUD, validações, 34 erros tratados e logs |
| `npm run setup` | cria as coleções e os índices |
| `npm run seed` | carrega os dados de exemplo (limpa o banco antes) |
| `npm run reset` | esvazia as coleções |
| `npm run web` | visualizador web somente leitura |

Para mudar a configuração, copie `.env.example` para `.env`:

```env
MONGODB_URI=mongodb://localhost:27017     # ou mongodb+srv://... no Atlas
MONGODB_DB=zapchat
MONGODB_TIMEOUT=5000
LOG_NIVEL=INFO                            # DEBUG | INFO | AVISO | ERRO
```

---

## 4. Sobre a entrega

- `node_modules` **não** faz parte da entrega — rode `npm install` para recriá-la.
- Os logs são gerados na execução; a pasta `logs/` acompanha o projeto.
- A pasta `web/` é um **extra opcional**: nada em `src/`, `scripts/` ou `index.js` depende dela.
- Sem frameworks nem bibliotecas além do driver `mongodb`: `.env`, hash de senhas, logs, terminal e
  visualizador usam apenas módulos nativos (`fs`, `path`, `crypto`, `readline`, `http`).
