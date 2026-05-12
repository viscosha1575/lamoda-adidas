// utils/validate.js
const canon = (s = '') => String(s).trim().toLowerCase().replace(/[\s_]+/g, '-');

export function validateCreate(body = {}) {
  const errors = [];

  const messenger = canon(body.messenger);   // "Telegram" → "telegram"
  const service   = canon(body.service);     // "visa_runs" / "visa run" / "visa_run" → "visa-runs"

  if (!body?.name?.trim()) errors.push('name is required');
  if (!['whatsapp', 'telegram'].includes(messenger)) errors.push('messenger invalid');

  // проверяем только канон
  const allowedServices = ['visa-runs', 'transfers', 'relocation', 'concerts'];
  if (!allowedServices.includes(service)) errors.push('service invalid');

  // контакты
  if (messenger === 'whatsapp') {
    const phone = (body.phone || '').trim();
    if (!phone) errors.push('phone is required for whatsapp');
  } else if (messenger === 'telegram') {
    const user = (body.telegramUsername || '').replace(/^@/, '').trim();
    if (!user) errors.push('telegramUsername is required for telegram');
  }

  // маршрутные услуги
  const isRoute = ['visa-runs', 'transfers'].includes(service);
  if (isRoute) {
    if (!body?.fromCity?.trim()) errors.push('fromCity is required for route service');
    if (!body?.toCity?.trim()) errors.push('toCity is required for route service');
  }

  if (service === 'concerts') {
    if (!body?.dateTime) errors.push('dateTime is required for concerts');
  }

  return errors;
}
