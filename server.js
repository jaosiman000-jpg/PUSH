// ============================================================
// server.js — Servidor Backend Node.js para Push Notifications
//
// ℹ️ SOBRE O DOTENV:
// Carregamos a biblioteca 'dotenv' no início do arquivo. Ela lê o arquivo
// `.env` do seu projeto e adiciona os valores a `process.env`.
// Para definir as variáveis, crie um arquivo chamado `.env` na raiz do
// projeto (onde este server.js está) e defina as chaves como mostrado no .env.example.
// Exemplo de arquivo `.env`:
//   VAPID_PUBLIC_KEY=sua_chave_publica_aqui
//   VAPID_PRIVATE_KEY=sua_chave_privada_aqui
//   VAPID_EMAIL=mailto:seu-email@dominio.com
// ============================================================

require('dotenv').config();

const express = require('express');
const webpush = require('web-push');
const fs      = require('fs');
const path    = require('path');

const app = express();

// Porta do servidor (padrão 3000 ou o que estiver definido no ambiente)
const PORT = process.env.PORT || 3000;

// Configura o Express para interpretar corpos de requisições em formato JSON
app.use(express.json());

// Servimos os arquivos do frontend estáticos (HTML, CSS, JS, manifest, ícones)
// Isso hospeda tudo sob a mesma origem, prevenindo erros de CORS (Cross-Origin Resource Sharing).
app.use(express.static(path.join(__dirname)));

// Caminho do arquivo onde salvaremos as subscriptions.
const SUBS_FILE_PATH = path.join(__dirname, 'subscriptions.json');

// ──────────────────────────────────────────────────────────
// 1. CONFIGURAÇÃO DO VAPID (Chaves de Autenticação)
// ──────────────────────────────────────────────────────────
const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail      = process.env.VAPID_EMAIL;

// Validação inicial das variáveis de ambiente obrigatórias
if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
  console.error('\n❌ ERRO CRÍTICO DE CONFIGURAÇÃO:');
  console.error('As variáveis VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_EMAIL precisam ser configuradas no arquivo .env!');
  console.error('Use "npx web-push generate-vapid-keys" para gerar um par de chaves.\n');
  process.exit(1);
}

// Configura a biblioteca web-push para assinar todas as notificações
// com as nossas credenciais VAPID.
webpush.setVapidDetails(
  vapidEmail,
  vapidPublicKey,
  vapidPrivateKey
);

console.log('✓ Credenciais VAPID configuradas com sucesso.');

// ──────────────────────────────────────────────────────────
// 2. SISTEMA DE PERSISTÊNCIA DAS ASSINATURAS (Subscriptions)
// ──────────────────────────────────────────────────────────
let subscriptions = [];

// Função auxiliar para ler as subscriptions salvas no arquivo subscriptions.json
function carregarSubscriptions() {
  try {
    if (fs.existsSync(SUBS_FILE_PATH)) {
      const conteudo = fs.readFileSync(SUBS_FILE_PATH, 'utf8');
      subscriptions = JSON.parse(conteudo || '[]');
      console.log(`[Banco Local] ${subscriptions.length} assinatura(s) carregada(s) do arquivo.`);
    } else {
      subscriptions = [];
      console.log('[Banco Local] Arquivo de assinaturas inexistente. Iniciando lista vazia.');
    }
  } catch (err) {
    console.error('[Banco Local] Falha ao ler arquivo de assinaturas:', err.message);
    subscriptions = [];
  }
}

// Função auxiliar para salvar o array de subscriptions de volta no arquivo
//
// ⚠️ LIMITAÇÕES DE SALVAR EM ARQUIVO JSON VS. BANCO DE DADOS REAL:
// 1. Concorrência: Se duas requisições tentarem escrever ou ler o arquivo ao mesmo tempo,
//    o arquivo pode ficar corrompido ou uma das atualizações pode ser perdida (Race Conditions).
// 2. Desempenho: Escrever o arquivo inteiro no disco a cada alteração fica extremamente
//    lento conforme a quantidade de dados cresce.
// 3. Escalabilidade: Bancos de dados reais (PostgreSQL, MongoDB, etc.) lidam com travas
//    de linha (locks), transações ACID, consultas otimizadas e índices, tornando a busca
//    e escrita seguras e prontas para milhares de acessos concorrentes.
function salvarSubscriptions() {
  try {
    fs.writeFileSync(SUBS_FILE_PATH, JSON.stringify(subscriptions, null, 2), 'utf8');
    console.log('[Banco Local] Assinaturas persistidas no arquivo com sucesso.');
  } catch (err) {
    console.error('[Banco Local] Falha ao gravar arquivo de assinaturas:', err.message);
  }
}

// Carrega as assinaturas existentes no início do servidor
carregarSubscriptions();

