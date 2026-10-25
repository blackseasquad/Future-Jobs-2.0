// CLI за ежедневния импорт – стартира се от системния планировчик (cron/systemd).
//   node scripts/refresh.js --scheduled   # идемпотентно: веднъж успешно на ден
//   node scripts/refresh.js --force       # принудително (напр. ръчно)
//   node scripts/refresh.js --sources=eurostat,esco
import { getConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { runRefresh, AlreadyRunningError } from '../src/pipeline.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];

const config = getConfig();
const db = openDb(config.databasePath);
try {
  const result = await runRefresh(db, {
    config,
    trigger: flag('scheduled') ? 'scheduled' : 'cli',
    force: flag('force'),
    onlyInSofiaHour: flag('sofia-window') ? config.scheduledHour : null,
    sources: opt('sources')?.split(','),
  });
  console.log(JSON.stringify({ status: result.status, runId: result.runId, message: result.message || result.reason }, null, 2));
  process.exitCode = result.status === 'failed' ? 1 : 0;
} catch (err) {
  console.error(err instanceof AlreadyRunningError ? err.message : err);
  process.exitCode = err instanceof AlreadyRunningError ? 0 : 1;
} finally {
  db.close();
}
