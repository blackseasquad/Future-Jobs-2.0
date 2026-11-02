// Минимален hash router (#/път) – работи със статичен хостинг без допълнителни настройки.
import { useEffect, useState } from 'react';

const ROUTES = [
  [/^#?\/?$/, 'home'],
  [/^#\/occupations(?:\/(future|changing))?$/, 'occupations'],
  [/^#\/occupation\/([a-z0-9_]+)$/, 'occupation'],
  [/^#\/future\/([a-z0-9_]+)$/, 'future'],
  [/^#\/skills$/, 'skills'],
  [/^#\/skill\/([a-z0-9_]+)$/, 'skill'],
  [/^#\/quiz$/, 'quiz'],
  [/^#\/data$/, 'data'],
];
const NAV = { home: 'home', occupations: 'occupations', occupation: 'occupations', future: 'occupations', skills: 'skills', skill: 'skills', quiz: 'quiz', data: 'data' };

export function parseHash(hash) {
  for (const [re, name] of ROUTES) {
    const m = (hash || '#/').match(re);
    if (m) return { name, param: m[1] || null, nav: NAV[name] };
  }
  return { name: 'home', param: null, nav: 'home' };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => { setRoute(parseHash(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
