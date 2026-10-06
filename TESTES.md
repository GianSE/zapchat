# Roteiro de Testes — ZapChat

Projeto 1 de **EC48B — Programação Web Back-End** · Gian Pedro Rodrigues (RA 2503638)

Este roteiro serve para (1) validar o projeto antes da entrega e (2) guiar a demonstração na
apresentação. O enunciado exige que o projeto seja **testado pela equipe antes da entrega,
garantindo que seja possível instalá-lo e executá-lo corretamente em outro ambiente** — é
exatamente o que a Parte 6 deste documento verifica.

Instalação e passo a passo resumido: [README.md](README.md). Modelagem e estrutura do código:
[ARQUITETURA.md](ARQUITETURA.md).

Marque cada item conforme for testando.

## Sumário

- [Parte 0 — Preparação do ambiente](#parte-0--preparação-do-ambiente)
- [Parte 1 — Banco de dados e índices](#parte-1--banco-de-dados-e-índices)
- [Parte 2 — Demonstração automática](#parte-2--demonstração-automática-o-teste-mais-importante)
- [Parte 3 — Menu do terminal](#parte-3--menu-do-terminal)
- [Parte 4 — Interface web](#parte-4--interface-web-extra-opcional)
- [Parte 5 — Logs](#parte-5--logs)
- [Parte 6 — Teste em outro ambiente](#parte-6--teste-em-outro-ambiente-exigência-do-item-12)
- [Parte 7 — Checklist final de entrega](#parte-7--checklist-final-de-entrega)
- [Parte 8 — Roteiro de apresentação](#parte-8--roteiro-de-apresentação-5-a-8-minutos)

---

## Parte 0 — Preparação do ambiente

| # | Passo | Comando | Resultado esperado |
| --- | --- | --- | --- |
| 0.1 | Conferir o Node.js | `node -v` | v18 ou superior |
| 0.2 | Conferir o npm | `npm -v` | qualquer versão recente |
| 0.3 | Instalar o MongoDB | `winget install MongoDB.Server` ou o instalador do site | instalação concluída |
| 0.4 | Conferir o serviço | `Get-Service MongoDB` (PowerShell) | `Status = Running` |
| 0.5 | Instalar as dependências | `cd zapchat` e `npm install` | "added 12 packages", pasta `node_modules` criada |

> Se o serviço não estiver rodando: `net start MongoDB` (pode exigir PowerShell como administrador).

---

## Parte 1 — Banco de dados e índices

| # | Passo | Comando | Resultado esperado |
| --- | --- | --- | --- |
| 1.1 | Criar coleções e índices | `npm run setup` | tabela com **22 índices** nas 5 coleções e mensagem "Banco de dados preparado" |
| 1.2 | Conferir os índices únicos | (mesma saída) | `idx_email_unico`, `idx_apelido_unico`, `idx_agenda_unica` e `idx_reacao_unica` com `unico = true` |
| 1.3 | Conferir o índice de texto | (mesma saída) | `idx_busca_conteudo` em `mensagens` |

**O que isso comprova:** critério *Modelagem das entidades e organização do MongoDB*.

---

## Parte 2 — Demonstração automática (o teste mais importante)

```bash
npm run demo
```

Percorre tudo em uma execução só. Confira na saída:

- [ ] **Seção 2 (CREATE)** — 5 usuários, contatos, conversa privada, grupo, mensagens (texto, imagem,
      arquivo, resposta e sistema) e reações inseridos.
- [ ] Aparece `hash de Ana: ...` — comprova que **a senha não é gravada em texto puro**.
- [ ] **Seção 3 (READ)** — tabelas de painel do usuário, histórico com `$lookup` (autor + reações +
      mensagem respondida), busca por texto, estatísticas por autor, ranking e paginação.
- [ ] **Seção 4 (UPDATE)** — perfil, senha, edição de mensagem (`editada: true`), renomear grupo,
      adicionar participante, promover administrador, favoritar contato e alternar reação.
- [ ] **Seção 5 (DELETE)** — exclusão lógica ("apagada para todos", documento **preservado**),
      exclusão definitiva (remove reações em cascata e recalcula o resumo da conversa), remoção de
      participante, exclusão de usuário com dependências e exclusão de conversa inteira.
- [ ] **Seção 6** — termina com `✅ 34 excecoes capturadas, tratadas e registradas em log`.
- [ ] Nenhuma linha com `nenhuma excecao foi lancada (verificar regra)`.
- [ ] **Seção 7** — informa quantos registros existem em `logs/errors.log` (34 quando o arquivo está
      limpo; o log acumula entre execuções) e imprime os últimos registros gravados.
- [ ] O comando termina **sem travar e sem stack trace** na tela.

**O que isso comprova:** critérios *Implementação das operações CRUD*, *Validação dos campos
obrigatórios*, *Tratamento de erros e exceções* e *Implementação e armazenamento de logs*.

---

## Parte 3 — Menu do terminal

```bash
npm run seed    # carrega os dados de exemplo
npm start       # abre o menu
```

Após o `seed`, confira: **5 usuários, 9 contatos, 4 conversas, 15 mensagens e 5 reações**.

Roteiro no menu (senha de todos: `senha123`):

| # | Opção | O que fazer | Resultado esperado |
| --- | --- | --- | --- |
| 3.1 | `1` | Entrar com `ana@zapchat.dev` / `senha123` | "Bem-vindo(a), aninha!" e o total de não lidas |
| 3.2 | `1` | Entrar com a senha `errada` | `ErroRegraNegocio: E-mail ou senha incorretos` — e o menu **continua funcionando** |
| 3.3 | `2` | Cadastrar com nome `Ab`, e-mail `zzz`, senha `123` | `ErroValidacao` listando os 3 problemas |
| 3.4 | `2` | Cadastrar um usuário válido | "Usuario cadastrado" com o `_id` |
| 3.5 | `6` | Minhas conversas | tabela com as conversas e a coluna `naoLidas` |
| 3.6 | `7` | Abrir uma conversa | histórico com autor, hora, anexo, 📌 e reações; avisa quantas foram marcadas como lidas |
| 3.7 | `8` | Enviar mensagem de texto para a conversa | "Mensagem enviada" com o `_id` |
| 3.8 | `8` | Enviar uma mensagem do tipo `imagem` | pede nome/URL/tamanho do anexo e envia |
| 3.9 | `9` → `2` | Reagir a uma mensagem | "Reacao adicionada" + resumo; repetindo o mesmo emoji ela é **removida** |
| 3.10 | `9` → `1` | Editar uma mensagem sua | conteúdo alterado e marcado como editado |
| 3.11 | `9` → `4` | Apagar para todos | passa a exibir "Esta mensagem foi apagada" |
| 3.12 | `10` → `1` | Criar um grupo com 2 participantes | grupo criado com mensagem automática do sistema |
| 3.13 | `10` → `2` | Adicionar participante logado como **Carla** (não admin) | `ErroRegraNegocio: Somente administradores...` |
| 3.14 | `11` | Pesquisar `README` | lista as mensagens que contêm o termo |
| 3.15 | `12` | Estatísticas | documentos por coleção, ranking de remetentes e emojis |
| 3.16 | `13` → `3` | Listar índices | os 22 índices criados |
| 3.17 | `0` | Sair | "Ate logo" e encerramento limpo |

**O que isso comprova:** critérios *Implementação e adequação à temática* e *Orientação a Objetos e
organização das classes* (o menu só chama as classes; nenhuma regra está nele).

---

## Parte 4 — Interface web (extra opcional)

```bash
npm run web
```

Abra <http://localhost:3000> no navegador.

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 4.1 | Entrar com `ana@zapchat.dev` / `senha123` | abre a tela principal com as conversas e o total de não lidas |
| 4.2 | Clicar em uma conversa | histórico em balões, avisos do sistema, anexos, 📌, reações e contador de leituras |
| 4.3 | Enviar uma mensagem | aparece na hora; a prévia da conversa na lateral é atualizada |
| 4.4 | Escolher o tipo `imagem` e enviar | abre o formulário de anexo (nome, URL, tamanho) |
| 4.5 | Passar o mouse sobre uma mensagem e clicar em 😀 | reação aplicada; clicando no mesmo emoji ela sai |
| 4.6 | Editar (✏️) uma mensagem sua | conteúdo alterado e marcado como "(editada)" |
| 4.7 | Apagar (🗑️) escolhendo "Apagar para todos" | vira "Esta mensagem foi apagada", em itálico |
| 4.8 | Apagar escolhendo "Excluir definitivamente" | some da lista e o resumo da conversa é recalculado |
| 4.9 | "+ Grupo" com dois participantes | grupo criado com a mensagem automática do sistema |
| 4.10 | Aba **Contatos** | agenda com favoritar ⭐, bloquear 🚫, remover 🗑️ e abrir conversa 💬 |
| 4.10b | Bloquear um contato e depois desbloquear | ao bloquear, o contato **continua na lista**, com borda vermelha e "· bloqueado"; clicar de novo em 🚫 desbloqueia |
| 4.11 | Aba **Busca**, procurar `README` | resultados clicáveis que abrem a conversa |
| 4.12 | Botão **📊 Estatísticas** | 4 tabelas: documentos por coleção, resumo, ranking e emojis |
| 4.13 | "Criar uma conta" com e-mail inválido e senha `123` | aviso vermelho listando **cada campo inválido** (validação do back-end aparecendo na tela) |
| 4.14 | Criar conta repetindo um e-mail já usado | aviso "Ja existe um registro com o mesmo valor em: email" |

**Por que isso é útil na apresentação:** cada clique executa as mesmas classes do menu; os avisos
vermelhos mostram a validação e a hierarquia de exceções funcionando de ponta a ponta.

---

## Parte 5 — Logs

| # | Passo | Resultado esperado |
| --- | --- | --- |
| 5.1 | Abrir `logs/errors.log` | blocos com `[data hora]`, `NIVEL`, `TIPO`, `OPERACAO`, `MENSAGEM`, `DETALHES` e `STACK` |
| 5.2 | Conferir os tipos registrados | `ErroValidacao`, `ErroNaoEncontrado`, `ErroRegraNegocio`, `ErroBanco` e `ErroConexao` |
| 5.3 | Abrir `logs/app.log` | além dos erros, o histórico de inserções, atualizações, exclusões e conexões |
| 5.4 | Parar o MongoDB (`net stop MongoDB`) e rodar `npm start` | mensagem clara "Nao foi possivel conectar ao MongoDB...", **sem stack trace**, e o erro gravado no log |
| 5.5 | Religar o MongoDB (`net start MongoDB`) | a aplicação volta a funcionar normalmente |

**O que isso comprova:** critério *Implementação e armazenamento de logs* + tratamento do erro de
conexão exigido no item 8 do enunciado.

---

## Parte 6 — Teste em outro ambiente (exigência do item 12)

1. Copie a pasta `zapchat` para outro computador (ou outra pasta), **sem `node_modules`**:

   ```bash
   # a partir da pasta que contém zapchat
   robocopy zapchat C:\teste-entrega\zapchat /E /XD node_modules logs .git
   ```

2. No destino, execute apenas:

   ```bash
   cd C:\teste-entrega\zapchat
   npm install
   npm run setup
   npm run seed
   npm start
   ```

- [ ] `npm install` funciona sem erro (única dependência: `mongodb`).
- [ ] O projeto sobe sem nenhum ajuste manual de configuração.
- [ ] A pasta `logs/` é criada automaticamente na primeira execução.

---

## Parte 7 — Checklist final de entrega

- [ ] `node_modules/` **não** está no pacote entregue.
- [ ] `package.json` está presente e declara a dependência `mongodb`.
- [ ] `README.md` com nome, RA, temática, entidades, funcionalidades e instruções.
- [ ] 5 classes de entidade + a classe abstrata `Modelo`, cada uma em seu arquivo.
- [ ] Configuração de acesso ao MongoDB (`src/config/config.js` + `.env.example`).
- [ ] CRUD completo implementado pelo MongoDB Driver.
- [ ] Validação dos campos obrigatórios.
- [ ] Tratamento de exceções em todas as operações.
- [ ] Geração de logs em arquivo.
- [ ] `npm run demo` roda do início ao fim sem falha inesperada.
- [ ] O projeto roda **sem** a pasta `web/` (mova-a para fora e repita as Partes 1 a 3: a interface
      é um extra e o núcleo não depende dela).

---

## Parte 8 — Roteiro de apresentação (5 a 8 minutos)

1. **Tema e modelagem (1 min).** Mensagens instantâneas; 5 coleções: `usuarios`, `contatos`,
   `conversas`, `mensagens` e `reacoes`. Mostre o diagrama de relacionamentos do README.
2. **Orientação a Objetos (1,5 min).** Abra `src/models/Modelo.js`: a classe abstrata concentra o
   CRUD; as entidades só declaram `colecao`, `camposObrigatorios`, `camposAtualizaveis`, `indices` e
   `validarCampos()`. Cite herança, polimorfismo (`paraDocumento`, `validarCampos`) e encapsulamento
   (`#senhaHash` em `Usuario`).
3. **CRUD ao vivo (2 min).** `npm run demo` — ou a interface web, que é mais visual.
4. **Validação e exceções (1,5 min).** Tente cadastrar um usuário inválido e mostre a lista de erros;
   depois mostre a hierarquia em `src/errors/`.
5. **Logs (1 min).** Abra `logs/errors.log` e mostre um registro completo.
6. **Fechamento (30 s).** Única dependência é o driver `mongodb`; o resto é módulo nativo do Node.

### Perguntas prováveis e respostas curtas

- **"Por que uma classe abstrata?"** Para escrever o CRUD uma única vez. Cada entidade herda
  inserir/consultar/atualizar/excluir e só declara o que é específico dela.
- **"Onde a validação acontece?"** Em `Modelo.validar()` e `Modelo.prepararAtualizacao()`, sempre
  **antes** de acessar o banco, usando a classe `Validador`.
- **"Como os erros do MongoDB são tratados?"** `Modelo.executar()` envolve toda operação do driver e
  converte a falha em `ErroBanco` (ex.: código 11000 vira "já existe um registro com esse valor"),
  registrando no log antes de propagar.
- **"Por que duas formas de excluir mensagem?"** `excluirParaTodos` é exclusão lógica (preserva o
  histórico, como no WhatsApp); `excluirPorId` remove o documento e o `ChatService` apaga as reações
  vinculadas e recalcula o resumo da conversa.
- **"Usou algum framework?"** Não. Só o driver oficial `mongodb`; `.env`, hash de senha, logs,
  terminal e servidor web usam módulos nativos (`fs`, `path`, `crypto`, `readline`, `http`).
