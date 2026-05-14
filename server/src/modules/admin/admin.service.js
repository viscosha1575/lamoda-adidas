import { HttpError } from "../../lib/http-error.js";

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

function getRangeBucketInterval(range) {
  if (range === "today") {
    return "hour";
  }

  if (range === "all") {
    return "month";
  }

  return "day";
}

function getSeriesBucketDates(range) {
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

    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      buckets.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex));
    }

    return buckets;
  }

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  for (let monthOffset = 11; monthOffset >= 0; monthOffset -= 1) {
    buckets.push(new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - monthOffset, 1));
  }

  return buckets;
}

function toBucketKey(date) {
  return new Date(date).toISOString();
}

function formatBucketLabel(date, range) {
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

function normalizeSeriesPoints(rows, range) {
  const rowsByBucket = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      toBucketKey(row.bucket_start),
      Number(row.value ?? 0),
    ]),
  );

  return getSeriesBucketDates(range).map((bucketDate) => ({
    key: toBucketKey(bucketDate),
    label: formatBucketLabel(bucketDate, range),
    value: rowsByBucket.get(toBucketKey(bucketDate)) ?? 0,
  }));
}

function buildCumulativeSeries(points, baseline = 0) {
  let runningTotal = Number(baseline || 0);

  return (Array.isArray(points) ? points : []).map((point) => {
    runningTotal += Number(point.value || 0);

    return {
      ...point,
      value: runningTotal,
    };
  });
}

function normalizeDisplayName(player) {
  const fullName = [player.firstName, player.lastName].filter(Boolean).join(" ").trim();
  return fullName || player.username || `Игрок #${player.id}`;
}

function isPlayerOnline(player, onlineWindowSeconds) {
  if (!player?.lastSeenAt) {
    return false;
  }

  return Date.now() - new Date(player.lastSeenAt).getTime() <= onlineWindowSeconds * 1000;
}

function normalizePlayer(player, onlineWindowSeconds) {
  return {
    ...player,
    displayName: normalizeDisplayName(player),
    isOnline: isPlayerOnline(player, onlineWindowSeconds),
  };
}

function normalizePlayerDetails(row, onlineWindowSeconds) {
  return {
    player: normalizePlayer({
      id: Number(row.id),
      telegramUserId: row.telegram_user_id ? Number(row.telegram_user_id) : null,
      username: row.username ?? null,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      referralCode: row.referral_code ?? null,
      referredByCode: row.referred_by_code ?? null,
      hasReferral: Boolean(row.has_referral),
      authProvider: row.auth_provider ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }, onlineWindowSeconds),
    stats: {
      totalSessions: Number(row.total_sessions ?? 0),
      finishedSessions: Number(row.finished_sessions ?? 0),
      totalDurationSeconds: Number(row.total_duration_seconds ?? 0),
      bestDurationSeconds: Number(row.best_duration_seconds ?? 0),
      averageDurationSeconds: Number(row.average_duration_seconds ?? 0),
      totalActivityLogs: Number(row.total_activity_logs ?? 0),
      lastSessionAt: row.last_session_at ?? null,
    },
  };
}

function resolveSortColumn(sortKey) {
  if (sortKey === "lastSeenAt") {
    return "p.last_seen_at";
  }

  if (sortKey === "displayName") {
    return "COALESCE(NULLIF(TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))), ''), p.username, '')";
  }

  if (sortKey === "bestDurationSeconds") {
    return "COALESCE(rs.best_duration_seconds, 0)";
  }

  if (sortKey === "totalSessions") {
    return "COALESCE(ss.total_sessions, 0)";
  }

  return "p.created_at";
}

function resolveSortDirection(sortDirection) {
  return String(sortDirection).toLowerCase() === "asc" ? "ASC" : "DESC";
}

