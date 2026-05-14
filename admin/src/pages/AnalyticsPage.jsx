import { useEffect, useMemo, useState } from "react";
import { postJson } from "../api";

const RANGE_OPTIONS = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "all", label: "Все время" },
];

const EMPTY_ANALYTICS = {
  meta: {
    range: "today",
    cachedAt: "",
  },
  series: {
    newPlayers: [],
    totalPlayers: [],
    sessionsStarted: [],
    sessionsFinished: [],
  },
  summary: {
    totalPlayersCount: 0,
    newPlayersCount: 0,
    sessionsStartedCount: 0,
    finishedSessionsCount: 0,
    playersWithFinishedGameCount: 0,
    currentlyOnlinePlayersCount: 0,
    averageCompletionSeconds: 0,
    averageFoundSneakersCount: 0,
    referralsInPeriodCount: 0,
    totalReferredPlayersCount: 0,
  },
  recentSessions: [],
};

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("ru-RU");
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  if (!safeSeconds) {
    return "0с";
  }

  if (minutes > 0) {
    return `${minutes}м ${restSeconds}с`;
  }

  return `${restSeconds}с`;
}

function StatGrid({ title, rows }) {
  return (
    <section className="panel-card analytics-card">
      <header className="analytics-card__header">
        <h2>{title}</h2>
      </header>
      <div className="analytics-stats-grid">
        {rows.map((row) => (
          <article className="analytics-stat" key={row.key}>
            <div className="analytics-stat__label">{row.label}</div>
            <div className="analytics-stat__value">{row.value}</div>
            {row.subtext ? <div className="analytics-stat__subtext">{row.subtext}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function buildPolyline(points, width, height, maxValue) {
  if (!Array.isArray(points) || points.length === 0) {
    return "";
  }

  return points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : (index / (points.length - 1)) * width;
    const y = height - ((Number(point.value || 0) / maxValue) * height);

    return `${x},${y}`;
  }).join(" ");
}

function TrendChart({ title, points = [] }) {
  const safePoints = Array.isArray(points) ? points : [];
  const maxValue = Math.max(1, ...safePoints.map((point) => Number(point.value || 0)));
  const polyline = buildPolyline(safePoints, 100, 180, maxValue);
  const step = safePoints.length > 12 ? Math.ceil(safePoints.length / 6) : 1;

  return (
    <section className="panel-card analytics-card">
      <header className="analytics-card__header">
        <h2>{title}</h2>
      </header>

      <div className="analytics-chart">
        <svg viewBox="0 0 100 180" preserveAspectRatio="none" aria-hidden="true">
          <line className="analytics-grid-line" x1="0" x2="100" y1="180" y2="180" />
          <line className="analytics-grid-line" x1="0" x2="100" y1="120" y2="120" />
          <line className="analytics-grid-line" x1="0" x2="100" y1="60" y2="60" />
          <line className="analytics-grid-line" x1="0" x2="100" y1="0" y2="0" />
          {polyline ? (
            <polyline
              className="analytics-line analytics-line--blue"
              points={polyline}
            />
          ) : null}
        </svg>

        <div className="analytics-chart__labels">
          {safePoints.map((point, index) => (
            <span key={point.key || `${point.label}-${index}`}>
              {index % step === 0 || index === safePoints.length - 1 ? point.label : ""}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const [selectedRange, setSelectedRange] = useState("today");
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const response = await postJson("/api/analytics/overview", {
          range: selectedRange,
        });

        if (cancelled) {
          return;
        }

        setAnalytics({
          meta: response?.meta || EMPTY_ANALYTICS.meta,
          series: {
            ...EMPTY_ANALYTICS.series,
            ...(response?.series || {}),
          },
          summary: {
            ...EMPTY_ANALYTICS.summary,
            ...(response?.summary || {}),
          },
          recentSessions: Array.isArray(response?.recentSessions) ? response.recentSessions : [],
        });
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить аналитику");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [selectedRange]);

  async function handleRefresh() {
    setRefreshing(true);
    setError("");

    try {
      const response = await postJson("/api/analytics/overview", {
        range: selectedRange,
        refresh: true,
      });

      setAnalytics({
        meta: response?.meta || EMPTY_ANALYTICS.meta,
        series: {
          ...EMPTY_ANALYTICS.series,
          ...(response?.series || {}),
        },
        summary: {
          ...EMPTY_ANALYTICS.summary,
          ...(response?.summary || {}),
        },
        recentSessions: Array.isArray(response?.recentSessions) ? response.recentSessions : [],
      });
    } catch (requestError) {
      setError(requestError.message || "Не удалось обновить аналитику");
    } finally {
      setRefreshing(false);
    }
  }

  const summary = analytics.summary;
  const kpiRows = useMemo(() => ([
    {
      key: "totalPlayersCount",
      label: "Всего игроков",
      value: formatNumber(summary.totalPlayersCount),
    },
    {
      key: "newPlayersCount",
      label: "Новых за период",
      value: formatNumber(summary.newPlayersCount),
    },
    {
      key: "sessionsStartedCount",
      label: "Стартов игры",
      value: formatNumber(summary.sessionsStartedCount),
    },
    {
      key: "finishedSessionsCount",
      label: "Завершенных игр",
      value: formatNumber(summary.finishedSessionsCount),
    },
    {
      key: "playersWithFinishedGameCount",
      label: "Игроков с финишем",
      value: formatNumber(summary.playersWithFinishedGameCount),
    },
    {
      key: "currentlyOnlinePlayersCount",
      label: "Онлайн сейчас",
      value: formatNumber(summary.currentlyOnlinePlayersCount),
    },
  ]), [summary]);

  const gameRows = useMemo(() => ([
    {
      key: "averageCompletionSeconds",
      label: "Среднее время финиша",
      value: formatDuration(summary.averageCompletionSeconds),
    },
    {
      key: "averageFoundSneakersCount",
      label: "Среднее найдено пар",
      value: formatNumber(summary.averageFoundSneakersCount),
      subtext: "По всем игровым сессиям за период",
    },
    {
      key: "referralsInPeriodCount",
      label: "Реферальных входов за период",
      value: formatNumber(summary.referralsInPeriodCount),
    },
    {
      key: "totalReferredPlayersCount",
      label: "Игроков с рефералом",
      value: formatNumber(summary.totalReferredPlayersCount),
    },
  ]), [summary]);

  const updatedAtLabel = analytics.meta?.cachedAt
    ? formatDateTime(analytics.meta.cachedAt)
    : "—";

  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div className="analytics-ranges">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`analytics-range ${selectedRange === option.value ? "is-active" : ""}`}
              onClick={() => setSelectedRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`analytics-refresh ${refreshing ? "is-spinning" : ""}`}
          onClick={handleRefresh}
        >
          Обновить
        </button>
      </div>

      <div className="panel-card__meta">Обновлено: {updatedAtLabel}</div>

      {error ? <div className="admin-message error">{error}</div> : null}

      {loading ? (
        <div className="analytics-stack">
          <div className="analytics-skeleton" />
          <div className="analytics-skeleton analytics-skeleton--table" />
        </div>
      ) : (
        <div className="analytics-stack">
          <TrendChart title="Новые игроки" points={analytics.series.newPlayers} />
          <TrendChart title="Все игроки" points={analytics.series.totalPlayers} />
          <TrendChart title="Старты сессий" points={analytics.series.sessionsStarted} />
          <TrendChart title="Финиши" points={analytics.series.sessionsFinished} />
          <StatGrid title="Игроки и активность" rows={kpiRows} />
          <StatGrid title="Игровые метрики" rows={gameRows} />

          <section className="panel-card analytics-card">
            <header className="analytics-card__header">
              <h2>Последние игровые сессии</h2>
            </header>

            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Игрок</th>
                    <th>Статус</th>
                    <th>Найдено пар</th>
                    <th>Осталось времени</th>
                    <th>Старт</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentSessions.length > 0 ? analytics.recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.player?.displayName || session.player?.username || `#${session.playerId}`}</td>
                      <td>{session.status || "—"}</td>
                      <td>{formatNumber(session.foundSneakersCount)}</td>
                      <td>{formatDuration(session.remainingSeconds)}</td>
                      <td>{formatDateTime(session.startedAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5">За выбранный период игровых сессий нет</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
