// services/bookingNotifier.js
// Отправка уведомлений о бронированиях в Telegram + лёгкое логирование

const TZ = 'Europe/Belgrade';
const LOG = String(process.env.LOG_BOOKINGS || '') === '1';
const PREFIX = '[bookingNotifier]';

// ───────── helpers: лог/редакция/форматирование ─────────
function redactPhone(p) {
  if (!p) return p;
  const s = String(p).replace(/\s+/g, '');
  if (s.length <= 4) return '***';
  return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}
function safeUser(u = '') {
  const s = String(u).trim();
  if (!s) return s;
  return s.startsWith('@') ? s : `@${s}`;
}
function escHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatDate(d) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  } catch {
    return String(d);
  }
}
function msSince(t0) { return `${Date.now() - t0}ms`; }

// ───────── Google Maps ссылки ─────────
/**
 * Строит URL Google Maps. Приоритет: placeId → (lat,lng) → address
 */
function buildGmapsUrl({ address, lat, lng, placeId } = {}) {
  const base = 'https://www.google.com/maps/search/?api=1';
  if (placeId && String(placeId).trim()) {
    // query обязателен; дадим хоть какой-то query (адрес или coords), плюс query_place_id
    const q =
      (lat != null && lng != null)
        ? `${lat},${lng}`
        : (address ? String(address) : 'point');
    return `${base}&query=${encodeURIComponent(q)}&query_place_id=${encodeURIComponent(String(placeId))}`;
  }
  if (lat != null && lng != null) {
    return `${base}&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  if (address && String(address).trim()) {
    return `${base}&query=${encodeURIComponent(String(address))}`;
  }
  return ''; // нет данных
}

/**
 * Возвращает HTML-ссылку на карту или "—"
 * label — что показывать пользователю (город/адрес), source — объект полей для URL
 */
function locationLinkHTML(label, source) {
  const url = buildGmapsUrl(source);
  const safeLabel = escHtml(label || '—');
  if (!url) return safeLabel || '—';
  // В label спецсимволы экранируем, а href даём «сырым» URL (но он уже закодирован)
  return `<a href="${url}">${safeLabel}</a>`;
}

/**
 * Собирает «лучшие» данные для локации из объекта брони (from/to).
 * prefix: 'from' | 'to'
 * Возвращает { label, urlParts }
 */
function pickLocation(b, prefix) {
  const city = b[`${prefix}City`];
  const address = b[`${prefix}Address`] || b[`${prefix}Addr`] || city;
  const lat = (b[`${prefix}Lat`] != null) ? Number(b[`${prefix}Lat`]) : undefined;
  const lng = (b[`${prefix}Lng`] != null) ? Number(b[`${prefix}Lng`]) : undefined;
  const placeId = b[`${prefix}PlaceId`] || b[`${prefix}PlaceID`];

  // Подписываем ссылку кратко: адрес > город > «—»
  const label = address || city || '—';
  return {
    label,
    urlParts: { address, lat, lng, placeId },
  };
}

// ───────── словари ─────────
const SERVICE_LABELS = {
  'transfers':  '🚖 Трансфер',
  'visa-runs':  '🛂 Виза-ран',
  'relocation': '🚚 Релокация',
  'concerts':   '🎵 Концерты',
};
const MESSENGER_LABELS = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  viber:    'Viber',
  phone:    'Телефон',
  email:    'Email',
};
const STATUS_LABELS = {
  new:            '🆕 Новая',
  in_progress:    '🚧 В работе',
  done:           '✅ Завершена',
  canceledByUser: '🙅 Отменена пользователем',
  canceledByAdmin:'⛔ Отменена админом',
};

function formatBelgradeDate(d, opts = {}) {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      ...opts,
    }).format(new Date(d));
  } catch {
    return String(d);
  }
}

// ───────── форматирование сообщений ─────────
function formatBookingHTML(b) {
  const service = SERVICE_LABELS[b.service] || b.service || '—';
  const messenger = MESSENGER_LABELS[b.messenger] || b.messenger || '—';

  const usernameRaw = (b.telegramUsername || '').trim().replace(/^@/, '');
  const tgUserLink = usernameRaw
    ? `<a href="https://t.me/${escHtml(usernameRaw)}">@${escHtml(usernameRaw)}</a>`
    : '—';

  const tgId = b.telegramId ? String(b.telegramId) : '—';

  const name  = b.name ? escHtml(b.name) : '—';
  const phone = b.phone ? escHtml(b.phone) : '—';

  // Локации с кликабельными ссылками
  const from = pickLocation(b, 'from');
  const to   = pickLocation(b, 'to');

  const fromHTML = locationLinkHTML(from.label, from.urlParts);
  const toHTML   = locationLinkHTML(to.label,   to.urlParts);

  const dateTime = formatDate(b.dateTime);

  const passengers = Number.isFinite(+b.passengers) ? +b.passengers : '—';
  const bags       = Number.isFinite(+b.bags) ? +b.bags : '—';
  const vehicle    = b.vehicle ? escHtml(b.vehicle) : '—';

  const opts = b.options || {};
  const optLines = [
    `Детское кресло: <b>${opts.needChildSeat ? 'Да' : 'Нет'}</b>`,
    `Бустер: <b>${opts.needBooster ? 'Да' : 'Нет'}</b>`,
    `Питомец: <b>${opts.hasPet ? 'Да' : 'Нет'}</b>`,
  ].join('\n');

  const comment = b.comment ? escHtml(b.comment) : '—';
  const idLine = b._id ? `\n\nID: <code>${escHtml(String(b._id))}</code>` : '';

  return [
    `<b>🆕 Новая заявка</b>`,
    ``,
    `<b>Сервис:</b> ${escHtml(service)}`,
    `<b>Канал связи:</b> ${escHtml(messenger)}`,
    ``,
    `<b>Откуда:</b> ${fromHTML}`,
    `<b>Куда:</b> ${toHTML}`,
    `<b>Дата/время:</b> ${dateTime}`,
    ``,
    `<b>Контакт:</b> ${name}`,
    `<b>Телефон:</b> ${phone}`,
    `<b>Telegram:</b> ${tgUserLink}`,

    ``,
    `<b>Пассажиров:</b> ${passengers}`,
    `<b>Багаж (мест):</b> ${bags}`,
    `<b>Транспорт:</b> ${vehicle}`,
    ``,
    `<b>Опции:</b>\n${optLines}`,
    ``,
    `<b>Комментарий:</b>\n${comment}`,
  ].join('\n');
}

function formatStatusHTML(b, prevStatus, by = 'admin') {
  const from = STATUS_LABELS[prevStatus] || prevStatus || '—';
  const toStatus   = STATUS_LABELS[b.status] || b.status || '—';
  const service = SERVICE_LABELS[b.service] || b.service || '—';

  // Маршрут со ссылками
  const fromLoc = pickLocation(b, 'from');
  const toLoc   = pickLocation(b, 'to');
  const routeHTML = `${locationLinkHTML(fromLoc.label, fromLoc.urlParts)} → ${locationLinkHTML(toLoc.label, toLoc.urlParts)}`;

  const idLine = b._id ? `ID: <code>${escHtml(String(b._id))}</code>` : '';

  return [
    `<b>🔔 Статус заявки изменён</b>`,
    ``,
    `<b>Сервис:</b> ${escHtml(service)}`,
    `<b>Маршрут:</b> ${routeHTML}`,
    ``,
    `<b>Статус:</b> ${escHtml(from)} → <b>${escHtml(toStatus)}</b>`,
    `<b>Кем:</b> ${by === 'user' ? 'пользователь' : 'админ'}`,
    ``,
    idLine,
  ].join('\n');
}

function formatGiveawayDailyReportHTML({ total = 0, joinedLast24h = 0, since, generatedAt }) {
  return [
    `<b>🎁 Ежедневный отчёт по розыгрышу</b>`,
    ``,
    `<b>Всего участников:</b> ${Number(total) || 0}`,
    `<b>Присоединилось за последние 24 часа:</b> ${Number(joinedLast24h) || 0}`,
    ``,
    `<b>Период:</b> ${formatBelgradeDate(since)} — ${formatBelgradeDate(generatedAt)}`,
  ].join('\n');
}

// ───────── низкоуровневый вызов TG API с логами ─────────
async function tgCall(method, payload) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error(`${PREFIX} BOT_TOKEN is not set`);

  const t0 = Date.now();
  const url = `https://api.telegram.org/bot${token}/${method}`;

  if (LOG) {
    const preview = {
      chat_id: payload?.chat_id,
      text_len: payload?.text ? String(payload.text).length : 0,
      parse_mode: payload?.parse_mode,
      disable_web_page_preview: payload?.disable_web_page_preview,
    };
    console.log(`${PREFIX} → tgCall ${method}`, preview);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (LOG) {
    console.log(`${PREFIX} ← tgCall ${method} done in ${msSince(t0)} (http=${res.status})`);
  }

  if (!data.ok) {
    const err = new Error(data?.description || `HTTP ${res.status}`);
    err.response = { status: res.status, body: data };
    if (LOG) console.error(`${PREFIX} tgCall error:`, err.response);
    throw err;
  }

  if (LOG && data?.result?.message_id) {
    console.log(`${PREFIX} message_id=`, data.result.message_id);
  }
  return data.result;
}

// ───────── публичные функции уведомлений ─────────
export async function notifyBookingCreated(bookingDocOrPlain) {
  try {
    const chatId = process.env.BOOKING_NOTIFY_CHAT_ID;
    if (!chatId) {
      console.warn(`${PREFIX} BOOKING_NOTIFY_CHAT_ID is not set — уведомление пропущено`);
      return;
    }

    const b = typeof bookingDocOrPlain?.toObject === 'function'
      ? bookingDocOrPlain.toObject()
      : bookingDocOrPlain || {};

    if (LOG) {
      console.log(`${PREFIX} create:`, {
        id: b?._id,
        service: b?.service,
        route: [b?.fromCity, b?.toCity].filter(Boolean).join(' → ') || undefined,
        dateTime: b?.dateTime ? new Date(b.dateTime).toISOString() : undefined,
        passengers: b?.passengers,
        bags: b?.bags,
        vehicle: b?.vehicle,
        contact: {
          name: b?.name || undefined,
          phone: redactPhone(b?.phone),
          username: safeUser(b?.telegramUsername),
          telegramId: b?.telegramId || undefined,
        },
        // логируем, если есть координаты/place_id
        from: { lat: b?.fromLat, lng: b?.fromLng, placeId: b?.fromPlaceId, address: b?.fromAddress },
        to:   { lat: b?.toLat,   lng: b?.toLng,   placeId: b?.toPlaceId,   address: b?.toAddress },
      });
    }

    const text = formatBookingHTML(b);

    await tgCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error(`${PREFIX} failed to send booking notification:`, e?.message || e);
  }
}

export async function notifyBookingStatusChanged(bookingDocOrPlain, prevStatus, by = 'admin') {
  try {
    const chatId = process.env.BOOKING_NOTIFY_CHAT_ID;
    if (!chatId) {
      console.warn(`${PREFIX} BOOKING_NOTIFY_CHAT_ID is not set — уведомление о статусе пропущено`);
      return;
    }

    const b = typeof bookingDocOrPlain?.toObject === 'function'
      ? bookingDocOrPlain.toObject()
      : bookingDocOrPlain || {};

    if (LOG) {
      console.log(`${PREFIX} status:`, {
        id: b?._id,
        by,
        from: prevStatus,
        to: b?.status,
        service: b?.service,
        route: [b?.fromCity, b?.toCity].filter(Boolean).join(' → ') || undefined,
        fromLoc: { lat: b?.fromLat, lng: b?.fromLng, placeId: b?.fromPlaceId, address: b?.fromAddress },
        toLoc:   { lat: b?.toLat,   lng: b?.toLng,   placeId: b?.toPlaceId,   address: b?.toAddress },
      });
    }

    const text = formatStatusHTML(b, prevStatus, by);

    await tgCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error(`${PREFIX} failed to send status change notification:`, e?.message || e);
  }
}

export async function notifyGiveawayDailyReport({ total = 0, joinedLast24h = 0, since, generatedAt = new Date() }) {
  try {
    const chatId = process.env.BOOKING_NOTIFY_CHAT_ID;
    if (!chatId) {
      console.warn(`${PREFIX} BOOKING_NOTIFY_CHAT_ID is not set — ежедневный отчёт по розыгрышу пропущен`);
      return;
    }

    const text = formatGiveawayDailyReportHTML({
      total,
      joinedLast24h,
      since,
      generatedAt,
    });

    await tgCall('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error(`${PREFIX} failed to send giveaway daily report:`, e?.message || e);
  }
}
// ───────── форматирование заявок на концерты ─────────
function formatConcertBookingHTML(b, concert) {
    const safe = (v) => (v ? escHtml(String(v)) : '—');
    const usernameRaw = (b?.telegramUsername || '').trim().replace(/^@/, '');
    const tgUserLink = usernameRaw
      ? `<a href="https://t.me/${escHtml(usernameRaw)}">@${escHtml(usernameRaw)}</a>`
      : '—';
  
    const contactName  = b?.name ? escHtml(b.name) : '—';
    const contactPhone = b?.phone ? escHtml(b.phone) : '—';
    const messenger    = b?.messenger ? escHtml(b.messenger) : '—';
  
    const direction = b?.direction ? escHtml(b.direction) : '—';
    const seats     = Number.isFinite(+b?.seats) ? +b.seats : '—';
  
    // ссылки на точки (туда/обратно) — в ConcertBooking храним только адрес + placeId
    const toHTML = locationLinkHTML(
      b?.toAddress || '—',
      { address: b?.toAddress, placeId: b?.toPlaceId }
    );
    const backHTML = locationLinkHTML(
      b?.backToAddress || '—',
      { address: b?.backToAddress, placeId: b?.backToPlaceId }
    );
  
    const pricePerSeat = Number.isFinite(+b?.priceEurPerSeat) ? +b.priceEurPerSeat : undefined;
    const currency     = b?.currency || 'EUR';
    const totalPrice   = (pricePerSeat && Number.isFinite(+seats))
      ? `${(pricePerSeat * seats).toFixed(2)} ${currency}`
      : '—';
  
    const concertName = concert?.name ? escHtml(concert.name) : (b?.concertName ? escHtml(b.concertName) : '—');
    const concertLoc  = concert?.location ? escHtml(concert.location) : (b?.concertLocation ? escHtml(b.concertLocation) : '—');
    const concertWhen = concert?.startAt ? formatDate(concert.startAt) : (b?.concertStartAt ? formatDate(b.concertStartAt) : '—');
  
    const comment = b?.comment ? escHtml(b.comment) : '—';
    const idLine  = b?._id ? `\n\nID: <code>${escHtml(String(b._id))}</code>` : '';
  
    return [
      `<b>🆕 Новая заявка на концерт</b>`,
      ``,
      `<b>Концерт:</b> ${concertName}`,
      `<b>Город/Площадка:</b> ${concertLoc}`,
      `<b>Дата концерта:</b> ${concertWhen}`,
      ``,
      `<b>Направление:</b> ${direction}`,
      `<b>Мест:</b> ${seats}`,
      `<b>Туда:</b> ${toHTML}`,
      `<b>Обратно:</b> ${backHTML}`,
      ``,
      (pricePerSeat ? `<b>Цена/место:</b> ${pricePerSeat} ${currency}` : `<b>Цена/место:</b> —`),
      `<b>Итого:</b> ${totalPrice}`,
      ``,
      `<b>Контакт:</b> ${contactName}`,
      `<b>Телефон:</b> ${contactPhone}`,
      `<b>Мессенджер:</b> ${messenger}`,
      `<b>Telegram:</b> ${tgUserLink}`,
      ``,
      `<b>Комментарий:</b>\n${comment}`,
      idLine,
    ].join('\n');
  }
  
  /** Уведомление о создании заявки на концерт */
  export async function notifyConcertBookingCreated(bookingDocOrPlain, concertDocOrPlain) {
    try {
      const chatId = process.env.BOOKING_NOTIFY_CHAT_ID;
      if (!chatId) {
        console.warn(`${PREFIX} BOOKING_NOTIFY_CHAT_ID is not set — уведомление (концерт) пропущено`);
        return;
      }
  
      const b = typeof bookingDocOrPlain?.toObject === 'function'
        ? bookingDocOrPlain.toObject()
        : bookingDocOrPlain || {};
  
      const concert = typeof concertDocOrPlain?.toObject === 'function'
        ? concertDocOrPlain.toObject()
        : concertDocOrPlain || {};
  
      if (LOG) {
        console.log(`${PREFIX} [concert] create:`, {
          id: b?._id,
          direction: b?.direction,
          seats: b?.seats,
          to: { address: b?.toAddress, placeId: b?.toPlaceId },
          back: { address: b?.backToAddress, placeId: b?.backToPlaceId },
          priceEurPerSeat: b?.priceEurPerSeat,
          currency: b?.currency,
          concert: {
            id: concert?._id,
            name: concert?.name,
            location: concert?.location,
            startAt: concert?.startAt,
            seatsLeft: concert?.seatsLeft,
          },
          contact: {
            name: b?.name || undefined,
            phone: redactPhone(b?.phone),
            username: safeUser(b?.telegramUsername),
            telegramId: b?.telegramId || undefined,
          },
        });
      }
  
      const text = formatConcertBookingHTML(b, concert);
  
      await tgCall('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (e) {
      console.error(`${PREFIX} failed to send concert booking notification:`, e?.message || e);
    }
  }
  
