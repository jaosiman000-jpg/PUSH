// ============================================================
// sw.js — Service Worker do PWA de Teste de Push
//
// O Service Worker é um script que roda em segundo plano,
// separado da aba do navegador. Ele pode:
//   • Interceptar requisições de rede (cache)
//   • Receber push notifications do servidor
//   • Mostrar notificações mesmo com a aba fechada
//
// CICLO DE VIDA:
//   install  → SW baixado e instalado
//   activate → SW entra em controle das páginas
//   fetch    → SW intercepta requisições (não usado aqui)
//   push     → SW recebe evento push do servidor
//   message  → SW recebe mensagens da página via postMessage
// ============================================================

// ──────────────────────────────────────────────────────────
// 1. EVENTO: install
//    Disparado quando o SW é instalado pela primeira vez
//    (ou quando o arquivo sw.js muda e ele é atualizado).
//
//    self.skipWaiting() faz o SW pular a fase de "espera"
//    e entrar em ativação imediatamente — útil durante testes.
// ──────────────────────────────────────────────────────────
self.addEventListener('install', (evento) => {
  console.log('[SW] Instalando service worker…');

  evento.waitUntil(
    // ╔══════════════════════════════════════════════════╗
    // ║  INTEGRAÇÃO FUTURA — CACHE DE ARQUIVOS          ║
    // ║  Para cache offline, você usaria algo assim:    ║
    // ║  caches.open('push-teste-v1').then(cache => {   ║
    // ║    return cache.addAll(['/','index.html',...]);  ║
    // ║  })                                             ║
    // ╚══════════════════════════════════════════════════╝
    self.skipWaiting()   // pula a fase de espera imediatamente
  );
});

// ──────────────────────────────────────────────────────────
// 2. EVENTO: activate
//    Disparado quando o SW assume o controle da página.
//    clients.claim() faz com que o SW controle imediatamente
//    todas as abas abertas — sem precisar recarregar.
// ──────────────────────────────────────────────────────────
self.addEventListener('activate', (evento) => {
  console.log('[SW] Service worker ativado.');

  evento.waitUntil(
    // ╔══════════════════════════════════════════════════╗
    // ║  INTEGRAÇÃO FUTURA — LIMPEZA DE CACHES ANTIGOS  ║
    // ║  caches.keys().then(keys => {                   ║
    // ║    return Promise.all(                          ║
    // ║      keys.filter(k => k !== 'push-teste-v1')   ║
    // ║          .map(k => caches.delete(k))            ║
    // ║    );                                           ║
    // ║  })                                             ║
    // ╚══════════════════════════════════════════════════╝
    self.clients.claim()   // assume controle imediato de todas as abas
  );
});

// ──────────────────────────────────────────────────────────
// 3. EVENTO: message
//    Recebe mensagens enviadas pela página via postMessage().
//    É assim que disparamos notificações LOCALMENTE
//    (sem precisar de servidor) para testar no iOS.
//
//    O app.js envia: { tipo: 'MOSTRAR_NOTIFICACAO', ... }
// ──────────────────────────────────────────────────────────
self.addEventListener('message', (evento) => {
  const dados = evento.data;

  // Ignora mensagens sem o tipo esperado
  if (!dados || dados.tipo !== 'MOSTRAR_NOTIFICACAO') return;

  console.log('[SW] Mensagem recebida:', dados);

  // Monta as opções da notificação
  const opcoes = {
    body:  dados.corpo,           // texto do corpo
    icon:  dados.icone,           // ícone do PWA
    badge: dados.icone,           // ícone pequeno (Android)
    tag:   'venda-local',         // agrupa notificações do mesmo tipo
    renotify: true,               // vibra mesmo se já existir uma com mesmo tag
    requireInteraction: false,    // iOS ignora, mas bom definir

    // ╔══════════════════════════════════════════════════╗
    // ║  INTEGRAÇÃO FUTURA — DADOS PARA notificationclick║
    // ║  Passe dados adicionais no campo `data`:        ║
    // ║  data: { url: '/', pedidoId: dados.pedidoId }  ║
    // ╚══════════════════════════════════════════════════╝
    data: { url: '/' },
  };

  // Mostra a notificação via Service Worker
  evento.waitUntil(
    self.registration.showNotification(dados.titulo, opcoes)
  );
});

// ──────────────────────────────────────────────────────────
// 4. EVENTO: push
//    Disparado quando o servidor envia um push real via VAPID.
//    Está preparado para receber um JSON com título e corpo.
//
//    ╔══════════════════════════════════════════════════════╗
//    ║  INTEGRAÇÃO FUTURA — BACKEND VAPID / web-push       ║
//    ║                                                      ║
//    ║  No backend (Node.js com lib 'web-push'), você      ║
//    ║  enviaria algo como:                                 ║
//    ║                                                      ║
//    ║  webpush.sendNotification(subscription, JSON.stringify({
//    ║    titulo: 'Você recebeu uma venda! 🎉',            ║
//    ║    corpo:  'Produto: X — Valor: R$ 1.250,00',       ║
//    ║    icone:  '/icon-192.png',                         ║
//    ║  }));                                               ║
//    ║                                                      ║
//    ║  E o SW aqui leria esse payload com evento.data.json()║
//    ╚══════════════════════════════════════════════════════╝
// ──────────────────────────────────────────────────────────
self.addEventListener('push', (evento) => {
  console.log('[SW] Evento push recebido do servidor.');

  // Valores padrão caso o payload venha vazio ou mal-formado
  let titulo = 'Você recebeu uma venda! 🎉';
  let opcoes = {
    body:  'Nova venda registrada.',
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   'venda-push',
    data:  { url: '/' },
  };

  // Tenta ler o payload JSON enviado pelo servidor
  if (evento.data) {
    try {
      const payload = evento.data.json();

      // O backend pode enviar qualquer estrutura JSON.
      // Adaptamos para o formato esperado:
      titulo         = payload.titulo ?? titulo;
      opcoes.body    = payload.corpo  ?? opcoes.body;
      opcoes.icon    = payload.icone  ?? opcoes.icon;
      opcoes.data    = { url: payload.url ?? '/' };

    } catch (erro) {
      // Se o payload não for JSON válido, usa o texto puro
      opcoes.body = evento.data.text();
      console.warn('[SW] Payload push não é JSON válido:', erro.message);
    }
  }

  evento.waitUntil(
    self.registration.showNotification(titulo, opcoes)
  );
});

// ──────────────────────────────────────────────────────────
// 5. EVENTO: notificationclick
//    Disparado quando o usuário toca/clica em uma notificação.
//    Aqui focamos a aba já aberta do app, ou abrimos uma nova.
// ──────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (evento) => {
  console.log('[SW] Notificação clicada.');

  // Fecha o balão da notificação
  evento.notification.close();

  // URL para abrir/focar (vem do campo `data` definido acima)
  const urlAlvo = (evento.notification.data && evento.notification.data.url)
    ? evento.notification.data.url
    : '/';

  evento.waitUntil(
    // Procura por uma aba já aberta que pertença a este PWA
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((listaDeAbas) => {
        // Se já existe uma aba aberta, foca nela
        for (const aba of listaDeAbas) {
          if (aba.url.includes(self.location.origin) && 'focus' in aba) {
            return aba.focus();
          }
        }

        // Se não há aba aberta, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlAlvo);
        }
      })
  );
});
