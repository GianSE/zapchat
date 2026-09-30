# ZapChat — Aplicação de Mensagens Instantâneas

Projeto 1 da disciplina **EC48B — Programação Web Back-End**, desenvolvido em **Node.js** com
**MongoDB**, utilizando o **MongoDB Driver para Node.js** e os conceitos de **Orientação a Objetos
com JavaScript**.

- **Temática escolhida:** 📱 Mensagens instantâneas
- **Integrante:** Gian Pedro Rodrigues — RA 2503638
- **Banco de dados:** MongoDB (banco `zapchat`)
- **Dependência externa:** apenas `mongodb` (driver oficial). Todo o restante usa módulos nativos do Node.js
  (`fs`, `path`, `crypto`, `readline`).

---

## 1. Descrição da aplicação

O ZapChat é uma aplicação de back-end que simula o armazenamento e o gerenciamento de um serviço de
mensagens instantâneas. Ela permite cadastrar usuários, montar uma agenda de contatos, abrir conversas
privadas, criar grupos, enviar e receber mensagens (texto, imagem, arquivo, áudio, vídeo e avisos do
sistema), responder mensagens, marcar mensagens como lidas, reagir com emojis, editar e apagar mensagens.

A aplicação é executada no terminal e oferece três formas de uso:

| Comando | O que faz |
| --- | --- |
| `npm start` | Abre o **menu interativo**, com todas as operações do sistema |
| `npm run demo` | Executa uma **demonstração automática** de todo o CRUD, das validações e do tratamento de erros |
| `npm run seed` | Carrega **dados de exemplo** (usuários, conversas, mensagens e reações) |
| `npm run web` | Sobe a **interface web de teste** (extra opcional) em <http://localhost:3000> |

O passo a passo de validação do projeto está em **[TESTES.md](TESTES.md)**.

Todas as operações são feitas pela aplicação Node.js por meio do MongoDB Driver — nenhuma operação
depende do terminal do MongoDB.

---

## 2. Entidades e classes implementadas

O projeto possui **5 coleções** no MongoDB e **6 classes de modelo** (uma classe abstrata + cinco entidades):

```
Modelo (classe abstrata — CRUD genérico, validação, log e tratamento de exceções)
  ├── Usuario   → coleção "usuarios"
  ├── Contato   → coleção "contatos"
  ├── Conversa  → coleção "conversas"
  ├── Mensagem  → coleção "mensagens"
  └── Reacao    → coleção "reacoes"
```

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
| `bloqueado` | boolean | não | impede o início de conversas |

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

### 2.6 Relacionamentos

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

### 2.7 Índices criados (`npm run setup`)

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

## 3. Principais funcionalidades

**Usuários**
- cadastro com validação de campos obrigatórios e de formato;
- senha armazenada apenas como hash (`crypto.scryptSync` + salt por usuário);
- autenticação por e-mail e senha, com registro do último acesso;
- alteração de perfil, de status de presença (`online`, `ausente`, `ocupado`, `offline`) e de senha;
- pesquisa por nome, apelido ou e-mail.

**Contatos**
- adicionar, apelidar, favoritar, bloquear e remover contatos;
- listagem da agenda com os dados do usuário (agregação com `$lookup`);
- bloqueio impede que a outra pessoa inicie uma conversa.

**Conversas**
- abertura de conversa privada (reaproveitada quando já existe);
- criação de grupos com descrição, ícone e administradores;
- adicionar/remover participantes e promover administradores (com aviso automático do sistema no grupo);
- renomear grupo e excluir conversa (com mensagens e reações).

**Mensagens**
- envio de mensagens de texto e de mídia com anexo;
- resposta a uma mensagem específica;
- consulta ao histórico (paginado) e histórico detalhado com autor, reações e mensagem respondida;
- busca de mensagens por conteúdo usando índice de texto;
- controle de leitura (marcar mensagem ou conversa inteira como lida) e contagem de não lidas;
- edição de mensagem (somente o autor), fixar mensagem;
- exclusão **lógica** ("apagar para todos", preserva o histórico) e exclusão **definitiva** (remove o
  documento e as reações vinculadas, recalculando o resumo da conversa).

