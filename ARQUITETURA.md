# Arquitetura — ZapChat

Documento técnico do Projeto 1 de **EC48B — Programação Web Back-End**.
Descreve a modelagem das entidades no MongoDB, a estrutura do código e as decisões de projeto.

Para instalar e testar, veja o [README](README.md). Para o roteiro de validação, veja [TESTES.md](TESTES.md).

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Entidades e coleções](#2-entidades-e-coleções)
3. [Relacionamentos](#3-relacionamentos)
4. [Índices](#4-índices)
5. [Estrutura de pastas](#5-estrutura-de-pastas)
6. [Orientação a Objetos](#6-orientação-a-objetos)
7. [Validação dos dados](#7-validação-dos-dados)
8. [Tratamento de exceções](#8-tratamento-de-exceções)
9. [Registro de logs](#9-registro-de-logs)
10. [Funcionalidades implementadas](#10-funcionalidades-implementadas)
11. [Interface web (extra opcional)](#11-interface-web-extra-opcional)
12. [Mapa dos requisitos do enunciado](#12-mapa-dos-requisitos-do-enunciado)

---

## 1. Visão geral

Aplicação back-end que simula o armazenamento e o gerenciamento de um serviço de mensagens
instantâneas. A comunicação com o banco é feita exclusivamente pelo **MongoDB Driver para Node.js**.

- **5 coleções** no MongoDB;
- **6 classes de modelo** (uma abstrata + cinco entidades);
- única dependência externa: `mongodb`. O restante usa módulos nativos do Node.js
  (`fs`, `path`, `crypto`, `readline`, `http`).

```
Modelo (classe abstrata — CRUD genérico, validação, log e tratamento de exceções)
  ├── Usuario   → coleção "usuarios"
  ├── Contato   → coleção "contatos"
  ├── Conversa  → coleção "conversas"
  ├── Mensagem  → coleção "mensagens"
  └── Reacao    → coleção "reacoes"
```

---

## 2. Entidades e coleções

### 2.1 `Usuario` — coleção `usuarios`

Pessoa cadastrada no aplicativo.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `nome` | string | **sim** | 3 a 80 caracteres |
| `email` | string | **sim** | único, validado por formato |
| `senha` | string | **sim** | mínimo 6 caracteres, com letras e números; gravada como `senhaHash` |
| `senhaHash` | string | — | gerado com `crypto.scryptSync` + salt (atributo **privado** `#senhaHash`) |
| `apelido` | string | não | único quando informado |
| `telefone` | string | não | formato `(99) 99999-9999` |
| `avatar` | string | não | emoji do perfil |
| `recado` | string | não | até 140 caracteres |
| `status` | string | não | `online`, `ausente`, `ocupado` ou `offline` |
| `ultimoAcesso` | Date | — | atualizado na autenticação |

### 2.2 `Contato` — coleção `contatos`

Agenda de cada usuário (relacionamento entre dois usuários).

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `usuarioId` | ObjectId | **sim** | dono da agenda → `usuarios._id` |
| `contatoId` | ObjectId | **sim** | usuário salvo → `usuarios._id` |
| `apelido` | string | não | nome com que o contato aparece |
| `favorito` | boolean | não | padrão `false` |
| `bloqueado` | boolean | não | impede que a outra pessoa inicie uma conversa |

> Regras: não é possível adicionar o próprio usuário como contato, nem repetir o mesmo contato
> (índice único `usuarioId + contatoId`).

### 2.3 `Conversa` — coleção `conversas`

Conversa privada (2 participantes) ou grupo (2 ou mais participantes).

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `tipo` | string | **sim** | `privada` ou `grupo` |
| `participantes` | ObjectId[] | **sim** | mínimo 2, sem repetição → `usuarios._id` |
| `criadoPor` | ObjectId | **sim** | precisa estar entre os participantes |
| `nome` | string | **sim para grupos** | 3 a 60 caracteres |
| `descricao` | string | não | até 200 caracteres |
| `icone` | string | não | emoji da conversa |
| `administradores` | ObjectId[] | não | subconjunto dos participantes |
| `ultimaMensagem` | objeto | — | `{ texto, autorId, autorNome, enviadaEm }` — resumo para a lista de conversas |
| `totalMensagens` | número | — | contador mantido pela aplicação |

### 2.4 `Mensagem` — coleção `mensagens`

Mensagem enviada em uma conversa.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `conversaId` | ObjectId | **sim** | → `conversas._id` |
| `autorId` | ObjectId | **sim** | → `usuarios._id`; precisa participar da conversa |
| `conteudo` | string | **sim** | 1 a 4096 caracteres |
| `tipo` | string | **sim** | `texto`, `imagem`, `arquivo`, `audio`, `video` ou `sistema` |
| `anexo` | objeto | **sim para mídia** | `{ nome, url, tamanhoKb }` |
| `respostaA` | ObjectId | não | outra mensagem **da mesma conversa** |
| `lidaPor` | objeto[] | — | `[{ usuarioId, lidaEm }]` — controle de leitura |
| `editada` / `editadaEm` | boolean / Date | — | preenchidos ao editar |
| `excluida` / `excluidaEm` | boolean / Date | — | exclusão lógica ("apagar para todos") |
| `fixada` | boolean | — | mensagem fixada na conversa |
| `criadoEm` | Date | — | data de envio (exposta pelo getter `enviadaEm`) |

### 2.5 `Reacao` — coleção `reacoes`

Reação (emoji) de um usuário a uma mensagem.

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `mensagemId` | ObjectId | **sim** | → `mensagens._id` |
| `usuarioId` | ObjectId | **sim** | → `usuarios._id`; precisa participar da conversa |
| `emoji` | string | **sim** | um de `👍 ❤️ 😂 😮 😢 🙏 🔥 👏` |

> Índice único `mensagemId + usuarioId + emoji`: reagir novamente com o mesmo emoji **remove** a reação.

---

## 3. Relacionamentos

```
usuarios ─┬─< contatos >─┬─ usuarios          (agenda: usuarioId / contatoId)
          │
          ├─< conversas.participantes         (quem participa de cada conversa)
          │
          ├─< mensagens.autorId               (quem escreveu cada mensagem)
          │
          └─< reacoes.usuarioId               (quem reagiu)

conversas ─< mensagens.conversaId             (histórico da conversa)
mensagens ─< mensagens.respostaA              (resposta a outra mensagem)
mensagens ─< reacoes.mensagemId               (reações da mensagem)
```

Os relacionamentos são mantidos por **referência** (`ObjectId`) e resolvidos nas consultas com
`$lookup`. A única exceção é o resumo `ultimaMensagem`, gravado embutido na conversa para que a
lista de conversas não precise consultar a coleção de mensagens.

---

## 4. Índices

Criados por `npm run setup` (ou pela opção 13 do menu).

| Coleção | Índice | Finalidade |
| --- | --- | --- |
| `usuarios` | `email` (único) | impedir e-mail duplicado |
| `usuarios` | `apelido` (único, esparso) | impedir apelido duplicado |
| `usuarios` | `nome`, `status + ultimoAcesso` | pesquisa e listagem por presença |
| `contatos` | `usuarioId + contatoId` (único) | impedir contato repetido |
| `contatos` | `usuarioId + favorito` | listar a agenda com favoritos primeiro |
| `conversas` | `participantes + ultimaMensagem.enviadaEm` | lista de conversas do usuário |
| `conversas` | `tipo`, `criadoPor` | filtros por tipo e criador |
| `mensagens` | `conversaId + criadoEm` | histórico paginado da conversa |
| `mensagens` | `autorId + criadoEm`, `lidaPor.usuarioId`, `respostaA` | estatísticas, não lidas e respostas |
| `mensagens` | `conteudo` (**text**, português) | busca de mensagens por conteúdo |
| `reacoes` | `mensagemId + usuarioId + emoji` (único) | uma reação por emoji por usuário |
| `reacoes` | `mensagemId`, `emoji` | resumo por mensagem e ranking de emojis |

---

## 5. Estrutura de pastas

```
zapchat/
├── index.js                     # ponto de entrada: abre a conexão e o menu interativo
├── package.json                 # dependências e scripts
├── .env.example                 # modelo de configuração (copiar para .env)
│
├── src/
│   ├── Aplicacao.js             # ciclo de vida: conecta, executa, trata exceções e desconecta
│   │
│   ├── config/
│   │   └── config.js            # configurações (lê o .env com o módulo nativo fs)
│   │
│   ├── database/
│   │   ├── Database.js          # conexão com o MongoDB (Singleton, MongoDB Driver)
│   │   └── Manutencao.js        # criação de índices, contagem e limpeza das coleções
│   │
│   ├── errors/                  # hierarquia de exceções da aplicação
│   │   ├── ErroAplicacao.js     # classe base
│   │   ├── ErroValidacao.js     # campos obrigatórios / dados inválidos
│   │   ├── ErroNaoEncontrado.js # registro inexistente
│   │   ├── ErroRegraNegocio.js  # regra do domínio violada
│   │   ├── ErroBanco.js         # falhas do MongoDB Driver (ex.: índice único)
│   │   ├── ErroConexao.js       # falha de conexão com o banco
│   │   └── index.js
│   │
│   ├── models/                  # entidades (classes de domínio + acesso aos dados)
│   │   ├── Modelo.js            # classe abstrata com o CRUD genérico
│   │   ├── Usuario.js
│   │   ├── Contato.js
│   │   ├── Conversa.js
│   │   ├── Mensagem.js
│   │   ├── Reacao.js
│   │   └── index.js
│   │
│   ├── services/
│   │   └── ChatService.js       # casos de uso que envolvem mais de uma coleção
│   │
│   ├── utils/
│   │   ├── Logger.js            # gravação dos logs em arquivo
│   │   ├── Validador.js         # validações reutilizáveis
│   │   └── Seguranca.js         # hash e verificação de senha (crypto nativo)
│   │
│   └── cli/
│       ├── Menu.js              # menu interativo do terminal
│       └── Terminal.js          # formatação da saída no terminal
│
├── scripts/
│   ├── setup.js                 # cria as coleções e os índices
│   ├── seed.js                  # carrega dados de exemplo
│   ├── demo.js                  # demonstração completa (CRUD + erros + logs)
│   └── reset.js                 # limpa o banco de dados
│
├── web/                         # interface web de teste (extra opcional)
│   ├── servidor.js              # ponto de entrada (npm run web)
│   ├── ServidorWeb.js           # servidor HTTP nativo + tradução das exceções em status HTTP
│   ├── rotas.js                 # rotas da API JSON (só chamam as classes do núcleo)
│   └── publico/                 # index.html, estilo.css e app.js
│
└── logs/
    ├── errors.log               # somente exceções capturadas
    └── app.log                  # histórico completo de operações
```

### Separação de responsabilidades

- **`Modelo`** concentra o CRUD genérico (inserir, consultar, atualizar, excluir, contar, agregar),
  a validação e a conversão de erros do driver. As entidades herdam esse comportamento e declaram
  apenas `colecao`, `camposObrigatorios`, `camposAtualizaveis`, `indices` e suas próprias regras.
- **Entidades** cuidam da sua coleção e das consultas próprias da temática.
- **`ChatService`** coordena operações que envolvem várias coleções (enviar mensagem e atualizar o
  resumo da conversa, excluir usuário com todas as dependências, montar o painel do usuário).
- **`Menu`/`Terminal`** e **`web/`** cuidam apenas da interface; nenhuma regra de negócio mora neles.

---

## 6. Orientação a Objetos

| Conceito | Onde aparece |
| --- | --- |
| **Classes e objetos** | uma classe por entidade, instanciada a partir dos documentos do MongoDB |
| **Herança** | `Usuario`, `Contato`, `Conversa`, `Mensagem` e `Reacao` estendem `Modelo`; as exceções estendem `ErroAplicacao` |
| **Classe abstrata** | `Modelo` não pode ser instanciada e exige `colecao` e `paraDocumento()` nas subclasses |
| **Polimorfismo** | `paraDocumento()`, `validarCampos()`, `paraTexto()`, `copiarDe()` e `transformarAtualizacao()` são redefinidos por cada entidade e usados pelo código genérico da classe base |
| **Encapsulamento** | `#senhaHash` em `Usuario`, `#cliente`/`#db` em `Database`, `#usuario`/`#leitor` em `Menu` |
| **Getters** | `id`, `nomeExibicao`, `previa`, `enviadaEm`, `ehGrupo`, `quantidadeParticipantes` |
| **Métodos estáticos** | operações de coleção (`Usuario.buscarPorEmail`, `Mensagem.pesquisar`, ...) |
| **Métodos de instância** | `salvar()`, `atualizar()`, `excluir()`, `recarregar()` |
| **Singleton** | `Database.obterInstancia()` mantém uma única conexão com o MongoDB |

**Por que uma classe abstrata:** o CRUD é escrito uma única vez em `Modelo.js`. Uma entidade nova
precisa apenas declarar sua coleção, seus campos obrigatórios e suas regras — e já ganha inserir,
consultar, atualizar, excluir, contar, agregar, validar, tratar exceções e registrar logs.

---

## 7. Validação dos dados

A validação acontece **antes** de qualquer acesso ao banco, em `Modelo.validar()` e
`Modelo.prepararAtualizacao()`, apoiadas na classe `Validador`:

- **campos obrigatórios** de cada entidade (declarados em `camposObrigatorios`);
- **formatos**: e-mail, telefone brasileiro, força da senha, `ObjectId` válido;
- **domínios de valores**: status do usuário, tipo de conversa, tipo de mensagem, emojis permitidos;
- **tamanhos mínimos e máximos** de texto;
- **regras da temática**: conversa privada com exatamente 2 participantes, grupo com nome obrigatório,
  criador entre os participantes, administradores participantes, anexo obrigatório em mensagens de
  mídia, contato diferente do próprio usuário;
- **atualizações**: apenas campos permitidos são aceitos e campos obrigatórios não podem ser apagados.

Quando há mais de um problema, todos são informados de uma vez:

```
❌ ErroValidacao: Dados invalidos em Usuario: 2 problema(s) encontrado(s)
     • Campo "email" possui um e-mail invalido (exemplo: usuario@dominio.com)
     • Campo "senha" deve ter no minimo 6 caracteres
```

---

## 8. Tratamento de exceções

Todas as exceções previstas herdam de `ErroAplicacao`, o que permite diferenciá-las de falhas
inesperadas do Node.js ou do driver:

| Situação | Exceção |
| --- | --- |
| MongoDB indisponível ou uso do banco antes de conectar | `ErroConexao` |
| Campo obrigatório ausente ou dado inválido | `ErroValidacao` |
| Consultar, atualizar ou excluir registro inexistente | `ErroNaoEncontrado` |
| Índice único violado, falha de escrita/leitura do driver | `ErroBanco` |
| Regra da aplicação violada (não participa da conversa, não é o autor, contato repetido, ...) | `ErroRegraNegocio` |
| Qualquer erro não previsto | registrado por `Aplicacao` e pelos tratadores de `unhandledRejection` / `uncaughtException` |

Toda operação do driver passa por `Modelo.executar()`, que converte a falha em `ErroBanco` (por
exemplo, o código 11000 vira "já existe um registro com o mesmo valor em: email") e registra no log
antes de propagar. Nenhuma dessas situações encerra a aplicação: no menu, o erro é exibido e o menu
continua disponível.

O script `npm run demo` demonstra **34 cenários de falha** diferentes, todos capturados, tratados e
registrados em log.

---

## 9. Registro de logs

Os arquivos ficam na pasta `logs/` do próprio projeto:

- **`logs/errors.log`** — somente as exceções capturadas;
- **`logs/app.log`** — histórico completo (inserções, atualizações, exclusões, conexões e erros).

Cada registro informa data/hora, nível, tipo do erro, operação, mensagem, detalhes, causa original e
um resumo do *stack trace*:

```
[29/09/2026 22:09:34]
NIVEL: ERRO
TIPO: ErroValidacao
OPERACAO: Usuario.salvar
MENSAGEM: Campos obrigatorios nao informados em Usuario: "nome", "email", "senha"
DETALHES: {"entidade":"Usuario","camposAusentes":["nome","email","senha"], ...}
STACK: ErroValidacao: ... | at ErroValidacao.camposObrigatorios (src/errors/ErroValidacao.js:34:12) | ...
----------------------------------------------------------------------
```

O nível mínimo gravado pode ser ajustado pela variável `LOG_NIVEL` (`DEBUG`, `INFO`, `AVISO`, `ERRO`).

---

## 10. Funcionalidades implementadas

**Usuários** — cadastro com validação; senha só como hash (`crypto.scryptSync` + salt);
autenticação com registro do último acesso; alteração de perfil, de status de presença e de senha;
pesquisa por nome, apelido ou e-mail.

**Contatos** — adicionar, apelidar, favoritar, bloquear e remover; listagem da agenda com os dados
do usuário (`$lookup`); o bloqueio impede que a outra pessoa inicie uma conversa.

**Conversas** — abertura de conversa privada (reaproveitada quando já existe); criação de grupos com
descrição, ícone e administradores; adicionar/remover participantes e promover administradores (com
aviso automático do sistema no grupo); renomear grupo; excluir conversa com mensagens e reações.

**Mensagens** — envio de texto e de mídia com anexo; resposta a uma mensagem específica; histórico
paginado e histórico detalhado com autor, reações e mensagem respondida; busca por conteúdo com
índice de texto; controle de leitura e contagem de não lidas; edição (somente o autor); fixar;
exclusão **lógica** ("apagar para todos", preserva o histórico) e **definitiva** (remove o documento
e as reações vinculadas, recalculando o resumo da conversa).

**Reações** — reagir com emoji alternando entre adicionar e remover; resumo por mensagem; ranking
geral de emojis.

**Relatórios** — painel do usuário (conversas + não lidas + agenda); mensagens por autor em uma
conversa; ranking de remetentes; contagem de documentos por coleção.

---

## 11. Interface web (extra opcional)

Além do menu do terminal, o projeto acompanha uma interface web simples (`npm run web`), criada para
testar e apresentar a aplicação de forma visual.

- **Nenhuma dependência nova.** O servidor usa o módulo nativo `http`; a página usa HTML, CSS e
  JavaScript puros (sem Express, sem React, sem HTMX, sem CDN).
- **Nenhuma regra de negócio duplicada.** As rotas em `web/rotas.js` apenas chamam as mesmas classes
  de entidade e o mesmo `ChatService` usados pelo menu.
- **A hierarquia de exceções vira status HTTP** em um único ponto (`ServidorWeb`):

  | Exceção | Status HTTP |
  | --- | --- |
  | `ErroValidacao` | 400 |
  | `ErroNaoEncontrado` | 404 |
  | `ErroRegraNegocio` / `ErroBanco` | 409 |
  | `ErroConexao` | 503 |
  | qualquer outra | 500 |

> A pasta `web/` é um complemento: o projeto funciona por completo apenas com `npm start`,
> `npm run demo` e os demais scripts. Se a interface não for considerada no escopo, basta ignorá-la.

---

## 12. Mapa dos requisitos do enunciado

| Requisito | Onde está |
| --- | --- |
| MongoDB Driver para Node.js | `src/database/Database.js` (única dependência: `mongodb`) |
| Mínimo de 3 entidades/coleções | 5 coleções: `usuarios`, `contatos`, `conversas`, `mensagens`, `reacoes` |
| Mínimo de 3 classes de entidade | `Usuario`, `Contato`, `Conversa`, `Mensagem`, `Reacao` (+ `Modelo` abstrata) |
| Create | `Modelo.salvar()`, `Modelo.inserir()`, `Modelo.inserirMuitos()`, `Mensagem.enviar()`, `Conversa.criarGrupo()` |
| Read | `buscarPorId`, `obterPorId`, `buscarUm`, `listar`, `contar`, `agregar` + consultas próprias (`Usuario.pesquisar`, `Mensagem.listarHistorico`, `Mensagem.historicoDetalhado`, `Mensagem.pesquisar`, `Contato.listarAgenda`, `Conversa.listarPainelDoUsuario`) |
| Update | `atualizarPorId`, `atualizar`, `aplicarOperadores`, `atualizarMuitos`, `Mensagem.editar`, `Usuario.alterarSenha`, `Conversa.adicionarParticipante` |
| Delete | `excluirPorId`, `excluir`, `excluirMuitos`, `Mensagem.excluirParaTodos` (lógica), `ChatService.excluirMensagemDefinitivamente`, `ChatService.excluirConversa`, `ChatService.excluirUsuario` (cascata) |
| Orientação a Objetos | herança, classe abstrata, polimorfismo, encapsulamento e Singleton — seção 6 |
| Validação de campos obrigatórios | `Modelo.validar()`, `Modelo.prepararAtualizacao()` e `src/utils/Validador.js` |
| Tratamento de exceções | `src/errors/`, `Modelo.executar()`, `Aplicacao.executar()` e `Menu.executar()` |
| Registro de logs | `src/utils/Logger.js` → `logs/errors.log` e `logs/app.log` |
| Modularização | `src/models`, `src/services`, `src/database`, `src/utils`, `src/cli`, `src/errors`, `scripts` |
| Projeto testado antes da entrega | roteiro completo em [TESTES.md](TESTES.md) |
