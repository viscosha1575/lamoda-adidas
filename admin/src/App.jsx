import { useEffect, useState } from "react";
import { postJson, setTelegramInitData } from "./api";
import AnalyticsPage from "./pages/AnalyticsPage";
import PlayersPage from "./pages/PlayersPage";
import { getTelegramWebApp } from "./telegram";

function AnalyticsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.75 18.25h14.5M7.5 16V11.5m4.5 4.5V7.75m4.5 8.25v-5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.5 19.25v-1.5a3.25 3.25 0 0 0-3.25-3.25h-4.5A3.25 3.25 0 0 0 4.5 17.75v1.5m12-7.5a2.75 2.75 0 1 0 0-5.5m2.75 13v-1a3 3 0 0 0-2.25-2.9M10 11.75a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const TAB_CONFIG = {
  analytics: {
    label: "Аналитика",
    title: "Аналитика",
    icon: <AnalyticsIcon />,
  },
  players: {
    label: "Игроки",
    title: "Игроки",
    icon: <PlayersIcon />,
  },
};

function getInitialTab() {
  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get("tab");

  if (tab === "analytics") {
    return "analytics";
  }

  if (tab === "players") {
    return "players";
  }

  return "analytics";
}

export default function App() {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [authState, setAuthState] = useState({
    loading: true,
    error: "",
    admin: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function authenticate() {
      try {
        const webApp = await getTelegramWebApp();
        setTelegramInitData(webApp.initData);

        if (webApp.isLocalBypass) {
          if (!isMounted) {
            return;
          }

          setAuthState({
            loading: false,
            error: "",
            admin: {
              id: "local-dev",
              username: "local_admin",
            },
          });
          return;
        }

        const response = await postJson("/api/auth/me", {});

        if (!isMounted) {
          return;
        }

        setAuthState({
          loading: false,
          error: "",
          admin: response.admin || null,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setAuthState({
          loading: false,
          error: error.message || "Доступ запрещен",
          admin: null,
        });
      }
    }

    authenticate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.get("tab") !== activeTab) {
      url.searchParams.set("tab", activeTab);
      window.history.replaceState(null, "", url.toString());
    }
  }, [activeTab]);

  const activeConfig = TAB_CONFIG[activeTab];

  if (authState.loading) {
    return <div className="admin-state">Проверяем доступ к админке...</div>;
  }

  if (authState.error) {
    return <div className="admin-state">{authState.error}</div>;
  }

  return (
    <div className="admin-page">
      <main className="admin-shell admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-brand" aria-hidden="true">
            <span className="admin-brand__mark" />
          </div>

          <nav className="admin-tabs" aria-label="Разделы админки">
            {Object.entries(TAB_CONFIG).map(([key, tab]) => (
              <button
                key={key}
                className={`admin-tab ${activeTab === key ? "is-active" : ""}`}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-label={tab.label}
                title={tab.label}
              >
                <span className="admin-tab__icon">{tab.icon}</span>
                <span className="admin-tab__label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="admin-content">
          <header className="admin-header">
            <div>
              <h1>{activeConfig.title}</h1>
            </div>
          </header>

          {activeTab === "analytics" ? <AnalyticsPage /> : null}
          {activeTab === "players" ? <PlayersPage /> : null}
        </section>
      </main>
    </div>
  );
}
