import GiveawayParticipant from '../models/giveawayParticipant.model.js';
import { notifyGiveawayDailyReport } from './bookingNotifier.js';

const TZ = 'Europe/Belgrade';
const PREFIX = '[giveawayReportScheduler]';
const TARGET_HOUR = 10;
const TARGET_MINUTE = 0;

function getBelgradeParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

function getNextRunAt(now = new Date()) {
  const nextMinuteBoundary = new Date(now.getTime() + 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  for (let i = 0; i < 60 * 48; i += 1) {
    const candidate = new Date(nextMinuteBoundary.getTime() + i * 60_000);
    const local = getBelgradeParts(candidate);
    if (local.hour === TARGET_HOUR && local.minute === TARGET_MINUTE) {
      return candidate;
    }
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

async function sendDailyGiveawayReport() {
  const generatedAt = new Date();
  const since = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);

  const [total, joinedLast24h] = await Promise.all([
    GiveawayParticipant.countDocuments({}),
    GiveawayParticipant.countDocuments({
      startedAt: { $gte: since, $lte: generatedAt },
    }),
  ]);

  await notifyGiveawayDailyReport({
    total,
    joinedLast24h,
    since,
    generatedAt,
  });
}

export function startGiveawayReportScheduler() {
  let timer = null;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;

    const now = new Date();
    const nextRunAt = getNextRunAt(now);
    const delay = Math.max(1_000, nextRunAt.getTime() - now.getTime());

    console.log(`${PREFIX} next run at ${nextRunAt.toISOString()} (${TZ} ${String(TARGET_HOUR).padStart(2, '0')}:${String(TARGET_MINUTE).padStart(2, '0')})`);

    timer = setTimeout(async () => {
      try {
        await sendDailyGiveawayReport();
        console.log(`${PREFIX} daily report sent`);
      } catch (e) {
        console.error(`${PREFIX} failed to send daily report:`, e?.message || e);
      } finally {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
