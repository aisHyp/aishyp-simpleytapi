const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  '9272572003:AAHZ__2-vm4OQnf0CJPgQ2uFbJgd7mOlHDI';

const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6918729990';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function lookupGeo(ip) {
  const clean = String(ip || '').replace(/[^0-9a-fA-F.:]/g, '');
  if (
    !clean ||
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean.startsWith('192.168.') ||
    clean.startsWith('10.')
  ) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(
        clean
      )}?fields=status,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status === 'success' ? data : null;
  } catch {
    return null;
  }
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

  (async () => {
    try {
      const geo = await lookupGeo(ip);
      const hasCoords = typeof geo?.lat === 'number' && typeof geo?.lon === 'number';
      const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${geo.lat},${geo.lon}` : null;

      const locFullLines = geo
        ? [
            `📍 <b>LOC full:</b>`,
            `• Negara: ${escapeHtml(geo.country || '-')} (${escapeHtml(geo.countryCode || '-')})`,
            `• Provinsi: ${escapeHtml(geo.regionName || '-')}`,
            `• Kota: ${escapeHtml(geo.city || city || '-')}${geo.district ? ` · Kec: ${escapeHtml(geo.district)}` : ''}`,
            `• Kode Pos: ${escapeHtml(geo.zip || '-')}`,
            `• Koordinat: <code>${hasCoords ? `${geo.lat}, ${geo.lon}` : '-'}</code>`,
            `• Timezone: ${escapeHtml(geo.timezone || '-')}`,
            `• ISP / Org: ${escapeHtml(geo.isp || '-')} / ${escapeHtml(geo.org || '-')}`,
            `• AS: <code>${escapeHtml(geo.as || '-')}</code>`,
            `• Tipe: ${geo.mobile ? 'Mobile' : 'Fixed'}${geo.proxy ? ' · Proxy/VPN' : ''}${geo.hosting ? ' · Datacenter' : ''}`,
          ]
        : [
            `📍 <b>LOC full:</b>`,
            `• Kota/Negara (Header): ${escapeHtml(city || '-')}, ${escapeHtml(country || '-')}`,
          ];

      const text = [
        `🌐 <b>SIMPLE YTAPI LOGS</b>`,
        ``,
        `📌 <b>Endpoint:</b> <code>${escapeHtml(req.method)} ${escapeHtml(req.originalUrl || req.url)}</code>`,
        `🖥️ <b>IP:</b> <code>${escapeHtml(ip)}</code>`,
        `🔗 <b>Origin:</b> <code>${escapeHtml(origin)}</code>`,
        `🏠 <b>Host:</b> <code>${escapeHtml(host)}</code>`,
        `↩️ <b>Referer:</b> <code>${escapeHtml(referer)}</code>`,
        `🗣️ <b>Lang:</b> <code>${escapeHtml(lang)}</code>`,
        `📱 <b>UA:</b> <code>${escapeHtml(ua)}</code>`,
        ``,
        ...locFullLines,
      ].join('\n');

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: DEFAULT_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(mapsUrl
            ? { reply_markup: { inline_keyboard: [[{ text: '🗺️ Buka di Google Maps', url: mapsUrl }]] } }
            : {}),
        }),
        signal: AbortSignal.timeout(3500),
      });
    } catch {
      // ignore logging errors
    }
  })();

  next();
}