export function createAdminService({
  adminRepository,
  config,
}) {
  return {
    getAuthMe() {
      return {
        admin: {
          id: "local-admin",
          username: config.environment === "production" ? "admin" : "local_admin",
        },
      };
    },

    async getAnalyticsOverview(payload = {}) {
      const range = ["today", "7d", "30d", "all"].includes(payload?.range) ? payload.range : "today";
      const rangeStart = getRangeStart(range);
      const bucketInterval = getRangeBucketInterval(range);
      const onlineThreshold = new Date(Date.now() - config.playerOnlineWindowSeconds * 1000);
      const overview = await adminRepository.getAnalyticsOverview({
        rangeStart,
        onlineThreshold,
        bucketInterval,
      });

      return {
        meta: {
          range,
          cachedAt: new Date().toISOString(),
        },
        summary: {
          totalPlayersCount: Number(overview.summary?.total_players_count ?? 0),
          newPlayersCount: Number(overview.summary?.new_players_count ?? 0),
          sessionsStartedCount: Number(overview.summary?.sessions_started_count ?? 0),
          finishedSessionsCount: Number(overview.summary?.finished_sessions_count ?? 0),
          playersWithFinishedGameCount: Number(
            overview.summary?.players_with_finished_game_count ?? 0,
          ),
          currentlyOnlinePlayersCount: Number(
            overview.summary?.currently_online_players_count ?? 0,
          ),
          averageCompletionSeconds: Number(
            overview.summary?.average_completion_seconds ?? 0,
          ),
          averageFoundSneakersCount: Number(
            overview.summary?.average_found_sneakers_count ?? 0,
          ),
          referralsInPeriodCount: Number(
            overview.summary?.referrals_in_period_count ?? 0,
          ),
          totalReferredPlayersCount: Number(
            overview.summary?.total_referred_players_count ?? 0,
          ),
        },
        series: {
          newPlayers: normalizeSeriesPoints(overview.series?.newPlayers, range),
          totalPlayers: buildCumulativeSeries(
            normalizeSeriesPoints(overview.series?.newPlayers, range),
            overview.series?.playersBeforeRangeCount ?? 0,
          ),
          sessionsStarted: normalizeSeriesPoints(overview.series?.sessionsStarted, range),
          sessionsFinished: normalizeSeriesPoints(overview.series?.sessionsFinished, range),
        },
        recentSessions: overview.recentSessions.map((session) => ({
          ...session,
          player: {
            ...session.player,
            displayName: normalizeDisplayName(session.player),
          },
        })),
      };
    },

    async getPlayers(payload = {}) {
      const page = Math.max(1, Number(payload?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(payload?.pageSize) || 25));
      const sortColumn = resolveSortColumn(payload?.sortKey);
      const sortDirection = resolveSortDirection(payload?.sortDirection);
      const result = await adminRepository.findPlayers({
        search: payload?.search ?? "",
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sortColumn,
        sortDirection,
      });

      return {
        items: result.items.map((player) => normalizePlayer(player, config.playerOnlineWindowSeconds)),
        pagination: {
          page,
          pageSize,
          totalItems: result.totalItems,
          totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
        },
      };
    },

    async getPlayer(payload = {}) {
      const playerId = Number(payload?.playerId);

      if (!Number.isInteger(playerId) || playerId <= 0) {
        throw new HttpError(400, "playerId is required");
      }

      const player = await adminRepository.findPlayerById(playerId);

      if (!player) {
        throw new HttpError(404, "Player not found");
      }

      const recentSessions = await adminRepository.findRecentSessionsByPlayerId(playerId, 20);

      return {
        ...normalizePlayerDetails(player, config.playerOnlineWindowSeconds),
        recentSessions,
      };
    },

    async getPlayerLogs(payload = {}) {
      const playerId = Number(payload?.playerId);
      const limit = Math.min(200, Math.max(1, Number(payload?.limit) || 50));

      if (!Number.isInteger(playerId) || playerId <= 0) {
        throw new HttpError(400, "playerId is required");
      }

      return {
        logs: await adminRepository.findActivityLogsByPlayerId(playerId, limit),
      };
    },

    async deletePlayer(payload = {}) {
      const playerId = Number(payload?.playerId);

      if (!Number.isInteger(playerId) || playerId <= 0) {
        throw new HttpError(400, "playerId is required");
      }

      const deleted = await adminRepository.deletePlayerById(playerId);

      if (!deleted) {
        throw new HttpError(404, "Player not found");
      }

      return {
        deleted: true,
      };
    },
  };
}
