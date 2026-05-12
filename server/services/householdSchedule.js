export const HOUSEHOLD_APP_START_DATE = new Date(2026, 4, 1, 12, 0, 0, 0);

export const HOUSEHOLD_CHORES = [
  {
    id: 'cats',
    title: 'Уборка за котами',
    frequencyDays: 1,
    startOffsetDays: 0,
    detail: 'Ежедневно, чтобы лотки и зона вокруг оставались чистыми.',
    tag: 'ежедневно',
  },
  {
    id: 'surfaces',
    title: 'Уборка поверхностей',
    frequencyDays: 2,
    startOffsetDays: 0,
    detail: 'Быстрое протирание кухни, столов и заметных поверхностей.',
    tag: 'раз в 2 дня',
  },
  {
    id: 'laundry',
    title: 'Стирка вещей',
    frequencyDays: 3,
    startOffsetDays: 1,
    detail: 'Запуск стирки и разбор сухих вещей.',
    tag: 'раз в 3 дня',
  },
  {
    id: 'organizing',
    title: 'Организация вещей',
    frequencyDays: 7,
    startOffsetDays: 2,
    detail: 'Разобрать мелкие накопления и вернуть вещи на места.',
    tag: 'раз в неделю',
  },
  {
    id: 'bedding',
    title: 'Замена постельного белья',
    frequencyDays: 14,
    startOffsetDays: 3,
    detail: 'Полная смена постельного белья и проветривание комнаты.',
    tag: 'раз в 2 недели',
  },
  {
    id: 'cooking',
    title: 'Готовка',
    frequencyDays: 1,
    startOffsetDays: 0,
    detail: 'Основной приём пищи или заготовка на день.',
    tag: 'ежедневно',
  },
  {
    id: 'dishes',
    title: 'Мытье посуды',
    frequencyDays: 1,
    startOffsetDays: 0,
    detail: 'Посуду и рабочую поверхность приводим в порядок в тот же день.',
    tag: 'ежедневно',
  },
  {
    id: 'bathroom',
    title: 'Уборка санузла',
    frequencyDays: 7,
    startOffsetDays: 4,
    detail: 'Санузел, раковина, зеркала и свежесть по всей зоне.',
    tag: 'раз в неделю',
  },
  {
    id: 'vacuum',
    title: 'Пылесос',
    frequencyDays: 7,
    startOffsetDays: 5,
    detail: 'Проход по квартире, особенно по местам, где собирается шерсть.',
    tag: 'раз в неделю',
  },
  {
    id: 'floors',
    title: 'Мытье полов',
    frequencyDays: 7,
    startOffsetDays: 6,
    detail: 'Финальный влажный проход после пылесоса.',
    tag: 'раз в неделю',
  },
];

export function createDate(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfMonth(year, monthIndex) {
  return createDate(year, monthIndex, 1);
}

export function endOfMonth(year, monthIndex) {
  return createDate(year, monthIndex + 1, 0);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return createDate(next.getFullYear(), next.getMonth(), next.getDate());
}

function normalizeDate(date) {
  return createDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(from, to) {
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.round((normalizeDate(to).getTime() - normalizeDate(from).getTime()) / dayMs);
}

function isChoreDue(chore, date) {
  const sinceStart = diffInDays(HOUSEHOLD_APP_START_DATE, date);
  const aligned = sinceStart - chore.startOffsetDays;
  return aligned >= 0 && aligned % chore.frequencyDays === 0;
}

export function buildTaskBlueprintsForMonth(year, monthIndex, members) {
  const activeMembers = members.filter((member) => member.active !== false);
  const safeMembers = activeMembers.length > 0 ? activeMembers : members;
  const monthStart = startOfMonth(year, monthIndex);
  const monthEnd = endOfMonth(year, monthIndex);
  const tasks = [];
  let cursor = monthStart;
  let assignmentCursor = 0;

  while (cursor <= monthEnd) {
    for (const chore of HOUSEHOLD_CHORES) {
      if (!isChoreDue(chore, cursor)) continue;
      const assignedMember = safeMembers[assignmentCursor % safeMembers.length];
      if (!assignedMember) continue;

      tasks.push({
        date: cursor,
        dateKey: formatDateKey(cursor),
        year,
        month: monthIndex,
        choreId: chore.id,
        title: chore.title,
        detail: chore.detail,
        tag: chore.tag,
        assignedMemberId: assignedMember._id,
      });
      assignmentCursor += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return tasks;
}
