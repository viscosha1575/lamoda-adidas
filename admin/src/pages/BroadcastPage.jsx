import { useEffect, useRef, useState } from "react";
import { apiFetch, buildApiUrl, postJson } from "../api";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|ogg)(\?.*)?$/i;
const uploadRegistry = {};

function scopeName(scope) {
  if (scope === "dryrun") return "Тестовая отправка";
  if (scope === "all") return "Всем пользователям";
  if (scope === "only-missing") return "У кого еще нет сообщений";
  if (scope === "not-received") return "Кто не получал эту рассылку";
  if (scope === "many") return "Список ID";
  if (scope === "one") return "Один пользователь";
  if (scope === "all-once") return "All users once";
  if (scope === "excel-external") return "Excel (внешний бот)";
  return scope || "—";
}

function platformName(platform) {
  if (platform === "max") return "MAX";
  return "Telegram";
}

function statusName(status) {
  switch (status) {
    case "queued":
      return "В очереди";
    case "running":
      return "В процессе";
    case "done":
      return "Завершена";
    case "aborted":
      return "Остановлена";
    case "error":
      return "Ошибка";
    default:
      return status || "—";
  }
}

function parseId(value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return "";
  }

  if (/^-?\d+$/.test(normalized)) {
    return String(Math.trunc(Number(normalized)));
  }

  return normalized;
}

function parseIds(rawValue) {
  const normalizedIds = String(rawValue || "")
    .split(/[\s,;]+/g)
    .map(parseId)
    .filter(Boolean);

  return Array.from(new Set(normalizedIds));
}

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ru-RU");
}

function isImageUrl(url) {
  return IMAGE_EXT_RE.test(String(url || ""));
}

function isVideoUrl(url) {
  return VIDEO_EXT_RE.test(String(url || ""));
}

function getHistoryItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.history)) {
    return data.history;
  }

  return [];
}

function getProgressItem(data) {
  if (!data) {
    return null;
  }

  if (data.current) {
    return data.current;
  }

  if (data.progress) {
    return data.progress;
  }

  if (data.item) {
    return data.item;
  }

  if (data.progressId || data.id) {
    return data;
  }

  return null;
}

function buildReportUrl(progressId, reportFile) {
  const params = new URLSearchParams();

  if (progressId) {
    params.set("progressId", progressId);
  }

  if (reportFile) {
    params.set("file", reportFile);
  }

  return buildApiUrl(`/api/broadcasts/report?${params.toString()}`);
}

function readUploadRegistry() {
  return { ...uploadRegistry };
}

function writeUploadRegistry(nextValue) {
  for (const key of Object.keys(uploadRegistry)) {
    delete uploadRegistry[key];
  }

  Object.assign(uploadRegistry, nextValue);
}

function setRegistryIds(key, ids) {
  if (!key) {
    return;
  }

  const registry = readUploadRegistry();
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));

  if (uniqueIds.length) {
    registry[key] = uniqueIds;
  } else {
    delete registry[key];
  }

  writeUploadRegistry(registry);
}

function getRegistryIds(key) {
  if (!key) {
    return [];
  }

  const registry = readUploadRegistry();
  return Array.isArray(registry[key]) ? registry[key] : [];
}

function deleteRegistryKey(key) {
  if (!key) {
    return;
  }

  const registry = readUploadRegistry();
  delete registry[key];
  writeUploadRegistry(registry);
}

function moveRegistryIds(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) {
    return;
  }

  const ids = getRegistryIds(fromKey);

  if (!ids.length) {
    return;
  }

  const nextIds = [...getRegistryIds(toKey), ...ids];
  setRegistryIds(toKey, nextIds);
  deleteRegistryKey(fromKey);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeHrefValue(rawHref) {
  const trimmedHref = String(rawHref || "").trim();

  if (!trimmedHref) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedHref)) {
    return trimmedHref;
  }

  if (trimmedHref.startsWith("//")) {
    return `https:${trimmedHref}`;
  }

  if (trimmedHref.startsWith("www.") || /^[\w.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(trimmedHref)) {
    return `https://${trimmedHref}`;
  }

  return trimmedHref;
}

function looksLikeUrl(value) {
  const normalized = normalizeHrefValue(value);
  return /^(https?:)?\/\//i.test(normalized) || /^[\w.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(normalized);
}

function applyUtmToUrl(rawUrl, utm = {}) {
  const normalized = normalizeHrefValue(rawUrl);

  if (!normalized || !looksLikeUrl(normalized)) {
    return "";
  }

  try {
    const url = new URL(normalized, window.location.origin);

    if (!/^https?:$/.test(url.protocol)) {
      return "";
    }

    const source = String(utm.source || "").trim();
    const medium = String(utm.medium || "").trim();
    const campaign = String(utm.campaign || "").trim();
    const content = String(utm.content || "").trim();
    const term = String(utm.term || "").trim();

    if (source) url.searchParams.set("utm_source", source);
    if (medium) url.searchParams.set("utm_medium", medium);
    if (campaign) url.searchParams.set("utm_campaign", campaign);
    if (content) url.searchParams.set("utm_content", content);
    if (term) url.searchParams.set("utm_term", term);

    return url.toString();
  } catch {
    return "";
  }
}

