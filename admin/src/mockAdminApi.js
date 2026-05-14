function hoursAgo(value) {
  return new Date(Date.now() - value * 60 * 60 * 1000).toISOString();
}

function daysAgo(value, extraHours = 0) {
  return new Date(Date.now() - (value * 24 + extraHours) * 60 * 60 * 1000).toISOString();
}

function buildDisplayName(player) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ").trim() || player.username || `Игрок #${player.id}`;
}

function createMockPlayer({
  id,
  username,
  firstName,
  lastName,
  daysCreatedAgo,
  hoursSeenAgo,
  hasReferral = false,
  referredByCode = null,
  completedGame = false,
  timeExpired = false,
  promoCode = null,
}) {
  return {
    id,
    telegramUserId: 900000 + id,
    username,
    firstName,
    lastName,
    referralCode: `LAMODA-${String(id).padStart(4, "0")}`,
    referredByCode,
    hasReferral,
    completedGame,
    timeExpired,
    promoCode,
    authProvider: "telegram",
    createdAt: daysAgo(daysCreatedAgo, id % 6),
    updatedAt: hoursAgo(Math.max(1, hoursSeenAgo - 1)),
    lastSeenAt: hoursAgo(hoursSeenAgo),
  };
}

function createMockSession({
  id,
  playerId,
  status,
  foundSneakersCount,
  remainingSeconds,
  daysStartedAgo,
  hoursStartedAgo = 0,
  pauseCount = 0,
  finishedOffsetHours = null,
}) {
  const startedAt = new Date(Date.now() - ((daysStartedAgo * 24) + hoursStartedAgo) * 60 * 60 * 1000);
  const finishedAt = finishedOffsetHours == null ? null : new Date(startedAt.getTime() + finishedOffsetHours * 60 * 60 * 1000);

  return {
    id,
    playerId,
    status,
    remainingSeconds,
    foundSneakersCount,
    pauseCount,
    startedAt: startedAt.toISOString(),
    lastResumedAt: startedAt.toISOString(),
    lastPausedAt: pauseCount > 0 ? new Date(startedAt.getTime() + 20 * 60 * 1000).toISOString() : null,
    lastHeartbeatAt: new Date(startedAt.getTime() + 35 * 60 * 1000).toISOString(),
    finishedAt: finishedAt ? finishedAt.toISOString() : null,
    expiredAt: null,
  };
}

function createMockLog({
  id,
  playerId,
  gameSessionId,
  source = "unity",
  action,
  details,
  hoursAgoValue,
}) {
  return {
    id,
    playerId,
    gameSessionId,
    source,
    action,
    details,
    createdAt: hoursAgo(hoursAgoValue),
  };
}

