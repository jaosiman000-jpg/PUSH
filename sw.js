// ============================================================
// sw.js — Service Worker do PWA de Teste de Push
//
// O Service Worker roda em segundo plano e lida com eventos do sistema
// mesmo com o app fechado ou aba minimizada.
// ============================================================

// 1. EVENTO: install — Disparado na instalação do Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  // Força o Service Worker recém-instalado a se tornar ativo imediatamente
  self.skipWaiting();
});

// 2. EVENTO: activate — Disparado na ativação do Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativado.');
  // Garante que o Service Worker controle imediatamente a aba ativa do PWA
  event.waitUntil(self.clients.claim());
});

// 3. EVENTO: push — Disparado ao receber notificações Push reais do servidor
// O navegador do usuário (Safari no iOS) acorda o Service Worker para
// processar a notificação que veio da rede APNs / FCM.
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Evento Push recebido do servidor.');

  // Configurações padrão caso o payload não venha ou falhe
  let title = 'Você recebeu uma venda! 🎉';
  let options = {
    body: 'Produto vendido.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'venda-real', // Tag para agrupar notificações semelhantes
    data: { url: '/' } // URL padrão a ser aberta no clique
  };

  // Se houver dados no evento push do servidor, nós os lemos
  if (event.data) {
    try {
      // Lê o payload JSON enviado pelo servidor do backend
      const payload = event.data.json();
      console.log('[Service Worker] Payload descriptografado com sucesso:', payload);

      // Atualiza o título e as opções com os dados do servidor
      title = payload.title || title;
      options.body = payload.body || options.body;
      options.icon = payload.icon || options.icon;
      options.badge = payload.icon || options.badge;
      
      // Armazena a URL enviada pelo servidor para abrirmos no clique
      if (payload.url) {
        options.data.url = payload.url;
      }
    } catch (err) {
      console.error('[Service Worker] Erro ao analisar payload JSON do push:', err);
      // Se não for JSON válido (ex: texto puro), usa o conteúdo bruto como corpo
      options.body = event.data.text();
    }
  }

  // Exibe a notificação no sistema operacional do dispositivo (iOS / macOS / Android / etc.)
  // O event.waitUntil() garante que o Service Worker não seja encerrado
  // antes que a notificação termine de ser exibida pelo sistema.
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 4. EVENTO: notificationclick — Disparado quando o usuário clica na notificação
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificação clicada.');

  // Fecha o balão visual da notificação
  event.notification.close();

  // Determina qual URL abrir (vem das informações em `data` no push)
  const urlToOpen = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  // Gerenciamento de janelas: tenta focar se o app já estiver aberto ou abre nova aba
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Verifica se há alguma aba já aberta no mesmo domínio
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // Foca na aba existente
            return client.focus();
          }
        }
        // Se não houver abas abertas, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

// 5. EVENTO: message — Permite enviar notificações locais para testes
// Útil caso o desenvolvedor ainda queira disparar eventos diretamente do frontend
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.tipo === 'MOSTRAR_NOTIFICACAO') {
    console.log('[Service Worker] Recebeu comando local via postMessage.');
    const options = {
      body: data.corpo,
      icon: data.icone,
      badge: data.icone,
      tag: 'venda-local',
      data: { url: '/' }
    };
    event.waitUntil(
      self.registration.showNotification(data.titulo, options)
    );
  }
});
