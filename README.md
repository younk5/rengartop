# O Colar de Presas — guia de Rengar

Site-guia de Rengar com matchups, build/runas gerais, combos e clipes. Seu amigo posta tudo direto pelo painel de admin (login + formulários), sem precisar mexer em código.

## Como funciona

- **Site público**: `index.html` (matchups), `guide.html` (build geral, combos, macro, clipes).
- **Admin**: `admin/login.html` e `admin/dashboard.html` — só quem estiver na lista de e-mails autorizados consegue postar/editar.
- **Dados**: tudo fica no Firestore (banco do Firebase), então o site atualiza pra qualquer visitante assim que o admin salva algo — sem precisar fazer novo deploy.

## Passo 1 — Criar o projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um projeto novo (pode ser gratuito, plano Spark).
2. No menu lateral, entre em **Build > Authentication** > aba **Sign-in method** > ative **E-mail/senha**.
3. Ainda em Authentication, aba **Users**, clique em **Add user** e crie uma conta (e-mail + senha) pra você e outra pro seu amigo.
4. Entre em **Build > Firestore Database** > **Create database** > modo produção, escolha a região mais próxima (ex: `southamerica-east1`).
5. Na aba **Regras** do Firestore, cole o conteúdo do arquivo `firestore.rules` deste projeto (trocando os e-mails pelos de vocês) e publique.
6. No menu lateral, clique na engrenagem > **Configurações do projeto** > role até "Seus apps" > clique no ícone `</>` (Web) > registre um app (não precisa de Hosting) > copie o objeto `firebaseConfig`.

## Passo 2 — Configurar o projeto

Abra `public/js/firebase-config.js` e:
- Cole os valores do `firebaseConfig` que você copiou.
- Preencha `ADMIN_EMAILS` com o seu e-mail e o do seu amigo (os mesmos criados no passo 1.3).

Faça o mesmo com os e-mails dentro de `firestore.rules` (é uma segunda camada de proteção — a que realmente impede escrita não autorizada).

## Passo 3 — Rodar local

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Pra postar o primeiro matchup, vá em `http://localhost:3000/admin/login.html` e entre com a conta criada no passo 1.3.

## Passo 4 — Deploy (Vercel)

```bash
npx vercel
```

