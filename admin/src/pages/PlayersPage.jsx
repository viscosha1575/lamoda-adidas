import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { postJson } from "../api";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const EMPTY_PLAYER_DETAILS = {
  player: null,
  stats: {
    totalSessions: 0,
    finishedSessions: 0,
    totalDurationSeconds: 0,
    bestDurationSeconds: 0,
    averageDurationSeconds: 0,
    totalActivityLogs: 0,
    lastSessionAt: null,
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

function PlayerStat({ label, value, subtext }) {
  return (
    <article className="player-stat">
      <div className="player-stat__label">{label}</div>
      <div className="player-stat__value">{value}</div>
      {subtext ? <div className="player-stat__subtext">{subtext}</div> : null}
    </article>
  );
}

export default function PlayersPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState("desc");
  const [playersResponse, setPlayersResponse] = useState({
    items: [],
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
    },
  });
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedPlayerDetails, setSelectedPlayerDetails] = useState(EMPTY_PLAYER_DETAILS);
  const [selectedPlayerLogs, setSelectedPlayerLogs] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setError("");

      try {
        const response = await postJson("/api/analytics/players", {
          search: deferredSearch,
          page,
          pageSize,
          sortKey,
          sortDirection,
        });

        if (cancelled) {
          return;
        }

        const nextItems = Array.isArray(response?.items) ? response.items : [];
        const nextPagination = response?.pagination || {
          page,
          pageSize,
          totalItems: nextItems.length,
          totalPages: 1,
        };

        setPlayersResponse({
          items: nextItems,
          pagination: nextPagination,
        });

        if (!selectedPlayerId && nextItems[0]?.id) {
          setSelectedPlayerId(nextItems[0].id);
        }

        if (selectedPlayerId && !nextItems.some((player) => player.id === selectedPlayerId)) {
          setSelectedPlayerId(nextItems[0]?.id ?? null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить игроков");
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    void loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, page, pageSize, selectedPlayerId, sortDirection, sortKey]);

  useEffect(() => {
    if (!selectedPlayerId) {
      setSelectedPlayerDetails(EMPTY_PLAYER_DETAILS);
      setSelectedPlayerLogs([]);
      return;
    }

    let cancelled = false;

    async function loadPlayerDetails() {
      setLoadingDetails(true);
      setError("");

      try {
        const [detailsResponse, logsResponse] = await Promise.all([
          postJson("/api/analytics/player", {
            playerId: selectedPlayerId,
          }),
          postJson("/api/logs/user", {
            playerId: selectedPlayerId,
            limit: 50,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setSelectedPlayerDetails({
          player: detailsResponse?.player || null,
          stats: {
            ...EMPTY_PLAYER_DETAILS.stats,
            ...(detailsResponse?.stats || {}),
          },
          recentSessions: Array.isArray(detailsResponse?.recentSessions)
            ? detailsResponse.recentSessions
            : [],
        });
        setSelectedPlayerLogs(Array.isArray(logsResponse?.logs) ? logsResponse.logs : []);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Не удалось загрузить детали игрока");
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    }

    void loadPlayerDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedPlayerId]);

  const selectedPlayer = selectedPlayerDetails.player;
  const stats = selectedPlayerDetails.stats;
  const pagination = playersResponse.pagination;

  const statRows = useMemo(() => ([
    {
      key: "totalSessions",
      label: "Всего сессий",
      value: formatNumber(stats.totalSessions),
    },
    {
      key: "finishedSessions",
      label: "Финишей",
      value: formatNumber(stats.finishedSessions),
    },
    {
      key: "bestDurationSeconds",
      label: "Лучшее время",
      value: formatDuration(stats.bestDurationSeconds),
    },
    {
      key: "averageDurationSeconds",
      label: "Среднее время",
      value: formatDuration(stats.averageDurationSeconds),
    },
    {
      key: "totalActivityLogs",
      label: "Игровых логов",
      value: formatNumber(stats.totalActivityLogs),
    },
    {
      key: "lastSessionAt",
      label: "Последняя сессия",
      value: formatDateTime(stats.lastSessionAt),
    },
  ]), [stats]);

  function handleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDirection((currentValue) => currentValue === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "displayName" ? "asc" : "desc");
  }

  async function handleDeletePlayer() {
    if (!selectedPlayer?.id) {
      return;
    }

    const confirmed = window.confirm(`Удалить игрока ${selectedPlayer.displayName || selectedPlayer.username || `#${selectedPlayer.id}`}?`);

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      await postJson("/api/users/delete", {
        playerId: selectedPlayer.id,
      });

      setSuccessMessage("Игрок удален");
      setSelectedPlayerId(null);
      setSelectedPlayerDetails(EMPTY_PLAYER_DETAILS);
      setSelectedPlayerLogs([]);
      setPage(1);
    } catch (requestError) {
      setError(requestError.message || "Не удалось удалить игрока");
    }
  }

  return (
    <div className="players-page">
      <div className="players-toolbar">
        <div className="players-filters">
          <input
            className="text-input"
            type="search"
            placeholder="Поиск по нику, username, Telegram ID, referral"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />

          <select
            className="text-input"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) || 25);
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} на странице
              </option>
            ))}
          </select>

          <select
            className="text-input"
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value);
              setPage(1);
            }}
          >
            <option value="createdAt">Сначала новые</option>
            <option value="lastSeenAt">По последнему визиту</option>
            <option value="displayName">По имени</option>
            <option value="bestDurationSeconds">По лучшему времени</option>
            <option value="totalSessions">По числу сессий</option>
          </select>
        </div>
      </div>

      {error ? <div className="admin-message error">{error}</div> : null}
      {successMessage ? <div className="admin-message success">{successMessage}</div> : null}

      <div className="players-layout">
        <section className="panel-card players-list-card">
          <header className="analytics-card__header analytics-card__header--split">
            <div>
              <h2>Игроки</h2>
              <div className="panel-card__meta">
                Всего: {formatNumber(pagination.totalItems)}
              </div>
            </div>
          </header>

          {loadingPlayers ? (
            <div className="analytics-skeleton analytics-skeleton--table" />
          ) : (
            <div className="players-table-wrap">
              <table className="players-table">
                <thead>
                  <tr>
                    <th>
                      <button className="players-sort-button" type="button" onClick={() => handleSort("displayName")}>
                        Игрок
                      </button>
                    </th>
                    <th>Telegram ID</th>
                    <th>
                      <button className="players-sort-button" type="button" onClick={() => handleSort("totalSessions")}>
                        Сессии
                      </button>
                    </th>
                    <th>
                      <button className="players-sort-button" type="button" onClick={() => handleSort("bestDurationSeconds")}>
                        Лучшее время
                      </button>
                    </th>
                    <th>
                      <button className="players-sort-button" type="button" onClick={() => handleSort("lastSeenAt")}>
                        Последний визит
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {playersResponse.items.length > 0 ? playersResponse.items.map((player) => (
                    <tr
                      key={player.id}
                      className={selectedPlayerId === player.id ? "is-active" : ""}
                      onClick={() => setSelectedPlayerId(player.id)}
                    >
                      <td>
                        <div className="players-table__primary">
                          {player.displayName || player.username || `Игрок #${player.id}`}
                        </div>
                        <div className="players-table__secondary">
                          {player.username ? `@${player.username}` : player.referralCode || "Без username"}
                        </div>
                      </td>
                      <td>{player.telegramUserId || "—"}</td>
                      <td>{formatNumber(player.totalSessions)}</td>
                      <td>{formatDuration(player.bestDurationSeconds)}</td>
                      <td>{formatDateTime(player.lastSeenAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="5">Игроки не найдены</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="players-pagination">
            <div className="panel-card__meta">
              Страница {formatNumber(pagination.page)} из {formatNumber(pagination.totalPages)}
            </div>
            <div className="players-pagination__actions">
              <button
                className="analytics-range"
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
              >
                Назад
              </button>
              <button
                className="analytics-range"
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((currentValue) => currentValue + 1)}
              >
                Вперед
              </button>
            </div>
          </div>
        </section>

        <section className="panel-card players-detail-card">
          {!selectedPlayer ? (
            <div className="panel-card__meta">Выберите игрока слева</div>
          ) : (
            <>
              <header className="analytics-card__header analytics-card__header--split">
                <div>
                  <h2>{selectedPlayer.displayName || selectedPlayer.username || `Игрок #${selectedPlayer.id}`}</h2>
                  <div className="panel-card__meta">
                    ID {selectedPlayer.id}
                    {selectedPlayer.username ? ` • @${selectedPlayer.username}` : ""}
                  </div>
                </div>
                <button className="analytics-range" type="button" onClick={handleDeletePlayer}>
                  Удалить игрока
                </button>
              </header>

              {loadingDetails ? (
                <div className="analytics-skeleton analytics-skeleton--table" />
              ) : (
                <>
                  <div className="players-stats-grid">
                    {statRows.map((row) => (
                      <PlayerStat
                        key={row.key}
                        label={row.label}
                        value={row.value}
                        subtext={row.subtext}
                      />
                    ))}
                  </div>

                  <div className="players-meta-grid">
                    <div><strong>Telegram ID:</strong> {selectedPlayer.telegramUserId || "—"}</div>
                    <div><strong>Имя:</strong> {selectedPlayer.firstName || "—"}</div>
                    <div><strong>Фамилия:</strong> {selectedPlayer.lastName || "—"}</div>
                    <div><strong>Referral code:</strong> {selectedPlayer.referralCode || "—"}</div>
                    <div><strong>Пришел по referral:</strong> {selectedPlayer.referredByCode || "—"}</div>
                    <div><strong>Есть referral:</strong> {selectedPlayer.hasReferral ? "Да" : "Нет"}</div>
                    <div><strong>Онлайн:</strong> {selectedPlayer.isOnline ? "Да" : "Нет"}</div>
                    <div><strong>Создан:</strong> {formatDateTime(selectedPlayer.createdAt)}</div>
                    <div><strong>Последний визит:</strong> {formatDateTime(selectedPlayer.lastSeenAt)}</div>
                  </div>

                  <section className="players-sessions">
                    <header className="analytics-card__header">
                      <h3>Последние сессии</h3>
                    </header>
                    <div className="analytics-table-wrap">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Статус</th>
                            <th>Найдено пар</th>
                            <th>Осталось времени</th>
                            <th>Старт</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPlayerDetails.recentSessions.length > 0 ? selectedPlayerDetails.recentSessions.map((session) => (
                            <tr key={session.id}>
                              <td>{session.id}</td>
                              <td>{session.status || "—"}</td>
                              <td>{formatNumber(session.foundSneakersCount)}</td>
                              <td>{formatDuration(session.remainingSeconds)}</td>
                              <td>{formatDateTime(session.startedAt)}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="5">Сессий пока нет</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="players-sessions">
                    <header className="analytics-card__header">
                      <h3>Игровые логи</h3>
                    </header>
                    <div className="analytics-table-wrap">
                      <table className="analytics-table analytics-table--logs">
                        <thead>
                          <tr>
                            <th>Время</th>
                            <th>Source</th>
                            <th>Action</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPlayerLogs.length > 0 ? selectedPlayerLogs.map((log) => (
                            <tr key={log.id}>
                              <td>{formatDateTime(log.createdAt)}</td>
                              <td>{log.source || "—"}</td>
                              <td>{log.action || "—"}</td>
                              <td>
                                <code>{JSON.stringify(log.details || {})}</code>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="4">Логов пока нет</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
