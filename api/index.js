// ============================================================
// api/index.js — Servidor Backend adaptado para Vercel Serverless
// ============================================================

const path = require('path');
// Carrega o dotenv do diretório raiz se estiver rodando localmente
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const webpush = require('web-push');
const fs      = require('fs');

const app = express();

// Porta do servidor (padrão 3000 ou o que estiver definido no ambiente)
const PORT = process.env.PORT || 3000;

// Configura o Express para interpretar corpos de requisições em formato JSON
app.use(express.json());

// Servimos os arquivos do frontend estáticos (HTML, CSS, JS, manifest, ícones)
// Como este arquivo fica na pasta /api, subimos um nível para encontrar o frontend
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

// Caminho do arquivo de subscriptions:
// Na Vercel, a escrita em disco é bloqueada exceto na pasta '/tmp'.
// Localmente, salvamos na raiz do projeto.
const SUBS_FILE_PATH = process.env.VERCEL
  ? path.join('/tmp', 'subscriptions.json')
  : path.join(__dirname, '..', 'subscriptions.json');

// ──────────────────────────────────────────────────────────
// 1. CONFIGURAÇÃO DO VAPID (Chaves de Autenticação)
// ──────────────────────────────────────────────────────────
const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail      = process.env.VAPID_EMAIL;

// Validação inicial das variáveis de ambiente obrigatórias
if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
  console.error('\n❌ ERRO CRÍTICO DE CONFIGURAÇÃO:');
  console.error('As variáveis VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_EMAIL precisam ser configuradas!');
  console.error('Localmente, configure no arquivo .env na raiz.');
  console.error('Na Vercel, adicione-as no Dashboard do projeto em "Environment Variables".\n');
} else {
  // Configura a biblioteca web-push para assinar todas as notificações
  webpush.setVapidDetails(
    vapidEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
  console.log('✓ Credenciais VAPID configuradas com sucesso.');
}

// ──────────────────────────────────────────────────────────
// 2. SISTEMA DE PERSISTÊNCIA DAS ASSINATURAS (Subscriptions)
// ──────────────────────────────────────────────────────────
let subscriptions = [];

// Função auxiliar para ler as subscriptions salvas
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

// Função auxiliar para salvar o array de subscriptions
function salvarSubscriptions() {
  try {
    fs.writeFileSync(SUBS_FILE_PATH, JSON.stringify(subscriptions, null, 2), 'utf8');
    console.log('[Banco Local] Assinaturas persistidas no arquivo com sucesso.');
  } catch (err) {
    console.error('[Banco Local] Falha ao gravar arquivo de assinaturas:', err.message);
  }
}

// Carrega as assinaturas existentes no início
carregarSubscriptions();

// ──────────────────────────────────────────────────────────
// 3. ROTA: POST /subscribe
// ──────────────────────────────────────────────────────────
app.post('/subscribe', (req, res) => {
  const novaSub = req.body;

  // Garante que as assinaturas sejam recarregadas do disco (caso outra função serverless tenha alterado)
  carregarSubscriptions();

  if (!novaSub || !novaSub.endpoint) {
    return res.status(400).json({ erro: 'Subscription inválida ou incompleta.' });
  }

  // Verifica se esse endpoint já está cadastrado
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
// ──────────────────────────────────────────────────────────
app.post('/enviar', async (req, res) => {
  // Garante que estamos com a lista mais recente do arquivo
  carregarSubscriptions();

  const { title, body, valor, produto, subscription } = req.body;

  let notificationTitle = title;
  let notificationBody = body;

  if (!notificationBody && valor !== undefined) {
    const valorFormatado = parseFloat(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const produtoNome = produto ? produto.trim() : 'Produto não informado';
    notificationTitle = title || 'Venda Aprovada!';
    notificationBody = `Valor: R$ ${valorFormatado}`;
  }

  notificationTitle = notificationTitle || 'Venda Aprovada!';
  notificationBody = notificationBody || 'Valor: R$ 0,00';

  // Determina os alvos do disparo:
  // Se a requisição enviou a assinatura diretamente, mandamos apenas para ela (ideal para Serverless/Vercel)
  // Caso contrário, enviamos para todas as assinaturas armazenadas no arquivo
  let alvos = [];
  if (subscription && subscription.endpoint) {
    alvos.push(subscription);
  } else {
    alvos = [...subscriptions];
  }

  console.log(`\n[Notificação] Iniciando disparo para ${alvos.length} assinatura(s)...`);
  console.log(`[Notificação] Título: "${notificationTitle}" | Corpo: "${notificationBody}"`);

  const payload = JSON.stringify({
    title: notificationTitle,
    body: notificationBody,
    icon: '/icon-192.png',
    url: '/'
  });

  let sucessos = 0;
  let falhas = 0;
  let assinaturasExpiradas = [];

  const promessasDeEnvio = alvos.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, payload);
      sucessos++;
    } catch (err) {
      falhas++;
      console.error(`[Notificação] Falha no endpoint: ${sub.endpoint.slice(0, 45)}...`);
      console.error(`[Notificação] Motivo: Código HTTP ${err.statusCode} | ${err.message}`);

      if (err.statusCode === 410 || err.statusCode === 404) {
        assinaturasExpiradas.push(sub.endpoint);
      }
    }
  });

  await Promise.all(promessasDeEnvio);

  // Só removemos do banco de dados persistente se o disparo foi feito a partir dele
  if (assinaturasExpiradas.length > 0 && !subscription) {
    console.log(`[Limpeza] Removendo ${assinaturasExpiradas.length} assinaturas inativas da lista...`);
    subscriptions = subscriptions.filter(sub => !assinaturasExpiradas.includes(sub.endpoint));
    salvarSubscriptions();
  }

  console.log(`[Notificação] Disparo finalizado: ${sucessos} com sucesso, ${falhas} falhas.\n`);

  res.status(200).json({
    mensagem: 'Notificação enviada!',
    total: alvos.length,
    enviados: sucessos,
    falhas: falhas,
    removidas: subscription ? 0 : assinaturasExpiradas.length
  });
});

// ──────────────────────────────────────────────────────────
// 5. INICIALIZAÇÃO LOCAL (se rodado diretamente)
// ──────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n============================================================`);
    console.log(`🚀 Servidor rodando localmente em: http://localhost:${PORT}`);
    console.log(`============================================================\n`);
  });
}

// Exporta o app Express para a Vercel executar como Serverless Function
module.exports = app;
