# Future Jobs

Приложение за бъдещо кариерно развитие (проект за [EduHack.bg](https://www.eduhack.bg)).
Всеки ден в **06:00 ч. (Europe/Sofia)** събира реални данни за пазара на труда, изчислява показатели за 28 умения
и дава персонализирани препоръки в три хоризонта: **6–12 месеца**, **2–5 години** и **5–10 години**.

* Каталог с 20 бъдещи професии: перспектива, заплащане (Eurostat) и свързани умения (ESCO)
* Анкета с 8 въпроса за интересите → 3 подходящи професии + план за уменията
* Изпращане на резултатите по имейл (SMTP)
* Страница „Данни“: последна актуализация, статус на източниците, история на обновяванията, индикация за остарели данни, ръчно обновяване за администратор
* Методология: [public/METHODOLOGY.md](public/METHODOLOGY.md)

## Изисквания

* **Node.js ≥ 22.13** (използва вградените `node:sqlite`, `fetch` и `node:test`). Единствената зависимост, `@vercel/blob`, е нужна само на Vercel.
* По избор за type checking: `npm install` (TypeScript и @types/node като devDependencies)

## Стартиране

```bash
cp .env.example .env          # попълни CRON_SECRET и ADMIN_TOKEN (поне 32 символа)
npm run check-sources         # проверява реалната наличност на API-тата
npm run refresh -- --force    # първи импорт (няколко минути заради паузите към ESCO)
npm start                     # http://localhost:3000
```

## Качване във Vercel (препоръчително)

Проектът е готов за Vercel без допълнителни промени в кода:

1. Качи папката в GitHub репо и в Vercel избери **Add New → Project → Import** това репо. Framework Preset: **Other** (настройките идват от `vercel.json`).
2. В проекта отвори **Storage → Create → Blob**, избери достъп **Private** и го свържи към проекта (Vercel добавя `BLOB_STORE_ID` автоматично).
3. В **Settings → Environment Variables** добави:
   * `CRON_SECRET` – случаен низ (≥ 32 символа). Vercel го праща автоматично при всяко cron извикване.
   * `ADMIN_TOKEN` – друг случаен низ (за бутона „Обнови сега“).
   * по избор: `SMTP_*`, `MAIL_FROM`, `ADZUNA_*`, `ANTHROPIC_API_KEY`.
4. **Deploy.** След това отвори `/#/data`, въведи `ADMIN_TOKEN` и натисни „Обнови сега“ за първия импорт (до ~2 мин.).

Как работи на Vercel:

| | |
|---|---|
| Frontend | `public/` се сервира статично от CDN |
| API | `api/index.js` – една Vercel Function за всички `/api/*` (`maxDuration: 300`) |
| База | SQLite файл, пазен като **private** файл във Vercel Blob. Всяка инстанция го изтегля в `/tmp` и проверява за нова версия веднъж на минута. Само импортът записва – с условно качване (ETag), така два паралелни импорта не се презаписват. Vercel сам не поддържа SQLite с постоянен файл – затова е този механизъм. |
| Ежедневен импорт | **Vercel Cron** (`vercel.json`): `/api/cron/daily` в 03:00 и 04:00 UTC; сървърът изпълнява импорта само когато в София е 06:xx ч. (така работи и при лятно, и при зимно време). На Hobby план Vercel пуска задачата в произволна минута на зададения час – затова в София е между 06:00 и 06:59. |
| Времеви лимит | Импортът има бюджет 240 s (`REFRESH_BUDGET_MS`). Източник, който не може да започне навреме, се пропуска и се опитва на следващия ден; ESCO се обновява на части. |

**ESCO връща HTTP 403 във Vercel?** Защитната стена на ec.europa.eu понякога отказва заявки от облачни сървъри.
Тогава импортът спира заявките към ESCO след първия отказ и използва запазена снимка (`src/catalog/esco-snapshot.js`).
Снимката се създава от GitHub: **Actions → „ESCO snapshot“ → Run workflow** (записва файла в репото и Vercel прави нов deploy),
или от собствения компютър с `npm run esco:snapshot` и commit/push. Обновява се автоматично веднъж месечно.

Ограничения на Vercel режима: имейл логът се пише само в логовете на Vercel (не в базата); ако Blob store не е свързан, приложението работи, но базата е временна – страницата „Данни“ показва предупреждение. GitHub Actions workflow-ът не е нужен на Vercel.

## Ежедневно обновяване в 06:00 Europe/Sofia

Обновяването се изпълнява **на сървъра**, независимо дали някой е отворил приложението. Избери един вариант:

| Вариант | Файл | Кога |
|---|---|---|
| A. cron | `deploy/crontab.example` (`CRON_TZ=Europe/Sofia`) | VPS / Linux сървър |
| B. systemd timer | `deploy/future-jobs-refresh.{service,timer}` (`OnCalendar=… 06:00:00 Europe/Sofia`, `Persistent=true`) | VPS с systemd |
| C. GitHub Actions | `.github/workflows/daily-refresh.yml` → `POST /api/cron/refresh` с `Authorization: Bearer $CRON_SECRET` | хостинг без cron (Render, Railway и др.) |

Свойства на импорта (`src/pipeline.js`):
* извличане → валидиране → нормализиране (синоними на умения EN/DE/BG → един id) → дедупликация → запис с история;
* всеки източник се записва в отделна транзакция – при грешка старите данни остават; ако всички живи източници паднат, показателите **не** се преизчисляват;
* идемпотентно: планираното изпълнение се прави най-много веднъж успешно на ден; повторното изпълнение не дублира записи;
* заключване срещу паралелни изпълнения; всяко изпълнение и всяка грешка се записват (`refresh_runs`, `source_runs`, `source_state`);
* ревизиите на официални стойности се пазят в `stat_revisions`; времето на последния успешен импорт – в `app_meta`.

## API

| Метод | Път | Описание |
|---|---|---|
| GET | `/api/status` | последна актуализация, остарели ли са данните, статус на източниците, история |
| GET | `/api/skills`, `/api/skills/:id` | показатели и история на уменията |
| GET | `/api/occupations`, `/api/occupations/:id` | професии, перспектива, заплати, заетост |
| GET | `/api/market` | свободни работни места (Eurostat), WEF, Cedefop |
| GET | `/api/quiz` · POST `/api/recommendations` | анкета и препоръки |
| POST | `/api/email` | изпраща резултатите (нужно е съгласие; адресът не се пази – само SHA-256 хеш в лога) |
| POST | `/api/cron/refresh` | **защитен** с `CRON_SECRET` (`?wait=1`, `?window=sofia`) |
| POST | `/api/admin/refresh` | **защитен** с хедър `X-Admin-Token` |

## Тестове

```bash
npm test          # 32 теста: импорт, дедупликация, ревизии, недостъпен източник, заключване, защита на endpoint-ите, модел, AI валидация, SMTP, Vercel Blob и Vercel Cron
npm run typecheck # tsc --checkJs
```

## Структура

```
api/index.js             входна точка за Vercel Function
src/server.js            HTTP сървър и API
src/storage.js           хранилище на базата: локален файл или Vercel Blob
src/pipeline.js          ежедневният импорт
src/sources/             адаптери: eurostat, esco, jobboards (Arbeitnow, Remotive), adzuna, published (Cedefop, WEF)
src/model/scoring.js     модел за стойността на уменията
src/model/recommend.js   персонализирани препоръки
src/catalog/             умения, професии, анкета, публикувани прогнози
src/ai.js, src/email.js  AI обяснения (по избор) и SMTP
public/                  frontend (HTML/CSS/JS без библиотеки)
deploy/, .github/        планиране на ежедневната задача
```