**Reações**
- reagir com emoji (alternando entre adicionar/remover), resumo por mensagem e ranking geral de emojis.

**Relatórios**
- painel do usuário (conversas + não lidas + agenda);
- mensagens por autor em uma conversa;
- ranking de remetentes e de emojis;
- contagem de documentos por coleção.

---

## 4. Estrutura do projeto

```
projeto1/
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
│   └── publico/
│       ├── index.html
│       ├── estilo.css
│       └── app.js
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
- **`Menu`/`Terminal`** cuidam apenas da interface no terminal.

### Conceitos de Orientação a Objetos aplicados

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

---

## 5. Validação dos dados

A validação acontece **antes** de qualquer acesso ao banco, em `Modelo.validar()` e
`Modelo.prepararAtualizacao()`, apoiadas na classe `Validador`:

- **campos obrigatórios** de cada entidade (declarados em `camposObrigatorios`);
- **formatos**: e-mail, telefone brasileiro, força da senha, `ObjectId` válido;
- **domínios de valores**: status do usuário, tipo de conversa, tipo de mensagem, emojis permitidos;
- **tamanhos mínimos e máximos** de texto;
- **regras da temática**: conversa privada com exatamente 2 participantes, grupo com nome obrigatório,
  criador entre os participantes, administradores participantes, anexo obrigatório em mensagens de mídia,
  contato diferente do próprio usuário;
- **atualizações**: apenas campos permitidos são aceitos e campos obrigatórios não podem ser apagados.

Quando há mais de um problema, todos são informados de uma vez:

```
❌ ErroValidacao: Dados invalidos em Usuario: 2 problema(s) encontrado(s)
     • Campo "email" possui um e-mail invalido (exemplo: usuario@dominio.com)
     • Campo "senha" deve ter no minimo 6 caracteres
```

---

## 6. Tratamento de exceções

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

Nenhuma dessas situações encerra a aplicação: no menu interativo o erro é exibido e o menu continua
disponível. O script `npm run demo` demonstra **34 cenários de falha** diferentes, todos capturados,
tratados e registrados em log.

---

## 7. Registro de logs

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
DETALHES: {"entidade":"Usuario","camposAusentes":["nome","email","senha"],"erros":["Campo \"nome\" obrigatorio", ...]}
STACK: ErroValidacao: ... | at ErroValidacao.camposObrigatorios (src/errors/ErroValidacao.js:34:12) | ...
----------------------------------------------------------------------
```

O nível mínimo gravado pode ser ajustado pela variável `LOG_NIVEL` (`DEBUG`, `INFO`, `AVISO`, `ERRO`).

---

## 8. Requisitos para execução

- **Node.js 18 ou superior** (testado com Node.js 24) — `node -v`
- **npm** — `npm -v`
- **MongoDB 5 ou superior** em execução (local ou MongoDB Atlas)

---

## 9. Instalação das dependências

```bash
cd projeto1
npm install
```

Isso instala a única dependência do projeto, declarada no `package.json`:

```json
"dependencies": { "mongodb": "^6.9.0" }
```

---

## 10. Configuração do MongoDB

### 10.1 MongoDB instalado localmente (forma recomendada)

**Windows**

1. Instale o **MongoDB Community Server**, por uma das opções:
   - pelo instalador: <https://www.mongodb.com/try/download/community> (pacote **msi**, opção
     *Complete*, mantendo marcado **Install MongoDB as a Service**);
   - ou pelo terminal: `winget install MongoDB.Server`
2. Confirme que o serviço está em execução:

   ```powershell
   Get-Service MongoDB          # deve exibir Status = Running
   net start MongoDB            # usar somente se estiver parado
   ```