const mockState = {
  players: [
    createMockPlayer({ id: 1, username: "mila.design", firstName: "Мила", lastName: "Иванова", daysCreatedAgo: 1, hoursSeenAgo: 0.15, completedGame: true, promoCode: "TEST-LAMODA-0001" }),
    createMockPlayer({ id: 2, username: "roma.runner", firstName: "Роман", lastName: "Петров", daysCreatedAgo: 2, hoursSeenAgo: 1.2, timeExpired: true }),
    createMockPlayer({ id: 3, username: "katya.style", firstName: "Катя", lastName: "Соколова", daysCreatedAgo: 3, hoursSeenAgo: 0.5, hasReferral: true, referredByCode: "LAMODA-0001", completedGame: true, promoCode: "TEST-LAMODA-0002" }),
    createMockPlayer({ id: 4, username: "nikita.arc", firstName: "Никита", lastName: "Орлов", daysCreatedAgo: 4, hoursSeenAgo: 5.2 }),
    createMockPlayer({ id: 5, username: "dasha.wave", firstName: "Дарья", lastName: "Морозова", daysCreatedAgo: 5, hoursSeenAgo: 0.35, hasReferral: true, referredByCode: "LAMODA-0003", completedGame: true, promoCode: "TEST-LAMODA-0003" }),
    createMockPlayer({ id: 6, username: "artem.k", firstName: "Артем", lastName: "Кузнецов", daysCreatedAgo: 6, hoursSeenAgo: 13 }),
    createMockPlayer({ id: 7, username: "vika.move", firstName: "Вика", lastName: "Семенова", daysCreatedAgo: 7, hoursSeenAgo: 0.8, timeExpired: true }),
    createMockPlayer({ id: 8, username: "alex.kick", firstName: "Алексей", lastName: "Федоров", daysCreatedAgo: 8, hoursSeenAgo: 24 }),
    createMockPlayer({ id: 9, username: "sonya.sun", firstName: "Соня", lastName: "Лебедева", daysCreatedAgo: 9, hoursSeenAgo: 1.7, completedGame: true, promoCode: "TEST-LAMODA-0004" }),
    createMockPlayer({ id: 10, username: "tim.trail", firstName: "Тимур", lastName: "Егоров", daysCreatedAgo: 10, hoursSeenAgo: 33 }),
    createMockPlayer({ id: 11, username: "lena.run", firstName: "Елена", lastName: "Новикова", daysCreatedAgo: 11, hoursSeenAgo: 0.4 }),
    createMockPlayer({ id: 12, username: "max.field", firstName: "Максим", lastName: "Громов", daysCreatedAgo: 14, hoursSeenAgo: 8 }),
  ],
  sessions: [
    createMockSession({ id: 101, playerId: 1, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 0, hoursStartedAgo: 2, finishedOffsetHours: 0.12 }),
    createMockSession({ id: 102, playerId: 2, status: "finished", foundSneakersCount: 8, remainingSeconds: 0, daysStartedAgo: 0, hoursStartedAgo: 4, pauseCount: 1, finishedOffsetHours: 0.2 }),
    createMockSession({ id: 103, playerId: 3, status: "active", foundSneakersCount: 6, remainingSeconds: 284, daysStartedAgo: 0, hoursStartedAgo: 1 }),
    createMockSession({ id: 104, playerId: 4, status: "paused", foundSneakersCount: 4, remainingSeconds: 412, daysStartedAgo: 1, hoursStartedAgo: 3, pauseCount: 2 }),
    createMockSession({ id: 105, playerId: 5, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 1, hoursStartedAgo: 7, finishedOffsetHours: 0.15 }),
    createMockSession({ id: 106, playerId: 6, status: "finished", foundSneakersCount: 7, remainingSeconds: 0, daysStartedAgo: 2, hoursStartedAgo: 2, finishedOffsetHours: 0.18 }),
    createMockSession({ id: 107, playerId: 7, status: "active", foundSneakersCount: 2, remainingSeconds: 521, daysStartedAgo: 2, hoursStartedAgo: 6 }),
    createMockSession({ id: 108, playerId: 8, status: "finished", foundSneakersCount: 9, remainingSeconds: 0, daysStartedAgo: 3, hoursStartedAgo: 4, finishedOffsetHours: 0.2 }),
    createMockSession({ id: 109, playerId: 9, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 3, hoursStartedAgo: 9, finishedOffsetHours: 0.11 }),
    createMockSession({ id: 110, playerId: 10, status: "active", foundSneakersCount: 1, remainingSeconds: 566, daysStartedAgo: 4, hoursStartedAgo: 5 }),
    createMockSession({ id: 111, playerId: 11, status: "paused", foundSneakersCount: 5, remainingSeconds: 337, daysStartedAgo: 5, hoursStartedAgo: 1, pauseCount: 1 }),
    createMockSession({ id: 112, playerId: 12, status: "finished", foundSneakersCount: 6, remainingSeconds: 0, daysStartedAgo: 6, hoursStartedAgo: 10, finishedOffsetHours: 0.22 }),
    createMockSession({ id: 113, playerId: 1, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 7, hoursStartedAgo: 2, finishedOffsetHours: 0.1 }),
    createMockSession({ id: 114, playerId: 3, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 8, hoursStartedAgo: 5, finishedOffsetHours: 0.14 }),
    createMockSession({ id: 115, playerId: 5, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 10, hoursStartedAgo: 8, finishedOffsetHours: 0.16 }),
    createMockSession({ id: 116, playerId: 7, status: "finished", foundSneakersCount: 8, remainingSeconds: 0, daysStartedAgo: 12, hoursStartedAgo: 3, finishedOffsetHours: 0.2 }),
    createMockSession({ id: 117, playerId: 9, status: "finished", foundSneakersCount: 10, remainingSeconds: 0, daysStartedAgo: 15, hoursStartedAgo: 4, finishedOffsetHours: 0.12 }),
    createMockSession({ id: 118, playerId: 11, status: "active", foundSneakersCount: 3, remainingSeconds: 487, daysStartedAgo: 20, hoursStartedAgo: 6 }),
  ],
  logs: [
    createMockLog({ id: 1001, playerId: 1, gameSessionId: 101, action: "found-sneaker", details: { sneakerNumber: 10 }, hoursAgoValue: 1.7 }),
    createMockLog({ id: 1002, playerId: 1, gameSessionId: 101, action: "swipe", details: { direction: "left" }, hoursAgoValue: 1.9 }),
    createMockLog({ id: 1003, playerId: 2, gameSessionId: 102, action: "finish", details: { reason: "time-ended" }, hoursAgoValue: 3.5 }),
    createMockLog({ id: 1004, playerId: 3, gameSessionId: 103, action: "heartbeat", details: { status: "active" }, hoursAgoValue: 0.3 }),
    createMockLog({ id: 1005, playerId: 4, gameSessionId: 104, action: "pause", details: { count: 2 }, hoursAgoValue: 20 }),
    createMockLog({ id: 1006, playerId: 5, gameSessionId: 105, action: "found-sneaker", details: { sneakerNumber: 10 }, hoursAgoValue: 29 }),
    createMockLog({ id: 1007, playerId: 6, gameSessionId: 106, action: "swipe", details: { direction: "right" }, hoursAgoValue: 49 }),
    createMockLog({ id: 1008, playerId: 7, gameSessionId: 107, action: "heartbeat", details: { status: "active" }, hoursAgoValue: 54 }),
    createMockLog({ id: 1009, playerId: 8, gameSessionId: 108, action: "finish", details: { reason: "time-ended" }, hoursAgoValue: 76 }),
    createMockLog({ id: 1010, playerId: 9, gameSessionId: 109, action: "promo-issued", details: { promoCode: "TEST-LAMODA-0004" }, hoursAgoValue: 82 }),
    createMockLog({ id: 1011, playerId: 10, gameSessionId: 110, action: "start", details: { source: "unity" }, hoursAgoValue: 101 }),
    createMockLog({ id: 1012, playerId: 11, gameSessionId: 111, action: "pause", details: { count: 1 }, hoursAgoValue: 121 }),
    createMockLog({ id: 1013, playerId: 12, gameSessionId: 112, action: "finish", details: { reason: "time-ended" }, hoursAgoValue: 147 }),
  ],
};

