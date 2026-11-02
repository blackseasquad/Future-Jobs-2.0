// Достъп до /api/* с кеш в паметта и React hook. Данните се обновяват на сървъра (06:00), не от браузъра.
import { useCallback, useEffect, useState } from 'react';

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Грешка ${res.status}`);
  return body;
}

const cache = new Map();
export function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
export const invalidate = (key) => (key ? cache.delete(key) : cache.clear());

/** Зарежда данни веднъж (с кеш по ключ). `key = null` – не зарежда. */
export function useApi(key, path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(key) });
  const load = useCallback(() => {
    if (!key) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    cached(key, () => api(path)).then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [key, path]);
  useEffect(() => load(), [load]);
  const reload = useCallback(() => { invalidate(key); load(); }, [key, load]);
  return { ...state, reload };
}
