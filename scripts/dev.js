// Локален сървър за визуален преглед; приема --port, подаден от средата.
import { createApp } from '../src/server.js';
import { getConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
const portArg = process.argv.indexOf('--port');
const config = getConfig();
if (portArg !== -1 && process.argv[portArg + 1]) config.port = Number(process.argv[portArg + 1]);
createApp({ db: openDb(config.databasePath), config }).listen(config.port, '0.0.0.0', () => console.log(`Посока: http://localhost:${config.port}`));
