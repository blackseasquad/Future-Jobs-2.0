// Създава снимка на ESCO данните за каталога (src/catalog/esco-snapshot.js).
// Нужна е, когато ESCO API отказва достъп от облачния сървър (напр. HTTP 403 във Vercel).
// Пусни я от компютър/среда, от която ESCO API работи:
//   npm run esco:snapshot
// После commit + push – Vercel ще направи нов deploy и импортът ще ползва снимката.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.js';
import { fetchJson } from '../src/lib/http.js';
import { ESCO_TARGETS, fetchEscoConcept } from '../src/sources/esco.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const concepts = [];
const failed = [];
for (const [i, t] of ESCO_TARGETS.entries()) {
  try {
    const n = await fetchEscoConcept(fetchJson, t, 20000);
    if (n) { concepts.push(n); console.log(`✅ ${i + 1}/${ESCO_TARGETS.length} ${t.type} ${t.localId} → ${n.labelBg}`); }
    else { failed.push(t.localId); console.log(`⚠️  ${t.type} ${t.localId}: няма резултат за „${t.query}“`); }
  } catch (err) {
    failed.push(t.localId);
    console.log(`❌ ${t.type} ${t.localId}: ${err.message}`);
    if (err.status === 403 && concepts.length === 0) {
      console.error('\nESCO API отказва достъп и от тази среда. Опитай от друг компютър/мрежа.');
      process.exit(1);
    }
  }
  await sleep(300);
}
if (!concepts.length) { console.error('Няма изтеглени понятия – снимката не е записана.'); process.exit(1); }
const snapshot = { createdAt: new Date().toISOString(), source: 'https://ec.europa.eu/esco/api', concepts };
const file = path.join(ROOT, 'src', 'catalog', 'esco-snapshot.js');
fs.writeFileSync(file, `// Снимка на ESCO данните за каталога на Future Jobs.
// Използва се само ако ESCO API откаже достъп от сървъра (напр. Vercel).
// Генерирано автоматично от scripts/esco-snapshot.js на ${snapshot.createdAt}. Не редактирай ръчно.
export default ${JSON.stringify(snapshot, null, 1)};
`);
console.log(`\nЗаписани ${concepts.length} понятия в ${path.relative(ROOT, file)}${failed.length ? ` (неуспешни: ${failed.join(', ')})` : ''}.`);
