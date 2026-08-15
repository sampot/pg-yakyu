import { parseCareer, serializeCareer } from './career.js';

const CAREER_URL = '/api/kv/career';
const SETTINGS_URL = '/api/kv/settings';

export async function loadCareer(fetcher = fetch) {
  const response = await fetcher(CAREER_URL);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('讀取生涯失敗');
  const raw = await response.text();
  if (!raw) return null;
  return parseCareer(raw);
}

export async function saveCareer(career, fetcher = fetch) {
  const response = await fetcher(CAREER_URL, {
    method: 'PUT',
    body: serializeCareer(career),
  });
  if (!response.ok) throw new Error('儲存生涯失敗');
}

export async function deleteCareer(fetcher = fetch) {
  const response = await fetcher(CAREER_URL, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('刪除生涯失敗');
}

export async function loadSettings(fetcher = fetch) {
  const response = await fetcher(SETTINGS_URL);
  if (response.status === 404) return { muted: false };
  if (!response.ok) throw new Error('讀取設定失敗');
  const raw = await response.text();
  if (!raw) return { muted: false };
  const parsed = JSON.parse(raw);
  return { muted: Boolean(parsed?.muted) };
}

export async function saveSettings(settings, fetcher = fetch) {
  const response = await fetcher(SETTINGS_URL, {
    method: 'PUT',
    body: JSON.stringify({ muted: Boolean(settings.muted) }),
  });
  if (!response.ok) throw new Error('儲存設定失敗');
}
