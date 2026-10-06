# 💬 ZapChat

[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/gianse/zapchat?utm_source=readme&utm_medium=badge)

Projeto 1 de **EC48B — Programação Web Back-End** · **Gian Pedro Rodrigues (RA 2503638)**
Temática: **mensagens instantâneas** · Node.js + MongoDB Driver, sem frameworks.

Aplicação back-end que armazena e gerencia usuários, agenda de contatos, conversas privadas e em
grupo, mensagens (texto e mídia), controle de leitura e reações — com CRUD completo, validação dos
campos obrigatórios, tratamento de exceções e registro de logs em arquivo.

**5 coleções** (`usuarios`, `contatos`, `conversas`, `mensagens`, `reacoes`) e **6 classes**
(`Modelo` abstrata + 5 entidades). Única dependência externa: o driver `mongodb`.

**Organização MVC** — cada camada em sua própria pasta:

| Camada | Onde está |
| --- | --- |
| **Model** | `src/models/` (5 entidades + `Modelo` abstrata) e `src/services/ChatService.js` |
| **View** | `src/views/Terminal.js` (terminal) e `web/publico/` (navegador) |
| **Controller** | `src/controllers/Menu.js` (terminal) e `web/rotas.js` (API) |

**Dois modos de execução** — a interface gráfica é um extra, não um requisito:

| Modo | Comando | Precisa de |
| --- | --- | --- |
| **Terminal** (é o projeto avaliado) | `npm start` e `npm run demo` | apenas `src/` e `scripts/` |
| **Web** (extra opcional) | `npm run web` | a pasta `web/`, que pode ser apagada sem afetar nada |

O núcleo não importa nada de `web/`: apagando a pasta, `setup`, `seed`, `demo`, `reset` e o menu
continuam funcionando normalmente.

