// ============================================================
// app.js — Lógica principal do PWA de Teste de Push
//
// ⚠️  IMPORTANTE: Este app só funciona corretamente em:
//   • https://  (produção / ngrok / Cloudflare Tunnel)
//   • http://localhost ou http://127.0.0.1 (desenvolvimento local)
//
//   No iPhone, push notifications só funcionam se o PWA
//   estiver instalado na tela inicial (iOS 16.4+).
// ============================================================

// ──────────────────────────────────────────────────────────
// 1. REFERÊNCIAS DE ELEMENTOS DO DOM
// ──────────────────────────────────────────────────────────
const permissionBadge  = document.getElementById('permission-badge');
const btnActivate      = document.getElementById('btn-activate');
const btnDisparar      = document.getElementById('btn-disparar');
const inputValor       = document.getElementById('input-valor');
const inputProduto     = document.getElementById('input-produto');
const logArea          = document.getElementById('log-area');
const logEmpty         = document.getElementById('log-empty');

// ──────────────────────────────────────────────────────────
// 2. UTILITÁRIO: CONSOLE DE LOG NA TELA
//    Cada chamada a log() adiciona uma linha ao #log-area.
//    type: 'info' | 'ok' | 'warn' | 'err'
// ──────────────────────────────────────────────────────────
function log(mensagem, type = 'info') {
  // Remove o placeholder "Aguardando ações…" na primeira mensagem
  if (logEmpty) logEmpty.remove();

  // Formata o timestamp no padrão HH:MM:SS
  const agora = new Date();
  const ts = agora.toLocaleTimeString('pt-BR', { hour12: false });

  // Cria uma linha de log
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="ts">[${ts}]</span>${escaparHTML(mensagem)}`;

  logArea.appendChild(entry);

  // Auto-scroll para a última mensagem
  logArea.scrollTop = logArea.scrollHeight;
}

// Escapa caracteres HTML para evitar XSS no log
function escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────────────────
// 3. VARIÁVEL GLOBAL: REFERÊNCIA AO SERVICE WORKER REGISTRADO
//    Será usada para enviar mensagens ao SW via postMessage().
// ──────────────────────────────────────────────────────────
let swRegistration = null;

// ──────────────────────────────────────────────────────────
// 4. INICIALIZAÇÃO: REGISTRA O SERVICE WORKER AO CARREGAR A PÁGINA
// ──────────────────────────────────────────────────────────
window.addEventListener('load', async () => {

  // Verifica se o navegador suporta Service Workers
  if (!('serviceWorker' in navigator)) {
    log('Service Workers não são suportados neste navegador.', 'err');
    return;
  }

  try {
    // Registra o sw.js como service worker deste PWA
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    log('Service worker registrado ✓', 'ok');

    // Aguarda o SW estar ativo antes de continuar
    await navigator.serviceWorker.ready;
    log('Service worker ativo e pronto.', 'ok');

  } catch (erro) {
    log(`Erro ao registrar service worker: ${erro.message}`, 'err');
  }

  // Exibe o status atual da permissão de notificação
  atualizarStatusPermissao();
});

// ──────────────────────────────────────────────────────────
// 5. STATUS DE PERMISSÃO
//    Lê Notification.permission e atualiza o badge na tela.
//    Valores possíveis: "default" (pendente), "granted", "denied"
// ──────────────────────────────────────────────────────────
function atualizarStatusPermissao() {
  if (!('Notification' in window)) {
    permissionBadge.textContent = 'não suportado';
    log('API de Notification não disponível neste navegador.', 'warn');
    return;
  }

  const status = Notification.permission;

  // Mapeia o valor da API para textos em português e classes CSS
  const mapa = {
    'default':  { texto: 'pendente',  classe: 'pending' },
    'granted':  { texto: 'concedida', classe: 'granted' },
    'denied':   { texto: 'negada',    classe: 'denied'  },
  };

  const info = mapa[status] ?? { texto: status, classe: '' };

  permissionBadge.textContent = info.texto;
  permissionBadge.className   = info.classe;

  // Habilita ou desabilita o botão de disparar com base na permissão
  btnDisparar.disabled = (status !== 'granted');

  if (status === 'denied') {
    log('Permissão negada. Acesse as configurações do navegador para ativar.', 'warn');
  }
}

// ──────────────────────────────────────────────────────────
// 6. SOLICITAR PERMISSÃO + CRIAR PUSH SUBSCRIPTION
//    Chamado pelo botão "Ativar Notificações".
// ──────────────────────────────────────────────────────────
async function activateNotifications() {
  btnActivate.disabled = true;

  // ── 6a. Verificações de suporte ──────────────────────────
  if (!('Notification' in window)) {
    log('Notificações não suportadas neste navegador.', 'err');
    btnActivate.disabled = false;
    return;
  }

  if (!swRegistration) {
    log('Service worker ainda não está pronto. Tente novamente.', 'warn');
    btnActivate.disabled = false;
    return;
  }

  // ── 6b. Solicita permissão ao usuário ────────────────────
  log('Solicitando permissão de notificação…');
  let permissao;

  try {
    // requestPermission() pode retornar uma Promise (moderno)
    // ou usar callback (legado). Tratamos os dois casos.
    permissao = await Notification.requestPermission();
  } catch (erro) {
    log(`Erro ao solicitar permissão: ${erro.message}`, 'err');
    btnActivate.disabled = false;
    return;
  }

  atualizarStatusPermissao();

  if (permissao !== 'granted') {
    log(`Permissão ${permissao === 'denied' ? 'negada' : 'não concedida'}.`, 'warn');
    btnActivate.disabled = false;
    return;
  }

  log('Permissão concedida ✓', 'ok');

  // ── 6c. Cria a PushSubscription ──────────────────────────
  //
  // ╔══════════════════════════════════════════════════════╗
  // ║  INTEGRAÇÃO FUTURA COM BACKEND (VAPID / web-push)   ║
  // ║                                                      ║
  // ║  Para usar push real (via servidor), você precisará: ║
  // ║  1. Gerar um par de chaves VAPID no servidor:        ║
  // ║     const webpush = require('web-push');             ║
  // ║     const keys = webpush.generateVAPIDKeys();        ║
  // ║                                                      ║
  // ║  2. Substituir a string abaixo pela chave pública:   ║
  // ║     applicationServerKey: urlBase64ToUint8Array(     ║
  // ║       'SUA_VAPID_PUBLIC_KEY_AQUI'                    ║
  // ║     )                                                ║
  // ║                                                      ║
  // ║  3. Enviar o objeto `subscription` para o backend    ║
  // ║     para que ele possa chamar webpush.sendNotification║
  // ╚══════════════════════════════════════════════════════╝
  //
  // Por enquanto, tentamos criar a subscription mesmo sem
  // chave VAPID — funciona em alguns ambientes de teste,
  // mas pode falhar dependendo do navegador/versão do iOS.

  if ('PushManager' in window) {
    try {
      // Verifica se já existe uma subscription ativa
      let subscription = await swRegistration.pushManager.getSubscription();

      if (!subscription) {
        // Cria uma nova subscription.
        // Sem applicationServerKey => modo "sem VAPID" (limitado, para testes)
        // Quando adicionar o backend, substitua o bloco abaixo:
        subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          // applicationServerKey: urlBase64ToUint8Array('SUA_CHAVE_VAPID_PUBLICA'),
        });
      }

      log('Subscription criada ✓', 'ok');
      log(`Endpoint: ${subscription.endpoint.slice(0, 60)}…`);

      // Exibe o objeto de subscription no console do browser (para debug)
      console.log('[Push Teste] PushSubscription:', JSON.stringify(subscription));

    } catch (erro) {
      // Em testes locais sem VAPID isso pode falhar — é esperado.
      // A notificação LOCAL ainda funcionará via postMessage (passo 7).
      log(`PushManager.subscribe falhou (esperado sem VAPID): ${erro.message}`, 'warn');
      log('Notificações locais ainda funcionarão normalmente.', 'info');
    }
  } else {
    log('PushManager não disponível — notificações locais apenas.', 'warn');
  }

  btnActivate.disabled = false;
}

// ──────────────────────────────────────────────────────────
// 7. DISPARAR NOTIFICAÇÃO LOCAL (via Service Worker)
//    Chamado pelo botão "Disparar Notificação".
//
//    Enviamos uma mensagem para o SW via postMessage().
//    O SW escuta esse evento e chama self.registration.showNotification().
//    Isso simula o comportamento de uma notificação real,
//    sem precisar de servidor backend.
// ──────────────────────────────────────────────────────────
async function dispararNotificacao() {
  // ── 7a. Validações ───────────────────────────────────────
  if (!swRegistration) {
    log('Service worker não disponível.', 'err');
    return;
  }

  const valorRaw  = parseFloat(inputValor.value);
  const produto   = inputProduto.value.trim() || 'Produto sem nome';

  if (isNaN(valorRaw) || valorRaw < 0) {
    log('Digite um valor de venda válido.', 'warn');
    inputValor.focus();
    return;
  }

  // ── 7b. Formata o valor no padrão brasileiro ─────────────
  // Ex: 1250 → "1.250,00"
  const valorFormatado = valorRaw.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // ── 7c. Monta o payload da notificação ───────────────────
  const payload = {
    tipo:    'MOSTRAR_NOTIFICACAO',   // tipo de mensagem para o SW
    titulo:  'Você recebeu uma venda! 🎉',
    corpo:   `Produto: ${produto} — Valor: R$ ${valorFormatado}`,
    icone:   '/icon-192.png',
  };

  // ── 7d. Envia mensagem para o SW ─────────────────────────
  try {
    // Obtém a instância ativa do service worker
    const swAtivo = swRegistration.active;

    if (!swAtivo) {
      log('Service worker ativo não encontrado. Recarregue a página.', 'err');
      return;
    }

    swAtivo.postMessage(payload);
    log(`Notificação enviada → "${produto}" | R$ ${valorFormatado}`, 'ok');

  } catch (erro) {
    log(`Erro ao enviar notificação: ${erro.message}`, 'err');
  }
}

// ──────────────────────────────────────────────────────────
// 8. HELPER: CONVERTE CHAVE VAPID DE BASE64 PARA Uint8Array
//    Necessário ao chamar pushManager.subscribe() com VAPID.
//
//    USO FUTURO — descomentar quando adicionar o backend:
//    applicationServerKey: urlBase64ToUint8Array('SUA_CHAVE_AQUI')
// ──────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