// ──────────────────────────────────────────────────────────
// 3. ROTA: POST /subscribe
//    Recebe a subscription gerada no navegador e armazena.
// ──────────────────────────────────────────────────────────
app.post('/subscribe', (req, res) => {
  const novaSub = req.body;

  // Validação básica da subscription
  if (!novaSub || !novaSub.endpoint) {
    return res.status(400).json({ erro: 'Subscription inválida ou incompleta.' });
  }

  // Verifica se esse endpoint já está cadastrado para evitar duplicados
  const jaExiste = subscriptions.some(sub => sub.endpoint === novaSub.endpoint);

  if (!jaExiste) {
    subscriptions.push(novaSub);
    salvarSubscriptions();
    console.log(`[API] Nova assinatura registrada! Total agora: ${subscriptions.length}`);
    res.status(201).json({ mensagem: 'Inscrição registrada com sucesso!' });
  } else {
    console.log('[API] Assinatura já estava cadastrada. Nenhuma ação necessária.');
    res.status(200).json({ mensagem: 'Inscrição já cadastrada.' });
  }
});

// ──────────────────────────────────────────────────────────
// 4. ROTA: POST /enviar
//    Recebe { valor, produto }, gera o push e envia a todos.
// ──────────────────────────────────────────────────────────
app.post('/enviar', async (req, res) => {
  const { title, body, valor, produto } = req.body;

  let notificationTitle = title;
  let notificationBody = body;

  // Se o cliente enviar o formato antigo/alternativo (valor/produto), nós formatamos aqui:
  if (!notificationBody && valor !== undefined) {
    const valorFormatado = parseFloat(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const produtoNome = produto ? produto.trim() : 'Produto não informado';
    notificationTitle = title || 'Venda Aprovada!';
    notificationBody = `Valor: R$ ${valorFormatado}`;
  }

  // Fallbacks finais caso os campos venham vazios
  notificationTitle = notificationTitle || 'Venda Aprovada!';
  notificationBody = notificationBody || 'Valor: R$ 0,00';

  console.log(`\n[Notificação] Iniciando disparo para ${subscriptions.length} assinatura(s)...`);
  console.log(`[Notificação] Título: "${notificationTitle}" | Corpo: "${notificationBody}"`);

  // Payload que será enviado de forma criptografada para o navegador/dispositivo
  const payload = JSON.stringify({
    title: notificationTitle,
    body: notificationBody,
    icon: '/icon-192.png',
    url: '/'
  });

  let sucessos = 0;
  let falhas = 0;
  let assinaturasExpiradas = [];

  // Mapeia todas as assinaturas e tenta enviar a notificação em paralelo
  const promessasDeEnvio = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, payload);
      sucessos++;
    } catch (err) {
      falhas++;
      console.error(`[Notificação] Falha no endpoint: ${sub.endpoint.slice(0, 45)}...`);
      console.error(`[Notificação] Motivo: Código HTTP ${err.statusCode} | ${err.message}`);

      // ⚠️ POR QUE REMOVER ASSINATURAS INVÁLIDAS?
      // Se o usuário remover o PWA da tela inicial, desativar as notificações no navegador ou se a subscription expirar,
      // os servidores da Apple (APNs) ou do Google (FCM) retornam erro 410 (Gone) ou 404 (Not Found).
      // Se continuarmos mandando notificações para endpoints inativos, sobrecarregamos nosso servidor e os servidores push
      // podem bloquear ou colocar nosso servidor em lista negra (blacklist) por floodar endpoints mortos.
      if (err.statusCode === 410 || err.statusCode === 404) {
        assinaturasExpiradas.push(sub.endpoint);
      }
    }
  });

  // Aguarda todos os disparos terminarem
  await Promise.all(promessasDeEnvio);

  // Se houver assinaturas inativas/expiradas, nós as removemos da lista
  if (assinaturasExpiradas.length > 0) {
    console.log(`[Limpeza] Removendo ${assinaturasExpiradas.length} assinaturas inativas da lista...`);
    subscriptions = subscriptions.filter(sub => !assinaturasExpiradas.includes(sub.endpoint));
    salvarSubscriptions();
  }

  console.log(`[Notificação] Disparo finalizado: ${sucessos} com sucesso, ${falhas} falhas.\n`);

  res.status(200).json({
    mensagem: 'Notificação enviada!',
    total: subscriptions.length + assinaturasExpiradas.length,
    enviados: sucessos,
    falhas: falhas,
    removidas: assinaturasExpiradas.length
  });
});

// ──────────────────────────────────────────────────────────
// 5. INICIALIZAÇÃO DO SERVIDOR
// ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`   Arquivos estáticos do frontend sendo servidos na raiz.`);
  console.log(`============================================================\n`);
});