| Documento | Conteúdo |
| --- | --- |
| **README.md** (este) | instalar e testar, passo a passo |
| [ARQUITETURA.md](ARQUITETURA.md) | entidades, campos, relacionamentos, índices e estrutura do código |
| [TESTES.md](TESTES.md) | roteiro de validação detalhado e roteiro de apresentação |

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação](#2-instalação)
3. [Teste 1 — demonstração automática](#3-teste-1--demonstração-automática)
4. [Teste 2 — menu do terminal](#4-teste-2--menu-do-terminal)
5. [Teste 3 — interface web (extra)](#5-teste-3--interface-web-extra)
6. [Teste 4 — arquivos de log](#6-teste-4--arquivos-de-log)
7. [Comandos disponíveis](#7-comandos-disponíveis)
8. [Configuração do MongoDB](#8-configuração-do-mongodb)
9. [Sobre a entrega](#9-sobre-a-entrega)

---

## 1. Pré-requisitos

| Requisito | Como conferir |
| --- | --- |
| **Node.js 18+** | `node -v` |
| **MongoDB 5+ em execução** | `Get-Service MongoDB` → precisa estar `Running` |

Se o MongoDB ainda não estiver instalado:

```powershell
winget install MongoDB.Server      # ou o instalador em mongodb.com/try/download/community
net start MongoDB                  # caso o serviço não suba sozinho
```

No Linux use `sudo systemctl start mongod`; no macOS, `brew services start mongodb-community`.

---

## 2. Instalação

```bash
cd zapchat
npm install        # instala a única dependência: mongodb
npm run setup      # cria as coleções e os 22 índices
npm run seed       # carrega os dados de exemplo
```

Nenhuma configuração é necessária: a aplicação usa `mongodb://localhost:27017` e cria o banco
`zapchat` automaticamente.

Após o `seed` você deve ver **5 usuários, 9 contatos, 4 conversas, 15 mensagens e 5 reações**.
A senha de todos os usuários de exemplo é **`senha123`**:

| E-mail | Nome |
| --- | --- |
| `ana@zapchat.dev` | Ana Souza |
| `bruno@zapchat.dev` | Bruno Lima |
| `carla@zapchat.dev` | Carla Dias |
| `diego@zapchat.dev` | Diego Alves |
| `eva@zapchat.dev` | Eva Martins |

---

## 3. Teste 1 — demonstração automática

```bash
npm run demo
```

É o teste principal: executa tudo em uma única saída, na ordem CREATE → READ → UPDATE → DELETE →
erros → logs. O que conferir:

- inserções nas 5 coleções, incluindo mensagem com anexo, resposta e aviso do sistema;
- consultas com `$lookup` (histórico com autor, reações e mensagem respondida), busca por texto,
  paginação, ranking e estatísticas;
- atualizações (perfil, senha, edição de mensagem, renomear grupo, promover administrador);
- exclusões: **lógica** ("apagar para todos", preserva o histórico) e **definitiva** (remove o
  documento, as reações vinculadas e recalcula o resumo da conversa);
- ao final da seção 6: **`✅ 34 excecoes capturadas, tratadas e registradas em log`**;
- a seção 7 imprime registros reais do arquivo `logs/errors.log`.

---

## 4. Teste 2 — menu do terminal

```bash
npm start
```

Roteiro rápido (senha `senha123`):

| Opção | Ação | Resultado esperado |
| --- | --- | --- |
| `1` | entrar com `ana@zapchat.dev` | "Bem-vindo(a), aninha!" e o total de não lidas |
| `1` | entrar com a senha errada | erro tratado — **o menu continua funcionando** |
| `2` | cadastrar com nome `Ab`, e-mail `zzz`, senha `123` | `ErroValidacao` listando os 3 problemas |
| `7` | abrir uma conversa | histórico com autor, hora, anexo, 📌 e reações |
| `8` | enviar uma mensagem | gravada e confirmada com o `_id` |
| `9` | editar, reagir ou apagar uma mensagem | operação aplicada na hora |
| `12` | estatísticas | documentos por coleção, ranking e emojis |
| `0` | sair | encerramento limpo |

---

## 5. Teste 3 — interface web (extra)

```bash
npm run web        # depois abra http://localhost:3000
```

Extra opcional, feito com o módulo **`http` nativo** + HTML/CSS/JS puros (nenhuma dependência nova).
Cada clique executa as mesmas classes usadas pelo menu. Entre com `ana@zapchat.dev` / `senha123` e:

- abra uma conversa, envie mensagens, responda, reaja, edite e apague;
- crie um grupo e adicione participantes;
- na aba **Contatos**, favorite, bloqueie e desbloqueie;
- tente criar uma conta com e-mail inválido: os erros de validação do back-end aparecem na tela.

---

## 6. Teste 4 — arquivos de log

Abra `logs/errors.log` (só exceções) e `logs/app.log` (histórico completo). Cada registro traz
data/hora, tipo do erro, operação, mensagem e detalhes.

Para ver o tratamento do erro de conexão:

```powershell
net stop MongoDB     # depois: npm start  → mensagem clara, sem stack trace, erro gravado no log
net start MongoDB    # volta ao normal
```

---

## 7. Comandos disponíveis

| Comando | O que faz |
| --- | --- |
| `npm start` | menu interativo no terminal |
| `npm run demo` | demonstração automática (CRUD + validações + 34 erros tratados + logs) |
| `npm run setup` | cria as coleções e os índices |
| `npm run seed` | carrega os dados de exemplo (limpa o banco antes) |
| `npm run reset` | esvazia as coleções |
| `npm run web` | interface web de teste em <http://localhost:3000> |

---

## 8. Configuração do MongoDB

O padrão já funciona. Para alterar, copie `.env.example` para `.env`:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=zapchat
MONGODB_TIMEOUT=5000
LOG_NIVEL=INFO
```

Para usar o MongoDB Atlas, basta trocar a URI por
`mongodb+srv://usuario:senha@cluster.mongodb.net`.

---

## 9. Sobre a entrega

- A pasta `node_modules` **não** faz parte da entrega — rode `npm install` para recriá-la.
- A pasta `web/` é **opcional**: nenhum arquivo de `src/`, `scripts/` ou `index.js` depende dela.
  Se a interface não for considerada no escopo, basta ignorá-la (ou apagá-la, junto com o script
  `web` do `package.json`) que o projeto continua completo.
- Os arquivos de log são gerados na execução; a pasta `logs/` acompanha o projeto.
- Não são usados frameworks nem bibliotecas além do driver oficial `mongodb`: leitura do `.env`,
  hash de senhas, logs, interface de terminal e servidor web usam apenas módulos nativos do Node.js
  (`fs`, `path`, `crypto`, `readline`, `http`).
