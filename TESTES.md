# Roteiro de Testes — ZapChat

Projeto 1 de **EC48B — Programação Web Back-End** · Gian Pedro Rodrigues (RA 2503638)

Roteiro para validar o projeto antes da entrega e guiar a demonstração. Instalação:
[README.md](README.md). Modelagem e estrutura: [ARQUITETURA.md](ARQUITETURA.md).

A Parte 6 cobre a exigência do item 12 do enunciado (instalar e executar em outro ambiente).

## Sumário

- [Parte 1 — Banco de dados e índices](#parte-1--banco-de-dados-e-índices)
- [Parte 2 — Demonstração automática](#parte-2--demonstração-automática)
- [Parte 3 — Trilha completa do menu](#parte-3--trilha-completa-do-menu)
- [Parte 4 — Logs](#parte-4--logs)
- [Parte 5 — Visualizador web](#parte-5--visualizador-web-extra-opcional)
- [Parte 6 — Teste em outro ambiente](#parte-6--teste-em-outro-ambiente-exigência-do-item-12)
- [Parte 7 — Checklist final de entrega](#parte-7--checklist-final-de-entrega)
- [Parte 8 — Roteiro de apresentação](#parte-8--roteiro-de-apresentação-5-a-8-minutos)

---

## Parte 1 — Banco de dados e índices

| # | Passo | Comando | Resultado esperado |
| --- | --- | --- | --- |
| 1.1 | Criar coleções e índices | `npm run setup` | tabela com **22 índices** nas 5 coleções e mensagem "Banco de dados preparado" |
| 1.2 | Conferir os índices únicos | (mesma saída) | `idx_email_unico`, `idx_apelido_unico`, `idx_agenda_unica` e `idx_reacao_unica` com `unico = true` |
| 1.3 | Conferir o índice de texto | (mesma saída) | `idx_busca_conteudo` em `mensagens` |

**O que isso comprova:** critério *Modelagem das entidades e organização do MongoDB*.

---

## Parte 2 — Demonstração automática

```bash
npm run demo
```

Percorre CREATE → READ → UPDATE → DELETE → erros → logs em uma saída só. Confira:

- [ ] inserções nas 5 coleções, com anexo, resposta e aviso do sistema;
- [ ] `hash de Ana: ...` — a senha não é gravada em texto puro;
- [ ] consultas com `$lookup`, busca por texto, paginação, ranking e estatísticas;
- [ ] atualizações (perfil, senha, edição de mensagem, renomear grupo, promover administrador);
- [ ] exclusão lógica (documento **preservado**) e definitiva (reações em cascata);
- [ ] termina com `✅ 34 excecoes capturadas, tratadas e registradas em log`;
- [ ] nenhuma linha com `nenhuma excecao foi lancada`, nenhum stack trace na tela.

**Comprova:** CRUD, validação dos campos obrigatórios, tratamento de erros e logs.

---

## Parte 3 — Trilha completa do menu

```bash
npm run seed    # recarrega os dados de exemplo (apaga o que existir)
npm start       # abre o menu
```

Senha de todos os usuários de exemplo: **`senha123`**. Siga as etapas **de cima para baixo** —
algumas dependem da anterior. Em qualquer lista, `0` cancela; se sair do trilho, rode `npm run seed`
e recomece. **ENTER** = Enter sem digitar nada (aceita o padrão ou volta ao menu).

### Etapa 0 — Trilha guiada (opção 14)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 0.1 | `14` → ENTER a cada bloco | 6 blocos: create, read, update, delete, validação/erros e logs |
| 0.2 | no final | "banco voltou ao estado anterior" e a tabela de contagem igual à do início |

> Atalho para quem só quer conferir o projeto rapidamente. As etapas seguintes testam as mesmas
> coisas manualmente, opção por opção.

### Etapa 1 — Entrar e cadastrar usuários (opções 1, 2 e 3)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 1.1 | `1` → `ana@zapchat.dev` → `senha123` | "Bem-vindo(a), aninha!" e o total de mensagens não lidas |
| 1.2 | `2` → nome `Ab` → e-mail `zzz` → senha `123` → ENTER nos demais | `ErroValidacao` listando **3 problemas** (nome curto, e-mail inválido, senha fraca) |
| 1.3 | `2` → `Felipe Rocha` → `felipe@zapchat.dev` → `senha123` → `felipao` → `(51) 90000-0000` → `🧑‍💼` → `Novo por aqui` | "Usuario cadastrado" com o `_id` |
| 1.4 | `2` → `Felipe Clone` → `felipe@zapchat.dev` → `senha123` → ENTER nos demais | `ErroBanco`: "Ja existe um registro com o mesmo valor em: email" (índice único) |
| 1.5 | `3` → ENTER | tabela com os **6** usuários |
| 1.6 | `3` → `lima` | só Bruno Lima (pesquisa por nome, apelido ou e-mail) |

### Etapa 2 — Agenda de contatos (opção 5)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 2.1 | `5` | agenda de Ana: Bruno (⭐ favorito), Carla e Diego |
| 2.2 | `5` → `1` → escolher **Felipe Rocha** → `Felipe da web` → `s` | "Contato adicionado" |
| 2.3 | `5` → `1` → escolher **Felipe Rocha** de novo → ENTER → `n` | `ErroRegraNegocio`: "Este usuario ja esta na sua lista de contatos" |
| 2.4 | `5` → `2` → escolher **Carla** | `favorito = true` (repita para voltar a `false`) |
| 2.5 | `5` → `3` → escolher **Diego** | `bloqueado = true` |
| 2.6 | `5` | Diego **continua na lista**, agora marcado como bloqueado |
| 2.7 | `5` → `3` → escolher **Diego** | `bloqueado = false` (desbloqueado) |
| 2.8 | `5` → `4` → escolher **Felipe** → `s` | "Contato removido" |

### Etapa 3 — Conversas e histórico (opções 6 e 7)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 3.1 | `6` | 3 conversas com a coluna `naoLidas` preenchida |
| 3.2 | `7` → escolher **Trabalho de Web Back-End** | histórico com: aviso do sistema, mensagem 📌 fixada, anexo `modelagem.pdf`, reações 🔥🔥👏 e o aviso de quantas foram marcadas como lidas |
| 3.3 | `6` | o `naoLidas` daquela conversa agora está **zerado** |

### Etapa 4 — Enviar mensagens (opção 8)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 4.1 | `8` → `1` → escolher o grupo → ENTER (tipo texto) → `Primeira mensagem da trilha` → `n` | "Mensagem enviada" com o `_id` |
| 4.2 | `8` → `1` → escolher o grupo → `imagem` → `Print da tela` → `tela.png` → `https://cdn.zapchat.dev/tela.png` → `90` → `n` | mensagem com anexo gravada |
| 4.3 | `8` → `1` → escolher o grupo → ENTER → `Respondendo a primeira` → `s` → escolher a mensagem 4.1 | mensagem enviada como resposta |
| 4.4 | `8` → `1` → escolher o grupo → `holograma` → `teste` → `n` | `ErroValidacao`: tipo aceita somente texto, imagem, arquivo, audio, video, sistema |
| 4.5 | `8` → `2` → escolher **Diego Alves** → ENTER → `Oi Diego, tudo certo?` → `n` | abre uma conversa privada nova e envia |
| 4.6 | `7` → escolher o grupo | a resposta aparece com `↳ em resposta a: "Primeira mensagem da trilha"` |

### Etapa 5 — Editar, reagir, fixar e apagar (opção 9)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 5.1 | `9` → escolher o grupo → `2` → escolher qualquer mensagem → escolher `👍` | "Reacao adicionada" + resumo |
| 5.2 | repita 5.1 com a **mesma** mensagem e o **mesmo** emoji | "Reacao removida" (o mesmo emoji alterna) |
| 5.3 | `9` → escolher o grupo → `1` → escolher uma mensagem **sua** → `Texto editado na trilha` | "Mensagem editada" |
| 5.4 | `9` → escolher o grupo → `3` → escolher uma mensagem | "Mensagem fixada" (repita para desafixar) |
| 5.5 | `9` → escolher o grupo → `4` → escolher a mensagem 4.2 (do anexo) | vira "Esta mensagem foi apagada" |
| 5.6 | `7` → escolher o grupo | a mensagem apagada **continua no histórico**, marcada como apagada |
| 5.7 | `9` → escolher o grupo → `5` → escolher a mensagem 4.3 → `s` | excluída do banco, com as reações removidas em cascata |

> Nas opções `1`, `4` e `5` a lista traz **só as suas mensagens** — é a regra "somente o autor".

### Etapa 6 — Grupos (opção 10)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 6.1 | `10` → `1` → `Grupo da trilha` → `Grupo criado no teste` → `🧪` → escolher **Bruno** → `s` → escolher **Carla** → `n` | grupo criado com mensagem automática do sistema |
| 6.2 | `10` → `2` → escolher **Grupo da trilha** → escolher **Diego** | participante adicionado + aviso "Diego Alves entrou no grupo" |
| 6.3 | `10` → `4` → escolher **Grupo da trilha** → escolher **Bruno** | administradores passam a 2 |
| 6.4 | `10` → `5` → escolher **Grupo da trilha** → `Grupo renomeado` | "Grupo renomeado" |
| 6.5 | `10` → `3` → escolher **Grupo renomeado** → escolher **Diego** | participante removido |
| 6.6 | `10` → `5` → escolher uma conversa **privada** | `ErroValidacao`: "Somente conversas do tipo grupo possuem nome" |
| 6.7 | `10` → `6` → escolher **Grupo renomeado** → `s` | conversa excluída com as mensagens e reações |

### Etapa 7 — Busca, relatórios e manutenção (opções 11, 12 e 13)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 7.1 | `11` → `README` | lista as mensagens que contêm o termo (índice de texto) |
| 7.2 | `11` → `zzzzzz` | "Mensagens encontradas: 0" |
| 7.3 | `12` | documentos por coleção, totais, ranking de remetentes e emojis |
| 7.4 | `13` → `2` | contagem de documentos nas 5 coleções |
| 7.5 | `13` → `3` | os 22 índices, com `unico = true` nos quatro índices únicos |
| 7.6 | `13` → `1` | "Indices criados" (rodar de novo não quebra nada) |

> Não use `13` → `4` ("Limpar o banco") no meio da trilha: ele apaga tudo.

### Etapa 8 — Trocar de usuário e regras por perfil (opção 1)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 8.1 | `1` → `2` → `carla@zapchat.dev` → `senha123` | sessão troca para Carla (veja o cabeçalho do menu) |
| 8.2 | `10` → `2` → escolher **Trabalho de Web Back-End** → escolher qualquer um | `ErroRegraNegocio`: "Somente administradores podem adicionar participantes" |
| 8.3 | `9` → escolher o grupo → `1` | a lista traz **só as mensagens de Carla** |
| 8.4 | `1` → `1` | "Ate logo, carlinha!" |
| 8.5 | `6` | "Entre com um usuario antes de usar esta opcao (opcao 1)" |

### Etapa 9 — Perfil e senha (opção 4)

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 9.1 | `1` → `ana@zapchat.dev` → `senha123` | entra de novo |
| 9.2 | `4` | tabela do perfil, **sem o hash da senha** |
| 9.3 | `4` → `1` → ENTER nos campos até `Recado` → `Testando a trilha` | "Perfil atualizado" |
| 9.4 | `4` → `2` → escolher `ocupado` | status alterado (aparece no cabeçalho do menu) |
| 9.5 | `4` → `3` → `qualquercoisa1` → `nova456` | `ErroRegraNegocio`: "A senha atual informada esta incorreta" |
| 9.6 | `4` → `3` → `senha123` → `novaSenha456` | "Senha alterada" |
| 9.7 | `1` → `1` (encerrar) → `1` → `ana@zapchat.dev` → `novaSenha456` | entra com a senha nova |
| 9.8 | `4` → `3` → `novaSenha456` → `senha123` | devolve a senha original (importante antes de apresentar) |

### Etapa 10 — Encerrar

| # | Digite | Deve acontecer |
| --- | --- | --- |
| 10.1 | `99` | "Opcao invalida" — e o menu continua |
| 10.2 | `0` | "Ate logo" e "Aplicacao encerrada" |
| 10.3 | abrir `logs/errors.log` | todos os erros que você provocou na trilha estão registrados |

**O que a trilha comprova:** as 13 opções do menu, as 5 coleções, as quatro operações CRUD, as regras
de negócio (autor, administrador, participante), a validação de campos e os erros registrados em log.

---

## Parte 4 — Logs

| # | Passo | Resultado esperado |
| --- | --- | --- |
| 4.1 | Abrir `logs/errors.log` | blocos com `[data hora]`, `NIVEL`, `TIPO`, `OPERACAO`, `MENSAGEM`, `DETALHES` e `STACK` |
| 4.2 | Conferir os tipos registrados | `ErroValidacao`, `ErroNaoEncontrado`, `ErroRegraNegocio`, `ErroBanco` e `ErroConexao` |
| 4.3 | Abrir `logs/app.log` | além dos erros, o histórico de inserções, atualizações, exclusões e conexões |
| 4.4 | Parar o MongoDB (`net stop MongoDB`) e rodar `npm start` | mensagem clara "Nao foi possivel conectar ao MongoDB...", **sem stack trace**, e o erro gravado no log |
| 4.5 | Religar o MongoDB (`net start MongoDB`) | a aplicação volta a funcionar normalmente |

**O que isso comprova:** critério *Implementação e armazenamento de logs* + tratamento do erro de
conexão exigido no item 8 do enunciado.

---

## Parte 5 — Visualizador web (extra opcional)

```bash
npm run web        # depois abra http://localhost:3000
```

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 5.1 | abrir a página | lista de conversas do primeiro usuário, com selos de não lidas |
| 5.2 | clicar numa conversa | histórico com autor, horário, anexo, 📌, reações e leituras |
| 5.3 | trocar o usuário em "Ver como" | a lista de conversas muda para a desse usuário |
| 5.4 | botão 📊 Estatísticas | 4 tabelas (coleções, resumo, ranking, emojis) |
| 5.5 | conferir que é somente leitura | não há formulários; a página só exibe dados |

> O projeto roda sem essa pasta: `npm start`, `npm run demo` e os demais scripts não dependem dela.

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
- [ ] O projeto roda **sem** a pasta `web/` (ela é um extra; mova-a para fora e repita as Partes 1 a 3).

---

## Parte 8 — Roteiro de apresentação (5 a 8 minutos)

1. **Tema e modelagem (1 min).** Mensagens instantâneas; 5 coleções: `usuarios`, `contatos`,
   `conversas`, `mensagens` e `reacoes`. Mostre o diagrama de relacionamentos do README.
2. **Orientação a Objetos (1,5 min).** Abra `src/models/Modelo.js`: a classe abstrata concentra o
   CRUD; as entidades só declaram `colecao`, `camposObrigatorios`, `camposAtualizaveis`, `indices` e
   `validarCampos()`. Cite herança, polimorfismo (`paraDocumento`, `validarCampos`) e encapsulamento
   (`#senhaHash` em `Usuario`).
3. **CRUD ao vivo (2 min).** `npm run demo`, que percorre as quatro operações nas cinco coleções.
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
- **"Usou algum framework?"** Não. Só o driver oficial `mongodb`; `.env`, hash de senha, logs e
  terminal usam módulos nativos (`fs`, `path`, `crypto`, `readline`).