**Linux / macOS**

```bash
sudo systemctl start mongod              # Linux
brew services start mongodb-community    # macOS
```

Depois disso nada mais precisa ser configurado: o endereço padrão (`mongodb://localhost:27017`) já é
o utilizado pela aplicação, e o banco `zapchat` e suas coleções são criados automaticamente por
`npm run setup`.

> Para visualizar os documentos gravados (útil na apresentação), pode ser usado o **MongoDB Compass**,
> instalado junto com o MongoDB, conectando em `mongodb://localhost:27017` e abrindo o banco `zapchat`.

### 10.2 Alternativa: MongoDB via Docker

Se preferir não instalar o MongoDB na máquina, basta ter o Docker e executar:

```bash
docker run -d --name zapchat-mongo -p 27017:27017 mongo:7
```

O endereço continua sendo `mongodb://localhost:27017`, portanto nenhuma configuração extra é
necessária. Para parar e remover o contêiner depois:

```bash
docker stop zapchat-mongo && docker rm zapchat-mongo
```

### 10.3 Alterando a configuração (opcional)

Copie o arquivo de exemplo e ajuste os valores:

```bash
# Windows (cmd)
copy .env.example .env

# Linux / macOS / Git Bash
cp .env.example .env
```

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=zapchat
MONGODB_TIMEOUT=5000
LOG_NIVEL=INFO
```

Para usar o **MongoDB Atlas**, basta trocar a URI:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net
```

### 10.4 Criando as coleções e os índices

```bash
npm run setup
```

---

## 11. Execução do projeto

```bash
# 1. instalar as dependências
npm install

# 2. preparar o banco (coleções e índices)
npm run setup

# 3. carregar dados de exemplo (opcional, recomendado)
npm run seed

# 4. abrir o menu interativo
npm start
```

### Demonstração automática

```bash
npm run demo
```

Executa, na ordem: preparação do banco → inserções nas 5 coleções → consultas e agregações →
atualizações → exclusões (lógicas, definitivas e em cascata) → 34 cenários de erro tratados →
exibição do conteúdo do arquivo de log → situação final do banco.

### Limpar o banco

```bash
npm run reset
```

### Menu interativo

```
 1. Entrar (autenticar usuario)          8. Enviar mensagem
 2. Cadastrar usuario                    9. Gerenciar mensagens (editar, reagir, apagar)
 3. Listar / pesquisar usuarios         10. Gerenciar grupos e conversas
 4. Meu perfil                          11. Pesquisar mensagens
 5. Minha agenda de contatos            12. Estatisticas
 6. Minhas conversas                    13. Manutencao do banco de dados
 7. Abrir conversa (historico)          14. Encerrar sessao do usuario
                                         0. Sair da aplicacao
```

Depois de `npm run seed`, entre com qualquer um dos usuários abaixo (senha **`senha123`**):

| E-mail | Nome |
| --- | --- |
| `ana@zapchat.dev` | Ana Souza |
| `bruno@zapchat.dev` | Bruno Lima |
| `carla@zapchat.dev` | Carla Dias |
| `diego@zapchat.dev` | Diego Alves |
| `eva@zapchat.dev` | Eva Martins |

---

## 12. Interface web de teste (extra opcional)

Além do menu do terminal, o projeto acompanha uma interface web simples, criada para **testar e
apresentar** a aplicação de forma visual:

```bash
npm run web       # depois abra http://localhost:3000
```

Pontos importantes:

- **Nenhuma dependência nova.** O servidor usa o módulo nativo `http` do Node.js; a página usa
  HTML, CSS e JavaScript puros (sem Express, sem React, sem HTMX, sem CDN).
- **Nenhuma regra de negócio foi duplicada.** As rotas em `web/rotas.js` apenas chamam as mesmas
  classes de entidade e o mesmo `ChatService` usados pelo menu do terminal.
