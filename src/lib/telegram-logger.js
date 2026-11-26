const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  '9077857279:AAEUiNJMxj3LXrvbyRPKkWLpMJtHt-n9Qck';

let cachedChatId = process.env.TELEGRAM_CHAT_ID || null;

async function resolveChatId() {
  if (cachedChatId) return cachedChatId;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=5`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const updates = Array.isArray(data?.result) ? data.result : [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const u = updates[i];
      const msg = u.message || u.edited_message || u.callback_query?.message;
      if (msg?.chat?.id) {
        cachedChatId = String(msg.chat.id);
        return cachedChatId;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function telegramVisitLogger(req, res, next) {
  if (req.path === '/favicon.ico') return next();

  const ip =
    req.get('cf-connecting-ip') ||
    (req.get('x-forwarded-for') ? req.get('x-forwarded-for').split(',')[0].trim() : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown';

  const origin = req.get('origin') || req.get('sec-fetch-site') || '-';
  const host = req.get('host') || '-';
  const referer = req.get('referer') || '-';
  const ua = (req.get('user-agent') || '-').slice(0, 180);
  const lang = req.get('accept-language') || '-';
  const city = req.get('x-vercel-ip-city') || '';
  const country = req.get('x-vercel-ip-country') || '';
  const locHint = city || country ? `${city || '-'}, ${country || '-'}` : 'Cek via tombol';

  // Fire-and-forget so API latency is unaffected
  (async () => {
    try {
      const chatId = await resolveChatId();
      if (!chatId) return;

      const text = [
        `🌐 <b>SIMPLE YTAPI LOGS</b>`,
        ``,
        `📍 <b>Endpoint:</b> <code>${escapeHtml(req.method)} ${escapeHtml(req.originalUrl || req.url)}</code>`,
        `🖥️ <b>IP:</b> <code>${escapeHtml(ip)}</code>`,
        `🗺️ <b>Lokasi:</b> ${escapeHtml(locHint)}`,
        `🔗 <b>Origin:</b> <code>${escapeHtml(origin)}</code>`,
        `🏠 <b>Host:</b> <code>${escapeHtml(host)}</code>`,
        `↩️ <b>Referer:</b> <code>${escapeHtml(referer)}</code>`,
        `🗣️ <b>Lang:</b> <code>${escapeHtml(lang)}</code>`,
        `📱 <b>UA:</b> <code>${escapeHtml(ua)}</code>`,
      ].join('\n');

      const cleanIp = String(ip).replace(/[^0-9a-fA-F.:]/g, '') || '8.8.8.8';
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📍 Cek Lokasi IP', url: `https://ipinfo.io/${encodeURIComponent(cleanIp)}` },
                { text: '🔎 IP-API Detail', url: `https://ip-api.com/#${encodeURIComponent(cleanIp)}` }
              ]
            ]
          }
        }),
        signal: AbortSignal.timeout(3500)
      });
    } catch {
      // ignore logging errors
    }
  })();

  next();
}
