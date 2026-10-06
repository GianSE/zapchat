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
5. [Estrutura de pastas e organização MVC](#5-estrutura-de-pastas-e-organização-mvc)
6. [Orientação a Objetos](#6-orientação-a-objetos)
7. [Validação dos dados](#7-validação-dos-dados)
8. [Tratamento de exceções](#8-tratamento-de-exceções)
9. [Registro de logs](#9-registro-de-logs)
10. [Visualizador web (extra opcional)](#10-visualizador-web-extra-opcional)
11. [Mapa dos requisitos do enunciado](#11-mapa-dos-requisitos-do-enunciado)

---

## 1. Visão geral

Aplicação back-end de mensagens instantâneas. A comunicação com o banco é feita exclusivamente
pelo **MongoDB Driver para Node.js**; a única dependência externa é `mongodb`, e o restante usa
módulos nativos (`fs`, `path`, `crypto`, `readline`, `http`).

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

## 5. Estrutura de pastas e organização MVC

```
zapchat/
├── index.js                 # ponto de entrada: conecta e abre o menu
├── package.json
├── .env.example             # modelo de configuração
│
├── src/
│   ├── Aplicacao.js         # ciclo de vida: conecta, executa, trata exceções, desconecta
│   ├── config/config.js     # configurações (lê o .env com o módulo nativo fs)
│   │
│   ├── models/              # MODEL — entidades: domínio + acesso aos dados
│   │   ├── Modelo.js        #   classe abstrata com o CRUD genérico
│   │   └── Usuario.js · Contato.js · Conversa.js · Mensagem.js · Reacao.js
│   ├── services/            # MODEL — regras que envolvem mais de uma coleção
│   │   └── ChatService.js
│   ├── views/               # VIEW — apresentação
│   │   └── Terminal.js      #   formatação da saída no terminal
│   ├── controllers/         # CONTROLLER — recebe a entrada e aciona o Model
│   │   ├── Menu.js          #   menu interativo
│   │   └── TrilhaGuiada.js  #   demonstração guiada (opção 14)
│   │
│   ├── database/            # Database.js (conexão Singleton) e Manutencao.js (índices)
│   ├── errors/              # ErroAplicacao + Validacao, NaoEncontrado, RegraNegocio, Banco, Conexao
│   └── utils/               # Logger.js, Validador.js e Seguranca.js (hash de senha)
│
├── scripts/                 # setup.js, seed.js, demo.js e reset.js
├── web/                     # visualizador somente leitura (extra): servidor.js + publico/
└── logs/                    # errors.log (exceções) e app.log (histórico completo)
```

### Organização MVC

Cada camada em sua própria pasta:

| Camada | Pasta / arquivos | Responsabilidade |
| --- | --- | --- |
| **Model** | `src/models/` (5 entidades + `Modelo` abstrata) e `src/services/ChatService.js` | representa os dados, as regras de negócio e todo o acesso ao MongoDB |
| **View** | `src/views/Terminal.js` (terminal) e `web/publico/` (navegador) | só apresenta informação; não acessa o banco nem conhece as entidades |
| **Controller** | `src/controllers/Menu.js`, `src/controllers/TrilhaGuiada.js` e `web/servidor.js` | recebem a entrada do usuário, acionam o Model e entregam o resultado à View |

As demais pastas são **infraestrutura**, usadas pelas três camadas: `src/database/` (conexão),
`src/errors/` (exceções), `src/utils/` (log, validação, senha) e `src/config/` (configuração).

O fluxo de uma operação é sempre o mesmo:

```
usuário → Controller (Menu) → Model (Usuario, Mensagem, ChatService...) → MongoDB
                                     ↓
                              View (Terminal)
```

Um indício prático da separação: `src/views/Terminal.js` **não tem nenhum `require`** de entidade,
serviço ou banco — ele só recebe dados prontos e formata.

### Separação de responsabilidades

- **`Modelo`** concentra o CRUD genérico (inserir, consultar, atualizar, excluir, contar, agregar),
  a validação e a conversão de erros do driver. As entidades herdam esse comportamento e declaram
  apenas `colecao`, `camposObrigatorios`, `camposAtualizaveis`, `indices` e suas próprias regras.
- **Entidades** cuidam da sua coleção e das consultas próprias da temática.
- **`ChatService`** coordena operações que envolvem várias coleções (enviar mensagem e atualizar o
  resumo da conversa, excluir usuário com todas as dependências, montar o painel do usuário).
- **`controllers/Menu.js`** e **`views/Terminal.js`** cuidam apenas da interface; nenhuma regra de
  negócio mora neles.

---

## 6. Orientação a Objetos

| Conceito | Onde aparece |
| --- | --- |
| **Classes e objetos** | uma classe por entidade, instanciada a partir dos documentos do MongoDB |
| **Herança** | `Usuario`, `Contato`, `Conversa`, `Mensagem` e `Reacao` estendem `Modelo`; as exceções estendem `ErroAplicacao` |
| **Classe abstrata** | `Modelo` não pode ser instanciada e exige `colecao` e `paraDocumento()` nas subclasses |
| **Polimorfismo** | `paraDocumento()`, `validarCampos()`, `paraTexto()`, `copiarDe()` e `transformarAtualizacao()` são redefinidos por cada entidade e usados pelo código genérico da classe base |
| **Encapsulamento** | `#senhaHash` em `Usuario`, `#cliente`/`#db` em `Database`, `#usuario`/`#leitor` em `Menu` (controller) |
| **Getters** | `id`, `nomeExibicao`, `previa`, `enviadaEm`, `ehGrupo`, `quantidadeParticipantes` |
| **Métodos estáticos** | operações de coleção (`Usuario.buscarPorEmail`, `Mensagem.pesquisar`, ...) |
| **Métodos de instância** | `salvar()`, `atualizar()`, `excluir()`, `recarregar()` |
| **Singleton** | `Database.obterInstancia()` mantém uma única conexão com o MongoDB |

**Por que uma classe abstrata:** o CRUD é escrito uma única vez em `Modelo.js`. Uma entidade nova
precisa apenas declarar sua coleção, seus campos obrigatórios e suas regras — e já ganha inserir,
consultar, atualizar, excluir, contar, agregar, validar, tratar exceções e registrar logs.

---

## 7. Validação dos dados

Acontece **antes** de qualquer acesso ao banco, em `Modelo.validar()` e
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

Toda operação do driver passa por `Modelo.executar()`, que converte a falha em `ErroBanco` (o
código 11000, por exemplo, vira "já existe um registro com o mesmo valor em: email") e registra no
log antes de propagar. Nada disso encerra a aplicação: no menu o erro é exibido e o menu continua.
O `npm run demo` percorre **34 cenários de falha**, todos tratados e registrados.

---

## 9. Registro de logs

Na pasta `logs/` do projeto: **`errors.log`** (só exceções) e **`app.log`** (histórico completo —
inserções, atualizações, exclusões, conexões e erros). Cada registro traz data/hora, nível, tipo,
operação, mensagem, detalhes, causa e um resumo do *stack trace*:

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

## 10. Visualizador web (extra opcional)

`npm run web` sobe uma página **somente leitura** em <http://localhost:3000>, com o módulo nativo
`http` e HTML/CSS/JS puros (~650 linhas). São **quatro rotas, todas `GET`**, cada uma chamando uma
classe do núcleo:

| Rota | Chama |
| --- | --- |
| `GET /api/usuarios` | `Usuario.listar` |
| `GET /api/usuarios/:id/painel` | `ChatService.painelDoUsuario` |
| `GET /api/conversas/:id/mensagens` | `Mensagem.historicoDetalhado` (`$lookup`) |
| `GET /api/estatisticas` | `ChatService.estatisticasGerais` |

Qualquer outro método HTTP responde `405 — Esta interface e somente leitura`. A hierarquia de
exceções vira status num único ponto: `ErroValidacao` → 400, `ErroNaoEncontrado` → 404,
`ErroConexao` → 503, demais erros da aplicação → 409.

> Serve de prova prática da separação MVC: duas interfaces diferentes (terminal e navegador) sobre
> o mesmo Model, sem uma linha de regra de negócio duplicada. Se a interface não for considerada no
> escopo, basta ignorar a pasta `web/`.

---

## 11. Mapa dos requisitos do enunciado

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
| Tratamento de exceções | `src/errors/`, `Modelo.executar()`, `Aplicacao.executar()` e `Menu.executar()` (controller) |
| Registro de logs | `src/utils/Logger.js` → `logs/errors.log` e `logs/app.log` |
| Organização em MVC | `src/models` + `src/services` (Model), `src/views` (View), `src/controllers` (Controller) — seção 5 |
| Modularização | `src/models`, `src/services`, `src/views`, `src/controllers`, `src/database`, `src/utils`, `src/errors`, `scripts` |
| Projeto testado antes da entrega | roteiro completo em [TESTES.md](TESTES.md) |
