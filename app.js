// ============================================================
// app.js — Lógica do PWA frontend de Teste de Push
//
// ⚠️ ATENÇÃO: Cole sua chave pública VAPID no campo abaixo!
// Ela é gerada usando o comando: npx web-push generate-vapid-keys
// ============================================================

const VAPID_PUBLIC_KEY = "BP2lyZ4hhFMOjKswzj_PyfHeA-B1iU9BFbO8T7TaJDoaGKryWGsS17DbCceW4EFO9PbLVHKsSQ_B7e8e3OFuM6M"; 

// ──────────────────────────────────────────────────────────
// 1. REFERÊNCIAS DOS ELEMENTOS DA TELA
// ──────────────────────────────────────────────────────────
const permissionBadge  = document.getElementById('permission-badge');
const btnActivate      = document.getElementById('btn-activate');
const btnDisparar      = document.getElementById('btn-disparar');
const inputValor       = document.getElementById('input-valor');
const selectTitulo     = document.getElementById('select-titulo');
const logArea          = document.getElementById('log-area');
const logEmpty         = document.getElementById('log-empty');

// Referência global ao Service Worker
let swRegistration = null;

// ──────────────────────────────────────────────────────────
// 2. SISTEMA DE LOG EM TELA (Debug amigável)
//    type: 'info' | 'ok' | 'warn' | 'err'
// ──────────────────────────────────────────────────────────
function log(mensagem, type = 'info') {
  if (logEmpty) logEmpty.remove();

  const agora = new Date();
  const ts = agora.toLocaleTimeString('pt-BR', { hour12: false });

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="ts">[${ts}]</span>${escaparHTML(mensagem)}`;

  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight; // auto-scroll
}

function escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────────────────
// 3. REGISTRO AUTOMÁTICO DO SERVICE WORKER (Ao carregar)
// ──────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  if (!('serviceWorker' in navigator)) {
    log('Service Workers não são suportados neste navegador.', 'err');
    return;
  }

  try {
    // Registra o sw.js
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    log('Service Worker registrado ✓', 'ok');

    // Aguarda o Service Worker estar pronto e ativo
    await navigator.serviceWorker.ready;
    log('Service Worker pronto para gerenciar push.', 'ok');

  } catch (erro) {
    log(`Erro no Service Worker: ${erro.message}`, 'err');
  }

  // Verifica e exibe o estado de permissão inicial
  atualizarStatusPermissao();
});

// ──────────────────────────────────────────────────────────
// 4. ATUALIZAR INTERFACE COM O STATUS DA PERMISSÃO
// ──────────────────────────────────────────────────────────
function atualizarStatusPermissao() {
  if (!('Notification' in window)) {
    permissionBadge.textContent = 'não suportado';
    return;
  }

  const status = Notification.permission;

  const statusMap = {
    'default':  { texto: 'pendente',  classe: 'pending' },
    'granted':  { texto: 'concedida', classe: 'granted' },
    'denied':   { texto: 'negada',    classe: 'denied'  },
  };

  const info = statusMap[status] || { texto: status, classe: '' };
  permissionBadge.textContent = info.texto;
  permissionBadge.className   = info.classe;

  // Habilita o botão de enviar se a permissão já foi concedida
  btnDisparar.disabled = (status !== 'granted');
}

// ──────────────────────────────────────────────────────────
// 5. ATIVAR NOTIFICAÇÕES (Solicitar permissão e assinar Push)
// ──────────────────────────────────────────────────────────
async function activateNotifications() {
  btnActivate.disabled = true;

  // Verifica se a chave VAPID foi configurada
  if (VAPID_PUBLIC_KEY === "COLE_AQUI" || VAPID_PUBLIC_KEY.trim() === "") {
    log('ERRO: Você precisa colar sua chave pública VAPID na constante VAPID_PUBLIC_KEY no topo de app.js!', 'err');
    btnActivate.disabled = false;
    return;
  }

  if (!('Notification' in window)) {
    log('A API de Notificações não é suportada por este dispositivo.', 'err');
    btnActivate.disabled = false;
    return;
  }

  if (!swRegistration) {
    log('Service Worker não carregado ainda. Tente de novo em segundos.', 'warn');
    btnActivate.disabled = false;
    return;
  }

  log('Solicitando permissão ao usuário...');

  try {
    // Pede permissão de exibição
    const permissao = await Notification.requestPermission();
    atualizarStatusPermissao();

    if (permissao !== 'granted') {
      log(`Permissão não concedida. Status: ${permissao}`, 'warn');
      btnActivate.disabled = false;
      return;
    }

    log('Permissão concedida pelo usuário! ✓', 'ok');

    // Assina o serviço de push no navegador
    log('Gerando credencial (PushSubscription)...');
    
    // Converte a chave pública de string Base64 para Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    // Registra a assinatura com a chave pública do nosso servidor
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true, // Obrigatório por motivos de segurança e privacidade do usuário
      applicationServerKey: applicationServerKey
    });

    log('Subscription gerada no navegador ✓', 'ok');

    // Envia o objeto da assinatura para o nosso backend Node
    log('Enviando subscription para o backend...');
    
    const resposta = await fetch('/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscription)
    });

    if (!resposta.ok) {
      throw new Error(`Erro HTTP no servidor: ${resposta.status}`);
    }

    log('Subscription salva no backend com sucesso! 🎉', 'ok');

  } catch (erro) {
    log(`Falha ao registrar push: ${erro.message}`, 'err');
    console.error(erro);
  }

  btnActivate.disabled = false;
}

// ──────────────────────────────────────────────────────────
// 6. DISPARAR NOTIFICAÇÃO (Aciona o backend)
// ──────────────────────────────────────────────────────────
async function dispararNotificacao() {
  // Corrige o bug do iPhone: aceita vírgula e ponto como separadores decimais
  const valorTexto = inputValor.value.replace(/\s/g, '').replace(',', '.');
  const valorRaw   = parseFloat(valorTexto);
  const titulo   = selectTitulo.value;

  if (isNaN(valorRaw) || valorRaw < 0) {
    log('Por favor, informe um valor válido.', 'warn');
    inputValor.focus();
    return;
  }

  // Formata o valor no padrão BRL (ex: 175,81)
  const valorFormatado = valorRaw.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const corpoFormatado = `Valor: R$ ${valorFormatado}`;

  btnDisparar.disabled = true;
  log(`Enviando solicitação de disparo para o servidor...`, 'info');

  try {
    // Faz a chamada POST /enviar enviando o título selecionado e o valor formatado
    const resposta = await fetch('/enviar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: titulo,
        body: corpoFormatado
      })
    });

    if (!resposta.ok) {
      throw new Error(`Erro ao enviar comando: Código ${resposta.status}`);
    }

    const resultado = await resposta.json();
    log(`Servidor respondeu: Notificações enviadas para ${resultado.enviados} dispositivo(s).`, 'ok');

  } catch (erro) {
    log(`Erro no disparo: ${erro.message}`, 'err');
  }

  btnDisparar.disabled = false;
}

// ──────────────────────────────────────────────────────────
// 7. HELPER: CONVERTE A CHAVE VAPID DE BASE64 PARA UINT8ARRAY
//
// 🤔 POR QUE ISSO É NECESSÁRIO?
// A API de Push do navegador (`pushManager.subscribe`) espera a chave
// pública do servidor em formato binário (Buffer/Array de bytes).
// Como representamos a chave VAPID como uma string Base64Url amigável
// no código, esta função decodifica e formata a string para o
// formato nativo necessário.
// ──────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