function toTelegramHtml(input) {
  const tmp = document.createElement("div");
  tmp.innerHTML = input || "";

  function sanitizeHref(href) {
    try {
      const normalizedHref = normalizeHrefValue(href);
      const url = new URL(normalizedHref, window.location.origin);
      return /^https?:$/.test(url.protocol) ? url.toString() : "";
    } catch {
      return "";
    }
  }

  function preserveSpaces(value) {
    return value.replace(/ {2,}/g, (match) => ` ${"&nbsp;".repeat(match.length - 1)}`);
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || "";
      return preserveSpaces(value.replace(/\u00A0/g, "&nbsp;"));
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes).map(walk).join("");

    if (tag === "p" || tag === "div") {
      const content = children.replace(/\n{3,}/g, "\n\n");
      return content ? `${content}\n` : "";
    }

    if (tag === "br") {
      return "\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      return children ? `<b>${children}</b>\n` : "";
    }

    if (tag === "ul") {
      return children;
    }

    if (tag === "ol") {
      let index = 0;
      const lines = [];

      Array.from(element.children).forEach((child) => {
        if (child.tagName.toLowerCase() !== "li") {
          return;
        }

        const line = Array.from(child.childNodes).map(walk).join("");

        if (line.replace(/\s+/g, "").length) {
          index += 1;
          lines.push(`${index}. ${line}`);
        }
      });

      return lines.length ? `${lines.join("\n")}\n` : "";
    }

    if (tag === "li") {
      return children.replace(/\s+/g, "").length ? `• ${children}\n` : "";
    }

    if (tag === "b" || tag === "strong") {
      return `<b>${children}</b>`;
    }

    if (tag === "i" || tag === "em") {
      return `<i>${children}</i>`;
    }

    if (tag === "u" || tag === "ins") {
      return `<u>${children}</u>`;
    }

    if (tag === "s" || tag === "del" || tag === "strike") {
      return `<s>${children}</s>`;
    }

    if (tag === "a") {
      const href = sanitizeHref(element.getAttribute("href") || "#");
      const text = children || escapeHtml(href);

      if (!href) {
        return text;
      }

      return `<a href="${escapeHtmlAttribute(href)}">${text}</a>`;
    }

    if (tag === "code") {
      return `<code>${escapeHtml(element.textContent || "")}</code>`;
    }

    if (tag === "pre") {
      return `<pre>${escapeHtml(element.textContent || "")}</pre>`;
    }

    if (
      tag === "tg-spoiler" ||
      (tag === "span" && element.classList.contains("tg-spoiler"))
    ) {
      return `<span class="tg-spoiler">${children}</span>`;
    }

    if (tag === "blockquote") {
      const text = children
        .split(/\n+/)
        .map((line) => (line ? `> ${line}` : ""))
        .join("\n");

      return text ? `${text}\n` : "";
    }

    return children;
  }

  return Array.from(tmp.childNodes)
    .map(walk)
    .join("")
    .replace(/(\s*\n\s*){3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

function createToolbarButton(label, onClick, title) {
  return (
    <button
      key={label}
      className="editor-tool"
      type="button"
      onClick={onClick}
      title={title}
    >
      {label}
    </button>
  );
}

function HtmlEditor({ value, onChange, placeholder, defaultUtmCampaign = "" }) {
  const textareaRef = useRef(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSelection, setLinkSelection] = useState({ start: 0, end: 0 });
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState("");
  const [useUtm, setUseUtm] = useState(true);
  const [utmSource, setUtmSource] = useState("telegram");
  const [utmMedium, setUtmMedium] = useState("broadcast");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [utmTerm, setUtmTerm] = useState("");

  useEffect(() => {
    if (!linkModalOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        closeLinkModal();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [linkModalOpen]);

  function closeLinkModal() {
    setLinkModalOpen(false);
    setLinkError("");
  }

  function openLinkModal() {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedValue = value.slice(selectionStart, selectionEnd).trim();
    const selectedLooksLikeUrl = looksLikeUrl(selectedValue);
    const nextText = selectedLooksLikeUrl ? "" : selectedValue;
    const nextUrl = selectedLooksLikeUrl ? selectedValue : "https://";

    setLinkSelection({
      start: selectionStart,
      end: selectionEnd,
    });
    setLinkText(nextText);
    setLinkUrl(nextUrl);
    setUtmCampaign(String(defaultUtmCampaign || "").trim());
    setLinkError("");
    setLinkModalOpen(true);
  }

  function replaceSelection(before, after = before, fallback = "текст") {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const selectedText =
      selectionStart === selectionEnd
        ? fallback
        : value.slice(selectionStart, selectionEnd);
    const nextValue =
      value.slice(0, selectionStart) +
      before +
      selectedText +
      after +
      value.slice(selectionEnd);
    const nextCaret = selectionStart + before.length + selectedText.length + after.length;

    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function insertLink() {
    openLinkModal();
  }

  function submitLink() {
    const normalizedLinkText = String(linkText || "").trim();
    const href = applyUtmToUrl(linkUrl, {
      source: useUtm ? utmSource : "",
      medium: useUtm ? utmMedium : "",
      campaign: useUtm ? utmCampaign : "",
      content: useUtm ? utmContent : "",
      term: useUtm ? utmTerm : "",
    });

    if (!href) {
      setLinkError("Укажите корректный URL с протоколом http(s) или доменом.");
      return;
    }

    const normalizedLabelHtml = normalizedLinkText
      ? toTelegramHtml(normalizedLinkText).replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "").trim()
      : "";
    const safeText = normalizedLabelHtml || "Открыть ссылку";
    const safeHref = escapeHtmlAttribute(href);
    const selectionStart = linkSelection.start;
    const selectionEnd = linkSelection.end;
    const nextValue =
      value.slice(0, selectionStart) +
      `<a href="${safeHref}">${safeText}</a>` +
      value.slice(selectionEnd);
    const nextCaret = selectionStart + `<a href="${safeHref}">${safeText}</a>`.length;

    onChange(nextValue);
    closeLinkModal();

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleLinkModalKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitLink();
    }
  }

  const tools = [
    createToolbarButton("B", () => replaceSelection("<b>", "</b>"), "Жирный"),
    createToolbarButton("I", () => replaceSelection("<i>", "</i>"), "Курсив"),
    createToolbarButton("U", () => replaceSelection("<u>", "</u>"), "Подчеркнутый"),
    createToolbarButton("H2", () => replaceSelection("<h2>", "</h2>"), "Заголовок"),
    createToolbarButton("• List", () => replaceSelection("<ul>\n<li>", "</li>\n</ul>"), "Список"),
    createToolbarButton("Link", insertLink, "Ссылка"),
    createToolbarButton(
      "Code",
      () => replaceSelection("<code>", "</code>"),
      "Встроенный код"
    ),
  ];

  return (
    <div className="html-editor">
      <div className="editor-toolbar">{tools}</div>
      <textarea
        ref={textareaRef}
        className="text-area html-editor__input"
        rows={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />

      {linkModalOpen ? (
        <div className="editor-modal-backdrop" onClick={closeLinkModal}>
          <div
            className="editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Вставка ссылки"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="editor-modal__header">
              <h3>Вставка ссылки</h3>
            </div>
            <div className="editor-modal__content">
              <div className="field-group">
                <label className="field-label" htmlFor="link-modal-text">
                  Текст ссылки
                </label>
                <input
                  id="link-modal-text"
                  className="text-input"
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  onKeyDown={handleLinkModalKeyDown}
                  placeholder="Например: Открыть игру"
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="link-modal-url">
                  URL
                </label>
                <input
                  id="link-modal-url"
                  className="text-input"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={handleLinkModalKeyDown}
                  placeholder="https://example.com"
                  required
                />
              </div>

              <label className="toggle-row" htmlFor="link-modal-utm-toggle">
                <input
                  id="link-modal-utm-toggle"
                  type="checkbox"
                  checked={useUtm}
                  onChange={(event) => setUseUtm(event.target.checked)}
                />
                Добавить UTM-метки (в тексте не показываются)
              </label>
              <div className="field-hint">
                Админу в сообщении виден только текст ссылки, метки остаются внутри URL.
              </div>

              {useUtm ? (
                <div className="editor-utm-grid">
                  <input
                    className="text-input"
                    value={utmSource}
                    onChange={(event) => setUtmSource(event.target.value)}
                    onKeyDown={handleLinkModalKeyDown}
                    placeholder="utm_source"
                  />
                  <input
                    className="text-input"
                    value={utmMedium}
                    onChange={(event) => setUtmMedium(event.target.value)}
                    onKeyDown={handleLinkModalKeyDown}
                    placeholder="utm_medium"
                  />
                  <input
                    className="text-input"
                    value={utmCampaign}
                    onChange={(event) => setUtmCampaign(event.target.value)}
                    onKeyDown={handleLinkModalKeyDown}
                    placeholder="utm_campaign"
                  />
                  <input
                    className="text-input"
                    value={utmContent}
                    onChange={(event) => setUtmContent(event.target.value)}
                    onKeyDown={handleLinkModalKeyDown}
                    placeholder="utm_content"
                  />
                  <input
                    className="text-input"
                    value={utmTerm}
                    onChange={(event) => setUtmTerm(event.target.value)}
                    onKeyDown={handleLinkModalKeyDown}
                    placeholder="utm_term"
                  />
                </div>
              ) : null}

              {linkError ? <div className="admin-message error">{linkError}</div> : null}

              <div className="actions-row">
                <button type="button" className="secondary-button" onClick={closeLinkModal}>
                  Отмена
                </button>
                <button type="button" className="primary-button" onClick={submitLink}>
                  Вставить ссылку
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function uploadMediaFile(file) {
  const params = new URLSearchParams({
    filename: file.name,
    contentType: file.type || "application/octet-stream",
  });
  const response = await apiFetch(`/api/uploads/broadcast?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: file,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error?.message || "Не удалось загрузить файл");
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    url: data.url || buildApiUrl(data.relativeUrl),
    kind: data.kind || (file.type.startsWith("video/") ? "video" : "image"),
    serverFileId: data.id,
  };
}

async function deleteUploadedFiles(ids) {
  const filteredIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));

  if (!filteredIds.length) {
    return { deleted: 0 };
  }

  return postJson("/api/uploads/broadcast/delete", {
    ids: filteredIds,
  });
}

async function loadBroadcastHistory() {
  return postJson("/api/broadcasts/history", {});
}

async function loadCurrentBroadcast() {
  return postJson("/api/broadcasts/progress", {});
}

async function createBroadcast(payload) {
  return postJson("/api/broadcasts/create", payload);
}

async function sendOne(payload) {
  return postJson("/api/broadcasts/send-one", payload);
}

async function sendMany(payload) {
  return postJson("/api/broadcasts/send-many", payload);
}

async function abortBroadcast(progressId) {
  return postJson("/api/broadcasts/abort", progressId ? { progressId } : {});
}

async function deleteOneMessage(payload) {
  return postJson("/api/broadcasts/delete-one", payload);
}

async function deleteLastBulk(payload = {}) {
  return postJson("/api/broadcasts/delete-last-bulk", payload);
}

export default function BroadcastPage({ active }) {
  const [platform, setPlatform] = useState("telegram");
  const [mode, setMode] = useState("mass");
  const [sendPlayButton, setSendPlayButton] = useState(false);
  const [oneId, setOneId] = useState("");
  const [manyIds, setManyIds] = useState("");
  const [html, setHtml] = useState("");
  const [previewMode, setPreviewMode] = useState("below");
  const [media, setMedia] = useState([]);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState("");
  const [scope, setScope] = useState("all");
  const [broadcastId, setBroadcastId] = useState("");
  const [batchSize, setBatchSize] = useState(200);
  const [delayMs, setDelayMs] = useState(100);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [lastDryRun, setLastDryRun] = useState(null);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [deleteOneTelegramId, setDeleteOneTelegramId] = useState("");
  const [deleteOneMessageId, setDeleteOneMessageId] = useState("");
  const draftCleanupKey = "draft";

  const completedMedia = media.filter((item) => item.status === "done");
  const mediaUrls = completedMedia.map((item) => item.url);
  const imageUrls = completedMedia
    .filter((item) => item.kind === "image" || isImageUrl(item.url))
    .map((item) => item.url);
  const uploadedServerFileIds = completedMedia
    .map((item) => item.serverFileId)
    .filter(Boolean);

  let preset = { name: "только текст", batch: 250, delay: 100 };

  if (mediaUrls.length === 1) {
    preset = { name: "одно медиа", batch: 150, delay: 150 };
  }

  if (mediaUrls.length > 1) {
    preset = { name: "альбом из нескольких медиа", batch: 90, delay: 220 };
  }

  const hasText = Boolean(html.trim());
  const hasMedia = mediaUrls.length > 0;
  const hasContent = hasText || hasMedia;
  const manyList = parseIds(manyIds);
  const isMassMode = mode === "mass" || mode === "all-once";
  const needsBroadcastId =
    (mode === "mass" && scope === "not-received") || mode === "all-once";
  const validOne = Boolean(parseId(oneId));
  const validMany = manyList.length > 0;
  const isValid =
    hasContent &&
    (mode === "one"
      ? validOne
      : mode === "many"
        ? validMany
        : mode === "all-once"
          ? Boolean(String(broadcastId).trim())
          : !needsBroadcastId || Boolean(String(broadcastId).trim()));

  async function cleanupServerFiles(ids, options = {}) {
    const filteredIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));

    if (!filteredIds.length) {
      return;
    }

    await deleteUploadedFiles(filteredIds);

    if (options.removeFromState !== false) {
      setMedia((current) =>
        current.filter((item) => !filteredIds.includes(item.serverFileId))
      );
    }
  }

  function registerDraftUploads(ids) {
    setRegistryIds(draftCleanupKey, ids);
  }

  function registerProgressUploads(progressId, ids) {
    if (progressId) {
      setRegistryIds(progressId, ids);
      deleteRegistryKey(draftCleanupKey);
      return;
    }

    registerDraftUploads(ids);
  }

  function buildPayloadCommon() {
    const safeHtml = html.trim() ? toTelegramHtml(html) : undefined;

    return {
      platform,
      format: safeHtml ? "html" : "plain",
      text: safeHtml ? undefined : "",
      html: safeHtml,
      linkPreviewUrl: linkPreviewUrl || undefined,
      showPreviewAbove: previewMode === "above",
      disablePreview: previewMode === "off",
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      broadcastId: broadcastId || undefined,
      playButton: sendPlayButton,
    };
  }

  function buildMassPayload(isDryRun) {
    const common = buildPayloadCommon();

    if (mode === "all-once") {
      return {
        ...common,
        platform,
        mode: "all-once",
        scope: "all-once",
        batchSize,
        delayMs,
        dryrun: isDryRun,
        async: true,
        broadcastId: broadcastId || undefined,
      };
    }

    return {
      ...common,
      platform,
      mode: "mass",
      scope,
      broadcastId: scope === "not-received" ? broadcastId || "" : undefined,
      batchSize,
      delayMs,
      dryrun: isDryRun,
      async: true,
    };
  }

  function buildDryRunPayload() {
    const common = buildPayloadCommon();

    if (mode === "one") {
      return {
        ...common,
        platform,
        mode: "one",
        scope: "one",
        telegramId: parseId(oneId),
        dryrun: true,
        async: true,
      };
    }

    if (mode === "many") {
      return {
        ...common,
        platform,
        mode: "many",
        scope: "many",
        telegramIds: parseIds(manyIds),
        dryrun: true,
        async: true,
      };
    }

    return buildMassPayload(true);
  }

  async function refreshProgress() {
    try {
      const data = await loadCurrentBroadcast();
      setProgress(getProgressItem(data));
    } catch {
      setProgress(null);
    }
  }

  async function reloadHistory() {
    try {
      setLoading(true);
      const data = await loadBroadcastHistory();
      setHistory(getHistoryItems(data));
      setError("");
    } catch (loadError) {
      setHistory([]);
      setError(loadError.message || "Не удалось загрузить историю рассылок");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    refreshProgress();
    reloadHistory();

    const timer = window.setInterval(() => {
      refreshProgress();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [active]);

  useEffect(() => {
    registerDraftUploads(uploadedServerFileIds);
  }, [uploadedServerFileIds]);

  useEffect(() => {
    if (!progress?.progressId) {
      return;
    }

    if (getRegistryIds(draftCleanupKey).length) {
      moveRegistryIds(draftCleanupKey, progress.progressId);
    }
  }, [progress?.progressId]);

  useEffect(() => {
    const progressId = progress?.progressId;

    if (!progressId || (!progress.done && !progress.aborted)) {
      return undefined;
    }

    const cleanupIds = getRegistryIds(progressId);

    if (!cleanupIds.length) {
      return undefined;
    }

    let cancelled = false;

    cleanupServerFiles(cleanupIds)
      .then(() => {
        if (!cancelled) {
          deleteRegistryKey(progressId);
        }
      })
      .catch((cleanupError) => {
        if (!cancelled) {
          setError(cleanupError.message || "Не удалось удалить временные файлы");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [progress?.progressId, progress?.done, progress?.aborted]);

  async function handleFilesSelected(event) {
    const selectedFiles = Array.from(event.target.files || []);

    if (!selectedFiles.length) {
      return;
    }

    const remainingSlots = MAX_FILES - media.length;

    if (remainingSlots <= 0) {
      setError(`Можно прикрепить не больше ${MAX_FILES} файлов`);
      event.target.value = "";
      return;
    }

    const files = selectedFiles.slice(0, remainingSlots);
    const tooLargeFile = files.find((file) => file.size > MAX_FILE_SIZE);

    if (tooLargeFile) {
      setError(`Файл ${tooLargeFile.name} превышает лимит 100 МБ`);
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError("");
    setSuccessMessage("");

    const placeholders = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      url: "",
      kind: file.type.startsWith("video/") ? "video" : "image",
      status: "uploading",
    }));

    setMedia((current) => [...current, ...placeholders]);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const placeholder = placeholders[index];

      try {
        const uploaded = await uploadMediaFile(file);

        setMedia((current) =>
          current.map((item) =>
            item.id === placeholder.id
              ? { ...item, ...uploaded, status: "done" }
              : item
          )
        );
      } catch (uploadError) {
        setMedia((current) =>
          current.map((item) =>
            item.id === placeholder.id
              ? {
                  ...item,
                  status: "error",
                  error: uploadError.message || "Не удалось загрузить файл",
                }
              : item
          )
        );
        setError(uploadError.message || "Не удалось загрузить файл");
      }
    }

    setUploading(false);
    event.target.value = "";
  }

  async function removeMedia(id) {
    const itemToRemove = media.find((item) => item.id === id);

    setMedia((current) => current.filter((item) => item.id !== id));

    if (itemToRemove?.serverFileId) {
      try {
        await cleanupServerFiles([itemToRemove.serverFileId], {
          removeFromState: false,
        });
      } catch (cleanupError) {
        setError(cleanupError.message || "Не удалось удалить файл с сервера");
      }
    }
  }

  function applyPreset() {
    setBatchSize(preset.batch);
    setDelayMs(preset.delay);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isValid) {
      return;
    }

    try {
      setSending(true);
      setError("");
      setSuccessMessage("");
      setLastDryRun(null);

      if (mode === "one") {
        await sendOne({
          platform,
          telegramId: parseId(oneId),
          ...buildPayloadCommon(),
        });
        await cleanupServerFiles(uploadedServerFileIds);
        deleteRegistryKey(draftCleanupKey);
        setSuccessMessage("Сообщение отправлено одному пользователю");
      } else if (mode === "many") {
        await sendMany({
          platform,
          telegramIds: parseIds(manyIds),
          ...buildPayloadCommon(),
        });
        await cleanupServerFiles(uploadedServerFileIds);
        deleteRegistryKey(draftCleanupKey);
        setSuccessMessage("Сообщение отправлено выбранному списку пользователей");
      } else {
        const response = await createBroadcast(buildMassPayload(false));
        const nextProgress = getProgressItem(response) || response;
        setProgress(nextProgress);
        registerProgressUploads(nextProgress?.progressId, uploadedServerFileIds);
        setSuccessMessage(
          mode === "all-once"
            ? "Рассылка All users once запущена"
            : "Массовая рассылка запущена"
        );
      }

      await refreshProgress();
      await reloadHistory();
    } catch (submitError) {
      setError(submitError.message || "Не удалось отправить рассылку");
    } finally {
      setSending(false);
    }
  }

  async function runDryRun() {
    if (!hasContent) {
      return;
    }

    try {
      setSending(true);
      setError("");
      setSuccessMessage("");

      const response = await createBroadcast(buildDryRunPayload());
      await cleanupServerFiles(uploadedServerFileIds);
      deleteRegistryKey(draftCleanupKey);
      setLastDryRun(response);
      setSuccessMessage("Тестовая отправка выполнена");
      await refreshProgress();
      await reloadHistory();
    } catch (dryRunError) {
      setError(dryRunError.message || "Не удалось выполнить тестовую отправку");
    } finally {
      setSending(false);
    }
  }

  async function handleAbort(progressId) {
    try {
      setSending(true);
      setError("");
      setSuccessMessage("");
      await abortBroadcast(progressId);
      setSuccessMessage("Рассылка остановлена");
      await refreshProgress();
      await reloadHistory();
    } catch (abortError) {
      setError(abortError.message || "Не удалось остановить рассылку");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteOneMessage() {
    if (!deleteOneTelegramId || !deleteOneMessageId) {
      return;
    }

    try {
      setSending(true);
      setError("");
      setSuccessMessage("");
      await deleteOneMessage({
        platform,
        telegramId: deleteOneTelegramId,
        messageId: Number(deleteOneMessageId),
      });
      setSuccessMessage("Сообщение удалено");
    } catch (deleteError) {
      setError(deleteError.message || "Не удалось удалить сообщение");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteLastBulk() {
    try {
      setSending(true);
      setError("");
      setSuccessMessage("");
      await deleteLastBulk({
        platform,
      });
      setSuccessMessage("Запущено массовое удаление последних сообщений");
    } catch (deleteError) {
      setError(deleteError.message || "Не удалось запустить массовое удаление");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="broadcast-grid">
      <section className="panel-card">
        <header className="panel-card__header">
          <div>
            <span className="panel-card__eyebrow">Рассылка</span>
            <h2>Создание рассылки</h2>
          </div>
        </header>

        <form className="broadcast-form" onSubmit={handleSubmit}>
          <div className="form-row form-row--two">
            <div className="field-group">
              <label className="field-label" htmlFor="broadcast-platform">
                Платформа
              </label>
              <select
                id="broadcast-platform"
                className="text-input"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option value="telegram">Telegram</option>
                <option value="max">MAX</option>
              </select>
              <div className="field-note">
                <strong>Описание:</strong> рассылка будет отправлена только в
                выбранный канал. Тестовая отправка всегда идет в Telegram-админов.
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="field-group">
              <label className="field-label" htmlFor="broadcast-mode">
                Кому отправляем
              </label>
              <select
                id="broadcast-mode"
                className="text-input"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="one">Одному пользователю</option>
                <option value="many">Нескольким (список ID)</option>
                <option value="mass">Массовая рассылка по базе</option>
                <option value="all-once">All users once</option>
              </select>
              <div className="field-note">
                <strong>Описание:</strong> выберите аудиторию: один ID, несколько ID
                или всю базу по правилу «Кому». Сейчас платформа:{" "}
                <strong>{platformName(platform)}</strong>.
              </div>
            </div>
          </div>

          {mode === "one" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="broadcast-one-id">
                {platformName(platform)} ID
              </label>
              <input
                id="broadcast-one-id"
                className="text-input"
                value={oneId}
                onChange={(event) => setOneId(event.target.value)}
                placeholder="Например: 123456789"
              />
              <div className="field-hint">
                Числовой ID пользователя или строковый <code>chatId</code>.
              </div>
            </div>
          ) : null}

          {mode === "many" ? (
            <div className="field-group">
              <label className="field-label" htmlFor="broadcast-many-ids">
                Список {platformName(platform)} ID
              </label>
              <textarea
                id="broadcast-many-ids"
                className="text-area"
                rows={4}
                value={manyIds}
                onChange={(event) => setManyIds(event.target.value)}
                placeholder="Через запятую или с новой строки"
              />
              <div className="field-hint">
                Дубликаты и мусор отбрасываются на клиенте. Пример:{" "}
                <code>123, 456{"\n"}789</code>
              </div>
            </div>
          ) : null}

          {isMassMode ? (
            <>
              {mode === "mass" ? (
                <div className="form-row form-row--two">
                  <div className="field-group">
                    <label className="field-label" htmlFor="broadcast-scope">
                      Кому
                    </label>
                    <select
                      id="broadcast-scope"
                      className="text-input"
                      value={scope}
                      onChange={(event) => setScope(event.target.value)}
                    >
                      <option value="all">Всем пользователям</option>
                      <option value="only-missing">
                        У кого еще нет отправленных сообщений
                      </option>
                      <option value="not-received">
                        Кто еще не получал конкретную рассылку
                      </option>
                    </select>
                    <div className="field-note">
                      <strong>Описание:</strong>
                      <ul className="helper-list">
                        <li>
                          <strong>Всем</strong> — всем, у кого заполнен ID пользователя.
                        </li>
                        <li>
                          <strong>У кого еще нет сообщений</strong> — тем, у кого
                          пока пустой список отправленных сообщений.
                        </li>
                        <li>
                          <strong>Кто не получал рассылку</strong> — тем, у кого нет
                          нужного ID кампании.
                        </li>
                      </ul>
                    </div>
                  </div>

                  {scope === "not-received" ? (
                    <div className="field-group">
                      <label className="field-label" htmlFor="broadcast-id">
                        ID рассылки (broadcastId)
                      </label>
                      <input
                        id="broadcast-id"
                        className="text-input"
                        value={broadcastId}
                        onChange={(event) => setBroadcastId(event.target.value)}
                        placeholder="Например: promo_2026_03"
                      />
                      <div className="field-hint">
                        Используется, чтобы не отправлять повторно тем, кто уже
                        получил эту кампанию.
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === "all-once" ? (
                <div className="form-row form-row--two">
                  <div className="field-group">
                    <label className="field-label" htmlFor="broadcast-all-once-id">
                      ID кампании (broadcastId)
                    </label>
                    <input
                      id="broadcast-all-once-id"
                      className="text-input"
                      value={broadcastId}
                      onChange={(event) => setBroadcastId(event.target.value)}
                      placeholder="Например: all_users_once_2026_03"
                    />
                    <div className="field-hint">
                      Этот ID поможет не отправлять кампанию повторно одним и тем
                      же пользователям.
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="field-group">
                <label className="toggle-row" htmlFor="broadcast-play-button-toggle">
                  <input
                    id="broadcast-play-button-toggle"
                    type="checkbox"
                    checked={sendPlayButton}
                    onChange={(event) => setSendPlayButton(event.target.checked)}
                  />
                  <span>Добавить кнопку «Играть»</span>
                </label>
                <div className="field-note">
                  Если включено, сообщение уйдёт с кнопкой, как в боте.
                </div>
              </div>

              <div className="form-row form-row--two">
                <div className="field-group">
                  <label className="field-label" htmlFor="broadcast-batch-size">
                    Размер пачки
                  </label>
                  <input
                    id="broadcast-batch-size"
                    className="text-input"
                    type="number"
                    min="1"
                    max="1000"
                    value={batchSize}
                    onChange={(event) => setBatchSize(Number(event.target.value) || 1)}
                  />
                  <div className="field-note">
                    <strong>Описание:</strong> сколько пользователей обрабатываем за
                    один шаг. Больше — быстрее, но выше риск лимитов Telegram.
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="broadcast-delay">
                    Задержка между пачками (мс)
                  </label>
                  <input
                    id="broadcast-delay"
                    className="text-input"
                    type="number"
                    min="0"
                    max="10000"
                    step="50"
                    value={delayMs}
                    onChange={(event) => setDelayMs(Number(event.target.value) || 0)}
                  />
                  <div className="field-note">
                    <strong>Описание:</strong> пауза между пачками. Больше —
                    надёжнее, но медленнее общая рассылка.
                  </div>
                </div>

                <div className="tips-grid">
                  <div className="tip-card">
                    <div className="tip-card__title">
                      Рекомендуемые настройки (по медиа)
                    </div>
                    <div className="tip-card__body">
                      <div className="field-hint">
                        Обнаружено: <strong>{preset.name}</strong>.
                      </div>
                      <button
                        type="button"
                        className="secondary-button secondary-button--small"
                        onClick={applyPreset}
                      >
                        Применить рекомендованные значения
                      </button>
                      <ul className="helper-list helper-list--compact">
                        <li>
                          Пачка: <strong>{preset.batch}</strong>
                        </li>
                        <li>
                          Задержка: <strong>{preset.delay} мс</strong>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="tip-card">
                    <div className="tip-card__title">Кратко про лимиты Telegram</div>
                    <div className="tip-card__body">
                      <ul className="helper-list helper-list--compact">
                        <li>Альбом — до 10 медиа (фото или видео).</li>
                        <li>
                          Медиа отправляются дольше текста, поэтому задержку лучше
                          держать чуть выше.
                        </li>
                        <li>
                          При отправке медиагруппы ссылочное превью обычно не
                          показывается.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          <div className="field-group">
            <label className="field-label">Текст сообщения</label>
            <HtmlEditor
              value={html}
              onChange={setHtml}
              placeholder="Наберите текст, добавляйте ссылки, списки и заголовки..."
              defaultUtmCampaign={broadcastId}
            />
            <div className="field-hint">
              Поддерживается HTML-разметка, которую страница приводит к безопасному
              для Telegram виду.
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="broadcast-media">
              Медиа (фото / видео)
            </label>
            <label className="upload-dropzone" htmlFor="broadcast-media">
              <input
                id="broadcast-media"
                className="visually-hidden"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFilesSelected}
              />
              <span className="upload-dropzone__title">
                Выберите до {MAX_FILES} файлов
              </span>
              <span className="upload-dropzone__hint">
                Файлы временно загружаются на сервер и будут удалены после рассылки
              </span>
            </label>
            <div className="field-hint">
              Можно прикрепить до 10 изображений или видео. Максимальный размер
              файла — 100 МБ.
            </div>

            {media.length ? (
              <div className="media-grid">
                {media.map((item) => (
                  <div className="media-card" key={item.id}>
                    <div className="media-card__preview">
                      {item.status === "done" && (item.kind === "image" || isImageUrl(item.url)) ? (
                        <img src={item.url} alt={item.name} />
                      ) : null}
                      {item.status === "done" && (item.kind === "video" || isVideoUrl(item.url)) ? (
                        <video src={item.url} muted playsInline controls />
                      ) : null}
                      {item.status !== "done" ? (
                        <div className="media-card__placeholder">
                          {item.status === "uploading" ? "Загрузка..." : "Ошибка"}
                        </div>
                      ) : null}
                    </div>
                    <div className="media-card__meta">
                      <span className="media-card__name">{item.name}</span>
                      <span className="media-card__status">
                        {item.status === "done"
                          ? "Готово"
                          : item.status === "uploading"
                            ? "Загружается"
                            : item.error || "Ошибка"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button secondary-button--small"
                      onClick={() => removeMedia(item.id)}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="form-row form-row--two">
            <div className="field-group">
              <label className="field-label" htmlFor="broadcast-link-preview">
                URL для ссылочного превью
              </label>
              <input
                id="broadcast-link-preview"
                className="text-input"
                value={linkPreviewUrl}
                onChange={(event) => setLinkPreviewUrl(event.target.value)}
                placeholder="https://пример-сайта.ru"
              />
              <div className="field-hint">
                Telegram попробует показать карточку сайта. При наличии альбома
                превью может не отображаться.
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Отображение ссылочного превью</label>
              <div className="radio-group">
                <label className="radio-pill">
                  <input
                    type="radio"
                    checked={previewMode === "below"}
                    onChange={() => setPreviewMode("below")}
                  />
                  <span>Под текстом</span>
                </label>
                <label className="radio-pill">
                  <input
                    type="radio"
                    checked={previewMode === "above"}
                    onChange={() => setPreviewMode("above")}
                  />
                  <span>Над текстом</span>
                </label>
                <label className="radio-pill">
                  <input
                    type="radio"
                    checked={previewMode === "off"}
                    onChange={() => setPreviewMode("off")}
                  />
                  <span>Отключить</span>
                </label>
              </div>
              <div className="field-note">
                <strong>Описание:</strong> управляет позицией карточки сайта. Если
                превью отключено, Telegram его не покажет.
              </div>
            </div>
          </div>

          <div className="actions-row">
            <button
              className="secondary-button"
              type="button"
              onClick={runDryRun}
              disabled={sending || uploading || !hasContent}
            >
              Тестовая отправка (dry-run) админам
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={sending || uploading || !isValid}
            >
              {mode === "mass"
                ? "Запустить массовую рассылку"
                : mode === "all-once"
                  ? "Запустить All users once"
                  : mode === "one"
                    ? "Отправить одному пользователю"
                    : "Отправить нескольким"}
            </button>

            {progress?.progressId && !progress.done && !progress.aborted ? (
              <button
                className="danger-button"
                type="button"
                disabled={sending}
                onClick={() => handleAbort(progress.progressId)}
              >
                Остановить рассылку
              </button>
            ) : null}
          </div>

          <div className="field-note">
            <strong>Совет:</strong> перед массовой рассылкой сделайте тестовую
            отправку, чтобы посмотреть, как сообщение выглядит у администраторов.
          </div>

          {error ? <div className="admin-message error">{error}</div> : null}
          {successMessage ? (
            <div className="admin-message success">{successMessage}</div>
          ) : null}
          {uploading ? (
            <div className="admin-message">
              Загружаем медиафайлы на сервер...
            </div>
          ) : null}

          {lastDryRun ? (
            <div className="admin-message success">
              <div>
                <strong>Тестовая отправка:</strong> сообщения отправлены
                администраторам (
                {lastDryRun.toAdmins ?? lastDryRun.results?.length ?? 0})
              </div>
              <details className="json-details">
                <summary>Показать технические детали</summary>
                <pre>{JSON.stringify(lastDryRun, null, 2)}</pre>
              </details>
            </div>
          ) : null}
        </form>
      </section>

      <section className="panel-card">
        <header className="panel-card__header panel-card__header--split">
          <div>
            <span className="panel-card__eyebrow">Мониторинг</span>
            <h2>Текущая рассылка</h2>
          </div>
          {progress?.progressId ? (
            <span className="panel-card__meta">ID: {progress.progressId}</span>
          ) : null}
        </header>

        {progress ? (
          <div className="progress-card">
            <div className="progress-card__head">
              <span>
                Аудитория: {platformName(progress.platform)} • {scopeName(progress.scope)}
              </span>
              <span>{progress.progressPct ?? 0}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar__fill"
                style={{ width: `${progress.progressPct || 0}%` }}
              />
            </div>

            <div className="stats-grid">
              <div>
                <strong>Всего</strong> {progress.total ?? "—"}
              </div>
              <div>
                <strong>Отправлено</strong> {progress.sent ?? 0}
              </div>
              <div>
                <strong>Ошибок</strong> {progress.failed ?? 0}
              </div>
              <div>
                <strong>Пропущено навсегда</strong> {progress.skippedPermanent ?? 0}
              </div>
              {progress.etaSec !== null && progress.etaSec !== undefined ? (
                <div>
                  <strong>Осталось примерно</strong> ~{progress.etaSec} с
                </div>
              ) : null}
            </div>

            <div className="progress-card__meta-text">
              старт: {formatTimestamp(progress.startedAt)}, обновлено:{" "}
              {formatTimestamp(progress.updatedAt)}
              {progress.finishedAt ? (
                <> , завершено: {formatTimestamp(progress.finishedAt)}</>
              ) : null}
            </div>

            {progress.error ? (
              <div className="admin-message error">{progress.error}</div>
            ) : null}

            {progress.done ? (
              <div className="admin-message success">
                Статус: {progress.aborted ? "остановлена" : "завершена"}
              </div>
            ) : null}

            {progress.done && !progress.aborted && progress.reportFile ? (
              <div className="actions-row">
                <a
                  href={buildReportUrl(progress.progressId, progress.reportFile)}
                  className="secondary-button"
                  target="_blank"
                  rel="noreferrer"
                >
                  Скачать отчёт (Excel)
                </a>
              </div>
            ) : null}

            {progress.preview ? (
              <div className="preview-box">
                <div className="preview-box__title">
                  Предпросмотр сообщения (с сервера)
                </div>
                <div
                  className="preview-box__content"
                  dangerouslySetInnerHTML={{ __html: progress.preview }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="admin-state">Нет активной рассылки</div>
        )}

        <div className="section-divider" />

        <header className="panel-card__header panel-card__header--split">
          <div>
            <span className="panel-card__eyebrow">Журнал</span>
            <h3>История рассылок</h3>
          </div>
          <button
            className="secondary-button secondary-button--small"
            type="button"
            onClick={reloadHistory}
            disabled={loading}
          >
            Обновить
          </button>
        </header>

        {history.length ? (
          <div className="history-list">
            {history.map((item) => (
              <article
                className="history-card"
                data-status={item.status}
                key={item.id || item.progressId}
              >
                <div className="history-card__head">
                  <div className="history-card__id">
                    {item.title || "Рассылка"} • {item.id || item.progressId}
                  </div>
                  <div className="history-card__status">
                    {statusName(item.status)}
                  </div>
                </div>

                <div className="history-card__meta">
                  {platformName(item.platform)} • {scopeName(item.scope)} •{" "}
                  {formatTimestamp(item.startedAt)} →{" "}
                  {item.finishedAt ? formatTimestamp(item.finishedAt) : "в процессе"}
                </div>

                {item.stats ? (
                  <div className="history-card__meta">
                    всего: {item.stats.total ?? "—"}, отправлено: {item.stats.sent ?? 0},
                    ошибок: {item.stats.failed ?? 0}, навсегда пропущено:{" "}
                    {item.stats.skippedPermanent ?? 0}
                  </div>
                ) : null}

                {item.messagePreview ? (
                  <details className="json-details">
                    <summary>Показать предпросмотр</summary>
                    <div
                      className="preview-box__content preview-box__content--history"
                      dangerouslySetInnerHTML={{ __html: item.messagePreview }}
                    />
                  </details>
                ) : null}

                <div className="actions-row">
                  {item.status === "done" && item.reportFile ? (
                    <a
                      href={buildReportUrl(item.id || item.progressId, item.reportFile)}
                      className="secondary-button secondary-button--small"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Скачать отчёт (Excel)
                    </a>
                  ) : null}

                  {item.status !== "done" && item.status !== "aborted" ? (
                    <button
                      className="danger-button danger-button--small"
                      type="button"
                      onClick={() => handleAbort(item.id || item.progressId)}
                    >
                      Остановить
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-state">История пока пустая</div>
        )}

        <div className="section-divider" />

        <header className="panel-card__header">
          <div>
            <span className="panel-card__eyebrow">Инструменты</span>
            <h3>Сервисные операции</h3>
          </div>
        </header>

        <div className="form-row form-row--two">
          <div className="field-group">
            <label className="field-label">Удалить одно сообщение</label>
            <div className="form-row form-row--two form-row--tight">
              <input
                className="text-input"
                value={deleteOneTelegramId}
                onChange={(event) => setDeleteOneTelegramId(event.target.value)}
                placeholder={`${platformName(platform)} ID`}
              />
              <input
                className="text-input"
                type="number"
                value={deleteOneMessageId}
                onChange={(event) => setDeleteOneMessageId(event.target.value)}
                placeholder="messageId"
              />
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={sending}
              onClick={handleDeleteOneMessage}
            >
              Удалить сообщение
            </button>
            <div className="field-hint">
              Удаляет сообщение в чате и убирает его ID из базы.
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Массовое удаление</label>
            <button
              className="danger-button"
              type="button"
              disabled={sending}
              onClick={handleDeleteLastBulk}
            >
              Удалить последнее сообщение у всех
            </button>
            <div className="field-hint">
              Возьмёт последний сохранённый <code>messageId</code> у каждого
              пользователя и попытается его удалить.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
