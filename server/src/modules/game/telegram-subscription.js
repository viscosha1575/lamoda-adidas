import { HttpError } from "../../lib/http-error.js";

function isSubscribedStatus(status) {
  return Boolean(status) && status !== "left" && status !== "kicked";
}

function isNotSubscribedDescription(description = "") {
  const normalizedDescription = String(description).toLowerCase();

  return normalizedDescription.includes("user not found")
    || normalizedDescription.includes("participant_id invalid")
    || normalizedDescription.includes("member not found");
}

export function createTelegramSubscriptionChecker({
  botToken,
  chatId,
  channelUrl = null,
}) {
  if (!botToken || !chatId) {
    return {
      isConfigured: false,
      channelUrl,
      async checkSubscription() {
        return {
          subscribed: false,
          memberStatus: null,
          channelUrl,
        };
      },
    };
  }

  return {
    isConfigured: true,
    channelUrl,
    async checkSubscription(telegramUserId) {
      const url = new URL(`https://api.telegram.org/bot${botToken}/getChatMember`);
      url.searchParams.set("chat_id", chatId);
      url.searchParams.set("user_id", String(telegramUserId));

      let response;

      try {
        response = await fetch(url);
      } catch {
        throw new HttpError(502, "Telegram subscription check failed");
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        if (isNotSubscribedDescription(payload?.description)) {
          return {
            subscribed: false,
            memberStatus: "left",
            channelUrl,
          };
        }

        throw new HttpError(502, "Telegram subscription check failed", {
          status: response.status,
          description: payload?.description ?? null,
        });
      }

      const memberStatus = payload?.result?.status ?? null;

      return {
        subscribed: isSubscribedStatus(memberStatus),
        memberStatus,
        channelUrl,
      };
    },
  };
}
