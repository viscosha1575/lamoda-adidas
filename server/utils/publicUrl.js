/**
 * Публичный URL сайта (без завершающего слэша).
 * Используется для отдачи полных адресов картинок концертов.
 */
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://visarun-srb.online').replace(/\/+$/, '');

/**
 * Превращает относительный путь картинки в полный URL.
 * Если url уже полный (http/https) — возвращает как есть.
 */
export function toFullImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const u = url.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${PUBLIC_URL}${u}`;
  return `${PUBLIC_URL}/${u}`;
}

/**
 * Преобразует объект концерта (или массив концертов): images[].url → полный URL.
 */
export function withFullImageUrls(concertOrList) {
  const mapOne = (doc) => {
    if (!doc) return doc;
    const out = { ...doc };
    if (Array.isArray(out.images)) {
      out.images = out.images.map((img) => ({
        ...img,
        url: toFullImageUrl(img?.url) ?? img?.url,
      }));
    }
    return out;
  };
  if (Array.isArray(concertOrList)) {
    return concertOrList.map(mapOne);
  }
  return mapOne(concertOrList);
}
