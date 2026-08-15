import { parseCareer, serializeCareer } from './career.js';

const CAREER_URL = '/api/kv/career';

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
