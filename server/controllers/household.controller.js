import HouseholdMember from '../models/householdMember.model.js';
import HouseholdTask from '../models/householdTask.model.js';
import User from '../models/user.model.js';
import {
  HOUSEHOLD_APP_START_DATE,
  buildTaskBlueprintsForMonth,
  endOfMonth,
  formatDateKey,
  startOfMonth,
} from '../services/householdSchedule.js';

function readTelegramId(req) {
  const fromActor = req.actor?.telegramId ? String(req.actor.telegramId).trim() : '';
  const fromHeader = req.headers['x-telegram-id'] ? String(req.headers['x-telegram-id']).trim() : '';
  const fromQuery = req.query?.telegramId ? String(req.query.telegramId).trim() : '';
  const fromBody = req.body?.telegramId ? String(req.body.telegramId).trim() : '';
  return fromActor || fromHeader || fromQuery || fromBody || null;
}

async function ensureUser(req, telegramId) {
  const firstName = req.body?.firstName ?? req.query?.firstName ?? undefined;
  const lastName = req.body?.lastName ?? req.query?.lastName ?? undefined;
  const username = req.body?.username ?? req.query?.username ?? undefined;

  return User.findOrCreateByTelegram({
    telegramId,
    firstName,
    lastName,
    username,
  });
}

async function ensureSeedMembers(ownerTelegramId, actorTelegramId) {
  const existing = await HouseholdMember.find({ ownerTelegramId }).sort({ sortOrder: 1, createdAt: 1 });
  if (existing.length > 0) return existing;

  const seeded = await HouseholdMember.insertMany([
    {
      ownerTelegramId,
      name: 'Человек 1',
      sortOrder: 0,
      createdByTelegramId: actorTelegramId,
      lastUpdatedByTelegramId: actorTelegramId,
    },
    {
      ownerTelegramId,
      name: 'Человек 2',
      sortOrder: 1,
      createdByTelegramId: actorTelegramId,
      lastUpdatedByTelegramId: actorTelegramId,
    },
  ]);

  return seeded;
}

async function ensureMonthTasks(ownerTelegramId, year, monthIndex, members) {
  const blueprints = buildTaskBlueprintsForMonth(year, monthIndex, members);
  if (blueprints.length === 0) return [];

  const ops = blueprints.map((task) => ({
    updateOne: {
      filter: { ownerTelegramId, dateKey: task.dateKey, choreId: task.choreId },
      update: {
        $setOnInsert: {
          ownerTelegramId,
          ...task,
        },
      },
      upsert: true,
    },
  }));

  await HouseholdTask.bulkWrite(ops, { ordered: false });
  return blueprints;
}

function serializeMember(doc) {
  return {
    _id: String(doc._id),
    name: doc.name,
    sortOrder: doc.sortOrder ?? 0,
    active: doc.active !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function serializeTask(doc) {
  const assigned = doc.assignedMemberId && typeof doc.assignedMemberId === 'object' ? doc.assignedMemberId : null;
  const completedBy =
    doc.completedByMemberId && typeof doc.completedByMemberId === 'object' ? doc.completedByMemberId : null;

  return {
    _id: String(doc._id),
    date: doc.date,
    dateKey: doc.dateKey,
    year: doc.year,
    month: doc.month,
    choreId: doc.choreId,
    title: doc.title,
    detail: doc.detail,
    tag: doc.tag,
    status: doc.status,
    completedAt: doc.completedAt,
    assignedMemberId: assigned ? String(assigned._id) : String(doc.assignedMemberId),
    assignedMemberName: assigned?.name || undefined,
    completedByMemberId: completedBy ? String(completedBy._id) : doc.completedByMemberId ? String(doc.completedByMemberId) : null,
    completedByMemberName: completedBy?.name || undefined,
    updatedAt: doc.updatedAt,
  };
}

function buildMonthStats(tasks, members) {
  const assignments = {};
  const completed = {};

  for (const member of members) {
    assignments[String(member._id)] = 0;
    completed[String(member._id)] = 0;
  }

  for (const task of tasks) {
    const assignedMemberId =
      task.assignedMemberId && typeof task.assignedMemberId === 'object'
        ? String(task.assignedMemberId._id)
        : String(task.assignedMemberId);

    assignments[assignedMemberId] = (assignments[assignedMemberId] ?? 0) + 1;

    if (task.status === 'done' && task.completedByMemberId) {
      const completedByMemberId =
        task.completedByMemberId && typeof task.completedByMemberId === 'object'
          ? String(task.completedByMemberId._id)
          : String(task.completedByMemberId);

      completed[completedByMemberId] = (completed[completedByMemberId] ?? 0) + 1;
    }
  }

  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === 'done').length,
    assignments,
    completed,
  };
}

