# PWA Teste de Notificações Push com Node.js e VAPID 🔔

Este projeto é um guia prático completo para testar notificações push nativas no **iOS (iPhone)** e navegadores de desktop usando um Progressive Web App (PWA) e um servidor Node.js com a biblioteca **Web Push** (VAPID).

---

## 🚀 Passo a Passo para Configuração e Execução

### Passo 1: Instalar as Dependências
Abra o seu terminal na pasta do projeto e execute o comando abaixo para instalar as bibliotecas necessárias (`express`, `web-push`, `dotenv`):

```bash
npm install
```

---

### Passo 2: Configurar o Arquivo `.env` (Chaves de Segurança)
Para enviar notificações push, precisamos de um par de chaves VAPID (uma pública e uma privada) que identificam e autorizam o nosso servidor a disparar mensagens para o seu celular.

1. No terminal, gere as chaves rodando o seguinte comando:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. O terminal vai exibir duas chaves em formato Base64.
3. Duplique o arquivo `.env.example` e mude o nome da cópia para `.env`.
4. Abra o arquivo `.env` e preencha as chaves e seu e-mail:
   ```env
   VAPID_PUBLIC_KEY=COLE_SUA_CHAVE_PUBLICA_GERADA_AQUI
   VAPID_PRIVATE_KEY=COLE_SUA_CHAVE_PRIVADA_GERADA_AQUI
   VAPID_EMAIL=mailto:seu-email@dominio.com
   PORT=3000
   ```

---

### Passo 3: Colar a Chave Pública no Frontend (`app.js`)
Para que o navegador (Safari/Chrome) consiga assinar a notificação com a chave do seu servidor, você precisa fornecer a chave pública para ele.

1. Abra o arquivo [app.js](file:///Users/joaosiman/PUSH%20HOTMART/app.js).
2. Na linha **6**, substitua `"COLE_AQUI"` pela sua **chave pública** gerada no passo anterior.
   ```javascript
   const VAPID_PUBLIC_KEY = "SUA_CHAVE_PUBLICA_GERADA_AQUI";
   ```

---

### Passo 4: Iniciar o Servidor
Com tudo configurado, inicie o servidor com o comando:

```bash
npm start
```
Você verá uma mensagem no console dizendo que o servidor está rodando em `http://localhost:3000`.

---

### Passo 5: Expor o Servidor para HTTPS (Necessário para o iPhone)
**⚠️ IMPORTANTE:** Por motivos de segurança, o iOS só permite registrar notificações e instalar PWAs se o site estiver rodando em uma conexão segura **HTTPS** (com exceção do `localhost` no desktop).

Para criar uma conexão HTTPS temporária e segura apontando para a sua máquina local, você pode usar o **ngrok**:

1. No seu terminal, em uma nova aba, execute:
   ```bash
   npx -y ngrok http 3000
   ```
2. O terminal do ngrok vai iniciar e mostrar uma linha contendo o endereço público seguro. Exemplo:
   `Forwarding  https://a1b2-34-56-78.ngrok-free.app -> http://localhost:3000`
3. Copie o endereço que começa com **`https://`**.

---

## 📲 Como testar no seu iPhone (iOS 16.4+)

1. **Abra o link do ngrok:** Abra o navegador **Safari** no seu iPhone e acesse o endereço `https://` copiado do ngrok.
2. **Adicione à Tela de Início (Home Screen):** 
   - Toque no botão de **Compartilhar** (ícone da caixinha com uma seta para cima `⬆️`).
   - Role as opções para baixo e toque em **"Adicionar à Tela de Início"**.
   - Confirme tocando em **"Adicionar"**.
3. **Abra o Aplicativo:** Um ícone chamado "Push Teste" aparecerá na tela inicial do seu celular. **Abra o aplicativo por esse ícone** (a API de Push só é liberada se o app for aberto pela tela inicial, e não diretamente pelo Safari!).
4. **Ative as Notificações:**
   - Toque no botão azul **"🔔 Ativar Notificações"**.
   - O iOS exibirá o alerta nativo perguntando se você deseja permitir notificações. Toque em **"Permitir"**.
   - O console de log na parte de baixo do aplicativo deve mostrar:
     - `Permissão concedida pelo usuário! ✓`
     - `Subscription gerada no navegador ✓`
     - `Subscription salva no backend com sucesso! 🎉`
5. **Realize o Teste de Venda:**
   - No campo **Valor da venda (R$)**, digite um valor (ex: `1500`).
   - No campo **Nome do produto**, digite um nome (ex: `Mentoria de Negócios`).
   - Bloqueie a tela do celular ou saia do aplicativo (vá para a tela inicial para testar com o app fechado).
   - Se estiver com o celular aberto ou no computador, toque no botão verde **"🚀 Disparar Notificação"**.
   - **Resultado:** Em poucos segundos, você ouvirá o som e verá o banner da notificação no seu iPhone: **"Você recebeu uma venda! 🎉 Produto: Mentoria de Negócios — Valor: R$ 1.500,00"**.
