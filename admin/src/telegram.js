const TELEGRAM_SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const TELEGRAM_SDK_SCRIPT_ID = "telegram-web-app-sdk";

let telegramSdkPromise = null;

function isLocalAdminHost() {
  const hostname = window.location.hostname;

  return (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
  );
}

function isLocalAdminBypassEnabled() {
  return import.meta.env.DEV && isLocalAdminHost();
}

function extractTelegramInitDataFromLocation() {
  const candidates = [];

  if (window.location.hash.startsWith("#")) {
    candidates.push(window.location.hash.slice(1));
  }

  if (window.location.search.startsWith("?")) {
    candidates.push(window.location.search.slice(1));
  }

  for (const candidate of candidates) {
    const params = new URLSearchParams(candidate);
    const initData = params.get("tgWebAppData") || params.get("initData");

    if (initData) {
      return initData;
    }
  }

  return "";
}

function loadTelegramSdk() {
  if (window.Telegram?.WebApp) {
    return Promise.resolve(window.Telegram.WebApp);
  }

  if (!telegramSdkPromise) {
    telegramSdkPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(TELEGRAM_SDK_SCRIPT_ID);

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.Telegram?.WebApp), {
          once: true,
        });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Не удалось загрузить Telegram SDK")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.id = TELEGRAM_SDK_SCRIPT_ID;
      script.src = TELEGRAM_SDK_URL;
      script.async = true;
      script.onload = () => resolve(window.Telegram?.WebApp);
      script.onerror = () => reject(new Error("Не удалось загрузить Telegram SDK"));
      document.body.appendChild(script);
    });
  }

  return telegramSdkPromise;
}

export async function getTelegramWebApp() {
  let telegramWebApp = null;

  try {
    telegramWebApp = await loadTelegramSdk();
  } catch (error) {
    if (!isLocalAdminBypassEnabled()) {
      throw error;
    }
  }

  const webApp = telegramWebApp || {};
  const initData = webApp.initData || extractTelegramInitDataFromLocation();

  if (!initData && isLocalAdminBypassEnabled()) {
    return {
      webApp: null,
      initData: "",
      isLocalBypass: true,
    };
  }

  if (!initData) {
    throw new Error("Админка доступна только внутри Telegram WebApp");
  }

  telegramWebApp?.ready?.();
  telegramWebApp?.expand?.();

  return {
    webApp: telegramWebApp || null,
    initData,
    isLocalBypass: false,
  };
}