export async function getHouseholdSnapshot(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });

    await ensureUser(req, telegramId);
    const year = Number(req.query?.year);
    const month = Number(req.query?.month);
    const monthYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const monthIndex = Number.isFinite(month) ? month : new Date().getMonth();

    const members = await ensureSeedMembers(telegramId, telegramId);
    await ensureMonthTasks(telegramId, monthYear, monthIndex, members);

    const monthTasks = await HouseholdTask.find({
      ownerTelegramId: telegramId,
      year: monthYear,
      month: monthIndex,
    })
      .populate('assignedMemberId', 'name active')
      .populate('completedByMemberId', 'name active')
      .sort({ date: 1, createdAt: 1 });

    return res.json({
      startDate: HOUSEHOLD_APP_START_DATE,
      members: members.map(serializeMember),
      tasks: monthTasks.map(serializeTask),
      stats: buildMonthStats(monthTasks, members),
    });
  } catch (error) {
    console.error('getHouseholdSnapshot', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function getHouseholdYearSummary(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });

    await ensureUser(req, telegramId);
    const year = Number(req.query?.year);
    const selectedYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const members = await ensureSeedMembers(telegramId, telegramId);

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      await ensureMonthTasks(telegramId, selectedYear, monthIndex, members);
    }

    const tasks = await HouseholdTask.find({
      ownerTelegramId: telegramId,
      year: selectedYear,
    })
      .populate('assignedMemberId', 'name active')
      .populate('completedByMemberId', 'name active')
      .sort({ date: 1, createdAt: 1 });

    const months = Array.from({ length: 12 }, (_, monthIndex) => {
      const monthTasks = tasks.filter((task) => task.month === monthIndex);
      const assignments = {};
      const completed = {};
      const choreCounts = {};

      for (const member of members) {
        assignments[String(member._id)] = 0;
        completed[String(member._id)] = 0;
      }

      for (const task of monthTasks) {
        const assignedMemberId =
          task.assignedMemberId && typeof task.assignedMemberId === 'object'
            ? String(task.assignedMemberId._id)
            : String(task.assignedMemberId);
        assignments[assignedMemberId] = (assignments[assignedMemberId] ?? 0) + 1;
        choreCounts[task.title] = (choreCounts[task.title] ?? 0) + 1;

        if (task.status === 'done' && task.completedByMemberId) {
          const completedByMemberId =
            task.completedByMemberId && typeof task.completedByMemberId === 'object'
              ? String(task.completedByMemberId._id)
              : String(task.completedByMemberId);
          completed[completedByMemberId] = (completed[completedByMemberId] ?? 0) + 1;
        }
      }

      const busiestChore =
        Object.entries(choreCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Без задач';

      return {
        monthIndex,
        total: monthTasks.length,
        done: monthTasks.filter((task) => task.status === 'done').length,
        assignments,
        completed,
        busiestChore,
      };
    });

    return res.json({
      year: selectedYear,
      members: members.map(serializeMember),
      months,
    });
  } catch (error) {
    console.error('getHouseholdYearSummary', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function createHouseholdMember(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required' });

    await ensureUser(req, telegramId);
    const existing = await HouseholdMember.find({ ownerTelegramId: telegramId }).sort({ sortOrder: 1, createdAt: 1 });
    const member = await HouseholdMember.create({
      ownerTelegramId: telegramId,
      name,
      sortOrder: existing.length,
      active: true,
      createdByTelegramId: telegramId,
      lastUpdatedByTelegramId: telegramId,
    });

    return res.status(201).json({ member: serializeMember(member) });
  } catch (error) {
    console.error('createHouseholdMember', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function updateHouseholdMember(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });

    const patch = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'name must not be empty' });
      patch.name = name;
    }
    if (req.body?.active != null) patch.active = Boolean(req.body.active);
    if (req.body?.sortOrder != null) patch.sortOrder = Number(req.body.sortOrder) || 0;
    patch.lastUpdatedByTelegramId = telegramId;

    const member = await HouseholdMember.findOneAndUpdate(
      { _id: req.params.id, ownerTelegramId: telegramId },
      { $set: patch },
      { new: true },
    );

    if (!member) return res.status(404).json({ message: 'Member not found' });
    return res.json({ member: serializeMember(member) });
  } catch (error) {
    console.error('updateHouseholdMember', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function getHouseholdActivity(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });

    const year = Number(req.query?.year);
    const month = Number(req.query?.month);
    const selectedYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const selectedMonth = Number.isFinite(month) ? month : new Date().getMonth();
    const from = startOfMonth(selectedYear, selectedMonth);
    const to = endOfMonth(selectedYear, selectedMonth);

    const tasks = await HouseholdTask.find({
      ownerTelegramId: telegramId,
      date: { $gte: from, $lte: to },
      status: 'done',
    })
      .populate('assignedMemberId', 'name active')
      .populate('completedByMemberId', 'name active')
      .sort({ completedAt: -1, updatedAt: -1 });

    return res.json({
      items: tasks.map(serializeTask),
    });
  } catch (error) {
    console.error('getHouseholdActivity', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}

export async function updateHouseholdTaskStatus(req, res) {
  try {
    const telegramId = readTelegramId(req);
    if (!telegramId) return res.status(400).json({ message: 'telegramId is required' });

    const status = String(req.body?.status || '').trim();
    if (!['pending', 'done'].includes(status)) {
      return res.status(400).json({ message: 'status must be pending or done' });
    }

    const task = await HouseholdTask.findOne({ _id: req.params.id, ownerTelegramId: telegramId });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    let completedByMemberId = task.completedByMemberId;
    if (status === 'done') {
      const requestedMemberId = req.body?.completedByMemberId ? String(req.body.completedByMemberId) : '';
      if (requestedMemberId) {
        const member = await HouseholdMember.findOne({ _id: requestedMemberId, ownerTelegramId: telegramId });
        if (!member) return res.status(404).json({ message: 'Completed-by member not found' });
        completedByMemberId = member._id;
      } else {
        completedByMemberId = task.assignedMemberId;
      }
    } else {
      completedByMemberId = null;
    }

    const updated = await HouseholdTask.findOneAndUpdate(
      { _id: req.params.id, ownerTelegramId: telegramId },
      {
        $set: {
          status,
          completedAt: status === 'done' ? new Date() : null,
          completedByMemberId,
          updatedByTelegramId: telegramId,
        },
      },
      { new: true },
    )
      .populate('assignedMemberId', 'name active')
      .populate('completedByMemberId', 'name active');

    return res.json({ task: serializeTask(updated) });
  } catch (error) {
    console.error('updateHouseholdTaskStatus', error);
    return res.status(500).json({ message: 'Internal error' });
  }
}