function getRangeStart(range) {
  const now = new Date();

  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  if (range === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (range === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return null;
}

function getBucketDates(range) {
  const now = new Date();
  const buckets = [];

  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let hour = 0; hour < 24; hour += 1) {
      buckets.push(new Date(start.getTime() + hour * 60 * 60 * 1000));
    }
    return buckets;
  }

  if (range === "7d" || range === "30d") {
    const totalDays = range === "7d" ? 7 : 30;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (totalDays - 1));
    for (let index = 0; index < totalDays; index += 1) {
      buckets.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
    }
    return buckets;
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let offset = 11; offset >= 0; offset -= 1) {
    buckets.push(new Date(start.getFullYear(), start.getMonth() - offset, 1));
  }
  return buckets;
}

function bucketKey(date, range) {
  const value = new Date(date);
  if (range === "today") {
    return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}-${value.getHours()}`;
  }
  if (range === "all") {
    return `${value.getFullYear()}-${value.getMonth()}`;
  }
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function bucketLabel(date, range) {
  if (range === "today") {
    return new Date(date).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (range === "all") {
    return new Date(date).toLocaleDateString("ru-RU", {
      month: "short",
      year: "2-digit",
    });
  }

  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function isInRange(dateValue, rangeStart) {
  return !rangeStart || new Date(dateValue).getTime() >= rangeStart.getTime();
}

function getCompletedInSeconds(session) {
  if (session.status !== "finished") {
    return 0;
  }

  return Math.max(0, 600 - Number(session.remainingSeconds || 0));
}

function getPlayerStats(playerId) {
  const sessions = mockState.sessions.filter((session) => session.playerId === playerId);
  const finished = sessions.filter((session) => session.status === "finished");
  const completedDurations = finished.map(getCompletedInSeconds).filter(Boolean);
  const totalDurationSeconds = completedDurations.reduce((sum, value) => sum + value, 0);
  const recentSession = sessions.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;

  return {
    totalSessions: sessions.length,
    finishedSessions: finished.length,
    totalDurationSeconds,
    bestDurationSeconds: completedDurations.length > 0 ? Math.min(...completedDurations) : 0,
    averageDurationSeconds: completedDurations.length > 0 ? Math.round(totalDurationSeconds / completedDurations.length) : 0,
    totalActivityLogs: mockState.logs.filter((log) => log.playerId === playerId).length,
    lastSessionAt: recentSession?.startedAt ?? null,
  };
}

function buildPlayerView(player) {
  return {
    ...player,
    displayName: buildDisplayName(player),
    isOnline: Date.now() - new Date(player.lastSeenAt).getTime() <= 15 * 1000,
    ...getPlayerStats(player.id),
  };
}

function buildSeries(items, dateKey, range) {
  const bucketMap = new Map();

  for (const item of items) {
    const key = bucketKey(item[dateKey], range);
    bucketMap.set(key, (bucketMap.get(key) || 0) + 1);
  }

  return getBucketDates(range).map((date) => ({
    key: bucketKey(date, range),
    label: bucketLabel(date, range),
    value: bucketMap.get(bucketKey(date, range)) || 0,
  }));
}

function buildAnalyticsOverview(payload = {}) {
  const range = ["today", "7d", "30d", "all"].includes(payload?.range) ? payload.range : "today";
  const rangeStart = getRangeStart(range);
  const players = mockState.players.slice();
  const sessions = mockState.sessions.slice();
  const inRangePlayers = players.filter((player) => isInRange(player.createdAt, rangeStart));
  const inRangeSessions = sessions.filter((session) => isInRange(session.startedAt, rangeStart));
  const finishedInRangeSessions = inRangeSessions.filter((session) => session.status === "finished");
  const totalPlayersSeries = buildSeries(inRangePlayers, "createdAt", range);
  let runningPlayers = players.filter((player) => rangeStart && new Date(player.createdAt) < rangeStart).length;

  const totalPlayers = totalPlayersSeries.map((point) => {
    runningPlayers += point.value;
    return {
      ...point,
      value: runningPlayers,
    };
  });

  return {
    meta: {
      range,
      cachedAt: new Date().toISOString(),
    },
    summary: {
      totalPlayersCount: players.length,
      newPlayersCount: inRangePlayers.length,
      sessionsStartedCount: inRangeSessions.length,
      finishedSessionsCount: finishedInRangeSessions.length,
      playersWithFinishedGameCount: new Set(finishedInRangeSessions.map((session) => session.playerId)).size,
      currentlyOnlinePlayersCount: players.filter((player) => Date.now() - new Date(player.lastSeenAt).getTime() <= 15 * 60 * 1000).length,
      averageCompletionSeconds: finishedInRangeSessions.length > 0
        ? Math.round(finishedInRangeSessions.reduce((sum, session) => sum + getCompletedInSeconds(session), 0) / finishedInRangeSessions.length)
        : 0,
      averageFoundSneakersCount: inRangeSessions.length > 0
        ? Math.round(inRangeSessions.reduce((sum, session) => sum + session.foundSneakersCount, 0) / inRangeSessions.length)
        : 0,
      referralsInPeriodCount: inRangePlayers.filter((player) => player.referredByCode).length,
      totalReferredPlayersCount: players.filter((player) => player.referredByCode).length,
    },
    series: {
      newPlayers: totalPlayersSeries,
      totalPlayers,
      sessionsStarted: buildSeries(inRangeSessions, "startedAt", range),
      sessionsFinished: buildSeries(finishedInRangeSessions, "finishedAt", range),
    },
    recentSessions: inRangeSessions
      .slice()
      .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt))
      .slice(0, 20)
      .map((session) => ({
        ...session,
        player: buildPlayerView(players.find((player) => player.id === session.playerId)),
      })),
  };
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function compareValues(left, right, direction) {
  if (left === right) {
    return 0;
  }

  if (left == null) {
    return direction === "asc" ? -1 : 1;
  }

  if (right == null) {
    return direction === "asc" ? 1 : -1;
  }

  if (left > right) {
    return direction === "asc" ? 1 : -1;
  }

  return direction === "asc" ? -1 : 1;
}

function buildPlayersResponse(payload = {}) {
  const page = Math.max(1, Number(payload?.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(payload?.pageSize) || 25));
  const sortKey = payload?.sortKey || "createdAt";
  const sortDirection = String(payload?.sortDirection || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const search = normalizeSearch(payload?.search);

  let items = mockState.players.map(buildPlayerView);

  if (search) {
    items = items.filter((player) => {
      const haystack = [
        player.id,
        player.telegramUserId,
        player.username,
        player.firstName,
        player.lastName,
        player.referralCode,
        player.referredByCode,
        player.displayName,
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    });
  }

  items.sort((left, right) => {
    if (sortKey === "lastSeenAt") {
      return compareValues(new Date(left.lastSeenAt).getTime(), new Date(right.lastSeenAt).getTime(), sortDirection);
    }

    if (sortKey === "displayName") {
      return compareValues(left.displayName, right.displayName, sortDirection);
    }

    if (sortKey === "bestDurationSeconds") {
      return compareValues(left.bestDurationSeconds, right.bestDurationSeconds, sortDirection);
    }

    if (sortKey === "totalSessions") {
      return compareValues(left.totalSessions, right.totalSessions, sortDirection);
    }

    return compareValues(new Date(left.createdAt).getTime(), new Date(right.createdAt).getTime(), sortDirection);
  });

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const offset = (page - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

function buildPlayerDetails(payload = {}) {
  const playerId = Number(payload?.playerId);
  const player = mockState.players.find((item) => item.id === playerId);

  if (!player) {
    throw new Error("Player not found");
  }

  return {
    player: buildPlayerView(player),
    stats: getPlayerStats(playerId),
    recentSessions: mockState.sessions
      .filter((session) => session.playerId === playerId)
      .slice()
      .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt)),
  };
}

function buildPlayerLogs(payload = {}) {
  const playerId = Number(payload?.playerId);
  const limit = Math.min(200, Math.max(1, Number(payload?.limit) || 50));

  return {
    logs: mockState.logs
      .filter((log) => log.playerId === playerId)
      .slice()
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, limit),
  };
}

function deletePlayer(payload = {}) {
  const playerId = Number(payload?.playerId);
  const playerIndex = mockState.players.findIndex((item) => item.id === playerId);

  if (playerIndex === -1) {
    throw new Error("Player not found");
  }

  mockState.players.splice(playerIndex, 1);
  mockState.sessions = mockState.sessions.filter((session) => session.playerId !== playerId);
  mockState.logs = mockState.logs.filter((log) => log.playerId !== playerId);

  return {
    deleted: true,
    playerId,
  };
}

export function resolveMockAdminResponse(path, body = {}) {
  if (path === "/api/auth/me") {
    return {
      admin: {
        id: "local-mock-admin",
        username: "mock_admin",
      },
    };
  }

  if (path === "/api/analytics/overview") {
    return buildAnalyticsOverview(body);
  }

  if (path === "/api/analytics/players") {
    return buildPlayersResponse(body);
  }

  if (path === "/api/analytics/player") {
    return buildPlayerDetails(body);
  }

  if (path === "/api/logs/user") {
    return buildPlayerLogs(body);
  }

  if (path === "/api/users/delete") {
    return deletePlayer(body);
  }

  throw new Error(`Mock handler not found for ${path}`);
}
