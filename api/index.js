// Vercel Function: всички заявки към /api/* се пренасочват тук (виж vercel.json).
// Статичните файлове от public/ се сервират директно от CDN на Vercel.
import { getConfig } from '../src/config.js';
import { createHandler, createProvider } from '../src/server.js';

let handlerPromise = null;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const config = getConfig();
      const provider = await createProvider(config);
      return createHandler({ provider, config });
    })().catch((err) => { handlerPromise = null; throw err; });
  }
  return handlerPromise;
}

export default async function handler(req, res) {
  try {
    const h = await getHandler();
    await h(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Сървърът не можа да стартира. Провери настройките (Vercel Blob, env променливи).' }));
    }
  }
}
