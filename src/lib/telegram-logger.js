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
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(clean)}/json`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const d = await res.json();
      if (d && !d.bogon && (d.city || d.loc)) {
        const [latStr, lonStr] = String(d.loc || '').split(',');
        const lat = latStr ? Number(latStr) : undefined;
        const lon = lonStr ? Number(lonStr) : undefined;
        return {
          country: d.country,
          countryCode: d.country,
          regionName: d.region,
          city: d.city,
          zip: d.postal,
          lat: Number.isFinite(lat) ? lat : undefined,
          lon: Number.isFinite(lon) ? lon : undefined,
          timezone: d.timezone,
          isp: d.org,
          org: d.org,
          as: d.org,
        };
      }
    }
  } catch {
    // fallback below
  }

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const d = await res.json();
      if (d?.success) {
        return {
          country: d.country,
          countryCode: d.country_code,
          regionName: d.region,
          city: d.city,
          zip: d.postal,
          lat: typeof d.latitude === 'number' ? d.latitude : undefined,
          lon: typeof d.longitude === 'number' ? d.longitude : undefined,
          timezone: d.timezone?.id,
          isp: d.connection?.isp,
          org: d.connection?.org,
          as: d.connection?.asn ? `AS${d.connection.asn}` : undefined,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
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