- **A hierarquia de exceções vira status HTTP** em um único ponto (`ServidorWeb`):

  | Exceção | Status HTTP |
  | --- | --- |
  | `ErroValidacao` | 400 |
  | `ErroNaoEncontrado` | 404 |
  | `ErroRegraNegocio` / `ErroBanco` | 409 |
  | `ErroConexao` | 503 |
  | qualquer outra | 500 |

- A tela mostra as mensagens de validação vindas do back-end campo a campo, o que ajuda a
  demonstrar o critério de validação durante a apresentação.

O que dá para fazer pela interface: entrar, cadastrar usuário, editar perfil, alterar status,
abrir conversas privadas, criar grupos, adicionar participantes, enviar mensagens de texto e de
mídia, responder, reagir, fixar, editar, apagar (para todos e definitivamente), gerenciar a agenda
de contatos, pesquisar mensagens e ver as estatísticas do banco.

> Esta pasta é um complemento: o projeto avaliado funciona por completo apenas com `npm start`,
> `npm run demo` e os demais scripts. Se a interface não for considerada no escopo, basta ignorar
> a pasta `web/`.

---

## 13. Observações sobre a entrega

- A pasta `node_modules` **não** faz parte da entrega; execute `npm install` para recriá-la.
- Os arquivos de log são gerados na execução; a pasta `logs/` acompanha o projeto.
- Não são utilizados frameworks (Express, Mongoose) ou bibliotecas externas além do driver oficial
  `mongodb`: a leitura do `.env`, o hash de senhas, os logs e a interface de terminal usam apenas
  módulos nativos do Node.js.
---

## 14. Onde cada requisito do enunciado foi atendido

| Requisito | Onde está |
| --- | --- |
| MongoDB Driver para Node.js | `src/database/Database.js` (única dependência: `mongodb`) |
| Mínimo de 3 entidades/coleções | 5 coleções: `usuarios`, `contatos`, `conversas`, `mensagens`, `reacoes` |
| Mínimo de 3 classes de entidade | `Usuario`, `Contato`, `Conversa`, `Mensagem`, `Reacao` (+ `Modelo` abstrata) |
| Create | `Modelo.salvar()`, `Modelo.inserir()`, `Modelo.inserirMuitos()`, `Mensagem.enviar()`, `Conversa.criarGrupo()` |
| Read | `buscarPorId`, `obterPorId`, `buscarUm`, `listar`, `contar`, `agregar` + consultas próprias (`Usuario.pesquisar`, `Mensagem.listarHistorico`, `Mensagem.historicoDetalhado`, `Mensagem.pesquisar`, `Contato.listarAgenda`, `Conversa.listarPainelDoUsuario`) |
| Update | `atualizarPorId`, `atualizar`, `aplicarOperadores`, `atualizarMuitos`, `Mensagem.editar`, `Usuario.alterarSenha`, `Conversa.adicionarParticipante` |
| Delete | `excluirPorId`, `excluir`, `excluirMuitos`, `Mensagem.excluirParaTodos` (lógica), `ChatService.excluirMensagemDefinitivamente`, `ChatService.excluirConversa`, `ChatService.excluirUsuario` (cascata) |
| Orientação a Objetos | herança, classe abstrata, polimorfismo, encapsulamento e Singleton — ver seção 4 |
| Validação de campos obrigatórios | `Modelo.validar()`, `Modelo.prepararAtualizacao()` e `src/utils/Validador.js` |
| Tratamento de exceções | hierarquia em `src/errors/`, `Modelo.executar()`, `Aplicacao.executar()` e `Menu.executar()` |
| Registro de logs | `src/utils/Logger.js` → `logs/errors.log` e `logs/app.log` |
| Modularização | `src/models`, `src/services`, `src/database`, `src/utils`, `src/cli`, `src/errors`, `scripts` |
| Projeto testado antes da entrega | roteiro completo em [TESTES.md](TESTES.md) |

Para conferir tudo em uma única execução: `npm run setup && npm run demo`.