Ou conecte o repositório do GitHub direto no [vercel.com](https://vercel.com) — o `vercel.json` já está configurado. Depois do deploy, o site fica em algo como `colar-de-presas.vercel.app`.

## Estrutura

```
public/
  index.html        → home com os matchups
  guide.html         → build geral, combos, macro, clipes
  matchup.html        → detalhe de um matchup
  css/style.css        → estilo (tema "colar de presas")
  js/data.js            → lista de campeões + helpers de ícone (Data Dragon)
  js/firebase-config.js  → SUAS credenciais (edite aqui)
  js/firebase-init.js     → inicialização do Firebase
  js/app.js, matchup.js, guide.js → lógica de cada página
  admin/
    login.html, dashboard.html → painel do admin
    js/login.js, dashboard.js
firestore.rules   → regras de segurança pra colar no Console do Firebase
```

## Segurança (revisão feita)

Esse projeto é um site 100% estático que fala direto com o Firebase — não existe backend próprio guardando segredo nenhum, então o modelo de segurança é: **tudo que é público pode ser lido por qualquer um, e a única coisa que protege escrita é a regra do Firestore**. Itens verificados/corrigidos:

- **`apiKey` do Firebase no `firebase-config.js` fica visível no navegador — isso é esperado e normal.** Ela não é um segredo (o próprio Firebase documenta isso); quem protege os dados são as `firestore.rules`, não o sigilo dessa chave. **Não** tem nenhuma chave de servidor, service account, ou credencial sensível em nenhum arquivo do projeto.
- **Não existe cadastro público de admin**: o login só usa `signInWithEmailAndPassword`; contas só são criadas manualmente no Console do Firebase, então ninguém consegue se autocadastrar como admin.
- **XSS armazenado**: os textos vindos do Firestore (nome de campeão, runas, título/descrição/URL de clipe, etc.) eram inseridos via `innerHTML` sem escapar. Corrigido: criei `public/js/sanitize.js` com `escapeHtml()`/`safeUrl()`/`extractYoutubeId()` e apliquei em `app.js`, `matchup.js`, `guide.js` e `admin/js/dashboard.js`. Isso evita que um HTML/script malicioso digitado em qualquer campo (inclusive se uma conta de admin for comprometida) execute no navegador de quem visita o site.
- **Link de clipe** agora só aceita `http://` ou `https://` (bloqueia `javascript:` e afins) e abre com `rel="noopener noreferrer"`.
- **Headers de segurança** adicionados no `vercel.json`: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e `Strict-Transport-Security`.
- **Deploy estático real**: o `vercel.json` foi trocado do formato antigo (`builds`/`routes` apontando pro Express) para deploy estático direto da pasta `public/`. O `server.js`/Express só é usado pra rodar local (`npm start`); não sobe pra Vercel nem faz parte do deploy final.
- **`node_modules` fora do deploy/git**: adicionei `.gitignore` e `.vercelignore`. Rode `npm install` localmente quando precisar; não é necessário (nem enviado) em produção, já que a Vercel serve arquivos estáticos.

### Recomendações extras (fora do código, configuração no Firebase)

1. No Console do Firebase, em **Authentication > Sign-in method**, deixe habilitado **só** e-mail/senha (sem login anônimo, sem outros provedores) e confirme que "criação de conta pelo próprio usuário" não está possível — hoje o app não usa isso, mas vale conferir no painel.
2. Ative **App Check** no projeto (Firestore + Auth) pra bloquear requisições que não venham do seu domínio/app — reduz abuso por bots/scripts externos.
3. Revise periodicamente a lista de `ADMIN_EMAILS` no `firebase-config.js` **e** em `firestore.rules` (as duas precisam bater; a que realmente protege escrita é a do `firestore.rules`).
4. Se quiser uma camada a mais, dá pra exigir `request.auth.token.email_verified == true` dentro de `isAdmin()` no `firestore.rules` — só faça isso depois de confirmar que as contas de admin estão com e-mail verificado no Console, senão vocês ficam trancados pra fora.

## Guia geral — como preencher pra ficar bonito

A aba **Guia geral** do painel admin (`admin/dashboard.html`) alimenta a página `guide.html` com o mesmo visual "editorial" do resto do site: grade de runas, combos com ícone das habilidades e macro numerado.

- **Build & runas**: texto livre + o buscador de runas (igual ao das matchups). A **primeira runa que você adicionar vira a keystone** (fica destacada, maior, com o brilho dourado) — as outras aparecem em volta.
- **Combos**: clique em "+ Adicionar combo" pra cada sequência. Preencha título, descrição, e a **sequência** separada por vírgula:
  - `Mato` (ou qualquer palavra) vira um chip de texto tracejado.
  - `Q`, `W`, `E`, `R` viram o ícone da habilidade correspondente (busca automática pelo Data Dragon).
  - `Q*` (letra + asterisco) marca a habilidade como **empoderada** (fica com borda dourada e a etiqueta "emp.").
  - Exemplo: `Mato, Q, W` ou `R, E, Q, W*`.
- **Dica**: um texto curto que aparece destacado (fundo avermelhado) logo abaixo dos combos.
- **Macro & solo queue**: clique em "+ Adicionar tópico" pra cada ponto — eles aparecem numerados automaticamente (01, 02, 03...) na ordem em que você os adiciona.

Tudo isso fica salvo em `guideContent/main` no Firestore, então dá pra editar quantas vezes quiser sem precisar mexer em código.

## Extras que dá pra pedir depois

- Adicionar um campeão novo que a Riot lançou: é só acrescentar uma linha em `CHAMPIONS` no `public/js/data.js`.
- Trocar as cores/fontes: tudo centralizado em `public/css/style.css` (variáveis no topo do arquivo).
- Domínio próprio: dá pra configurar na Vercel depois do deploy.
