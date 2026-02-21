# Deploy Completo no Railway

Neste guia, você verá como colocar tanto o Frontend (Next.js) quanto o Backend (Express/Playwright) **gratuitamente ou por poucos centavos** na Railway, conectando-os um ao outro para rodarem 24/7.

## Passo 1: Subir o código no GitHub
Como este projeto tem duas pastas (`frontend` e `backend`), certifique-se de fazer o commit de TODO este repositório raiz (a pasta `whatsapp_saas`) para o seu GitHub. A Railway precisa das duas pastas no mesmo repositório master.

## Passo 2: O Backend (Extrator e Zap)
1. Crie uma conta no [Railway](https://railway.app/).
2. Clique em **New Project** > **Deploy from GitHub repo** e selecione o seu repositório `whatsapp_saas`.
3. Na janela que abrirá, clique com botão direito no seu projeto do GitHub e escolha **Settings**.
4. Desça até a aba **Deploy** e preencha o campo **Root Directory** com a palavra `/backend`. Isso diz para a Railway só olhar essa pasta.
5. No mesmo modal, role para baixo até a opção de **Build Command** ou **Docker**. Você verá que o Railway já reconheceu o nosso `Dockerfile`. Mantenha as configurações padrão (ele vai usar aquele Dockerfile que eu acabei de criar, com instalações embutidas do Playwright Linux para Maps).
6. Na aba **Variables**, adicione uma variável: `PORT=3001` .
7. Clique na aba **Networking** em cima e gere um domínio público clicando no botão **Generate Domain** (ex: `meubackend-up.railway.app`). Copie esse link e guarde.

## Passo 3: O Frontend (Design e Dashboard)
1. Ainda no mesmo projeto da Railway, clique de novo no botão **+ Add > GitHub Repo** e selecione o SEU MESMO repositório de novo (sim, você terá "2 blocos" do seu repositório no mesmo projeto).
2. Vá nas **Settings** desse segundo bloco e, em **Root Directory**, digite `/frontend`. A Railway imediatamente perceberá que é um projeto Next.js e vai auto-compilar pra produção.
3. Importante: Vá na aba **Variables** do Frontend e crie a variável de ambiente secreta:
   * **NOME DA VARIÁVEL**: `NEXT_PUBLIC_API_URL`
   * **VALOR**: *Cole aqui a URL que você gerou no passo anterior para o backend (`https://meubackend-up.railway.app`)*
   ⚠️ *Atenção: se colocar barra '/' no final do domínio, não vai funcionar! Deixe exatamente `https://abc.railway.app`*.
4. Vá em **Networking** desse card front e gire o domínio público dele (`frontendlindo.railway.app`).

Pronto!! Seu sistema está no ar! Basta acessar o link do seu Frontend. Ao abrir o site, ele pegará a variável publicadora conectando instantaneamente na API de WhatsApp e Extrator abrigadas do outro lado e tudo funcionará nos conformes. Mande bala🚀
