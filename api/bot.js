import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const CHANNEL_USERNAME =
  process.env.CHANNEL_USERNAME || "@vakhtovyk";

const TELEGRAM_API =
  `https://api.telegram.org/bot${BOT_TOKEN}`;

// =====================================================
// TELEGRAM
// =====================================================

async function tg(method, data = {}) {
  const response = await fetch(
    `${TELEGRAM_API}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  return response.json();
}

async function sendMessage(
  chatId,
  text,
  keyboard = null
) {
  const data = {
    chat_id: chatId,
    text,
  };

  if (keyboard) {
    data.reply_markup = {
      keyboard,
      resize_keyboard: true,
    };
  }

  return tg("sendMessage", data);
}

// =====================================================
// DATABASE
// =====================================================

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id TEXT PRIMARY KEY,
      step INTEGER NOT NULL DEFAULT 0,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      application_vacancy_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE bot_sessions
    ADD COLUMN IF NOT EXISTS application_vacancy_id BIGINT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id BIGSERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      profession TEXT NOT NULL,
      experience TEXT NOT NULL,
      city TEXT NOT NULL,
      shift TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS vacancies (
      id BIGSERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      profession TEXT NOT NULL,
      location TEXT NOT NULL,
      experience TEXT NOT NULL,
      payment TEXT,
      conditions TEXT,
      shift TEXT,
      phone TEXT,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      published_at TIMESTAMPTZ,
      closed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS payment TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS conditions TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS shift TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS phone TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT FALSE
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id BIGSERIAL PRIMARY KEY,
      vacancy_id BIGINT NOT NULL,
      candidate_chat_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      experience TEXT NOT NULL,
      telegram_username TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
  `;
}

// =====================================================
// SESSION
// =====================================================

async function getSession(chatId) {
  const rows = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${String(chatId)}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function setSession(chatId, data) {
  const existing = await getSession(chatId);

  if (!existing) {
    await sql`
      INSERT INTO bot_sessions (
        chat_id,
        step,
        name,
        phone,
        profession,
        experience,
        city,
        shift,
        application_vacancy_id
      )
      VALUES (
        ${String(chatId)},
        ${data.step || 0},
        ${data.name || null},
        ${data.phone || null},
        ${data.profession || null},
        ${data.experience || null},
        ${data.city || null},
        ${data.shift || null},
        ${data.application_vacancy_id || null}
      )
    `;

    return;
  }

  await sql`
    UPDATE bot_sessions
    SET
      step = ${
        data.step !== undefined
          ? data.step
          : existing.step
      },

      name = ${
        data.name !== undefined
          ? data.name
          : existing.name
      },

      phone = ${
        data.phone !== undefined
          ? data.phone
          : existing.phone
      },

      profession = ${
        data.profession !== undefined
          ? data.profession
          : existing.profession
      },

      experience = ${
        data.experience !== undefined
          ? data.experience
          : existing.experience
      },

      city = ${
        data.city !== undefined
          ? data.city
          : existing.city
      },

      shift = ${
        data.shift !== undefined
          ? data.shift
          : existing.shift
      },

      application_vacancy_id = ${
        data.application_vacancy_id !== undefined
          ? data.application_vacancy_id
          : existing.application_vacancy_id
      }

    WHERE chat_id = ${String(chatId)}
  `;
}

async function clearSession(chatId) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${String(chatId)}
  `;
}

// =====================================================
// KEYBOARDS
// =====================================================

const mainKeyboard = [
  ["👷 Я ищу работу"],
  ["📋 Разместить вакансию"],
  ["🏢 Я работодатель"],
  ["📞 Связаться с администратором"],
];

const employerKeyboard = [
  ["➕ Создать вакансию"],
  ["📋 Мои вакансии"],
  ["📩 Отклики на мои вакансии"],
  ["🏠 Главное меню"],
];

const adminKeyboard = [
  ["👷 Все анкеты", "🔎 Найти специалиста"],
  ["📋 Все вакансии"],
  ["📩 Все отклики"],
  ["📢 Опубликовать вакансию"],
  ["📊 Статистика"],
  ["🏠 Главное меню"],
];

// =====================================================
// MENUS
// =====================================================

async function showMainMenu(chatId) {
  await sendMessage(
    chatId,
    `🏗️ РАБОТА | ВАХТА

Выберите нужный раздел:`,
    mainKeyboard
  );
}

async function showEmployerCabinet(chatId) {
  await sendMessage(
    chatId,
    `🏢 КАБИНЕТ РАБОТОДАТЕЛЯ

Здесь вы можете:

➕ Создать вакансию
📋 Управлять своими вакансиями
📩 Смотреть отклики специалистов
👤 Просматривать карточки кандидатов
🟡 Рассматривать кандидатов
✅ Принимать
❌ Отказывать
🔒 Закрывать вакансии

Выберите действие:`,
    employerKeyboard
  );
}

async function showAdminPanel(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const candidates = await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
  `;

  const vacancies = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
  `;

  const published = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
    WHERE published = TRUE
  `;

  const applications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
  `;

  const newApplications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
    WHERE status = 'new'
  `;

  await sendMessage(
    chatId,
    `🔐 АДМИН-ПАНЕЛЬ

👷 Сохранённых анкет: ${candidates[0].count}
📋 Вакансий: ${vacancies[0].count}
📢 Опубликовано: ${published[0].count}
📩 Откликов: ${applications[0].count}
🆕 Новых откликов: ${newApplications[0].count}`,
    adminKeyboard
  );
}

// =====================================================
// ADMIN — CANDIDATES
// =====================================================

async function showAllCandidates(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT *
    FROM candidates
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "👷 Анкет пока нет."
    );

    return;
  }

  let text = "👷 ВСЕ АНКЕТЫ\n\n";

  rows.forEach((row, index) => {
    text += `━━━━━━━━━━━━━━
👤 №${index + 1}
👤 Имя: ${row.name}
📱 Телефон: ${row.phone}
👷 Профессия: ${row.profession}
📅 Опыт: ${row.experience}
📍 Город: ${row.city}
🚧 Вахта: ${row.shift}
`;
  });

  text += `━━━━━━━━━━━━━━
Всего анкет: ${rows.length}`;

  await sendMessage(chatId, text);
}

// =====================================================
// ADMIN — VACANCIES
// =====================================================

async function showAllVacancies(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT *
    FROM vacancies
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "📋 Вакансий пока нет."
    );

    return;
  }

  let text = "📋 ВСЕ ВАКАНСИИ\n\n";

  rows.forEach((row, index) => {
    text += `━━━━━━━━━━━━━━
📋 ВАКАНСИЯ №${index + 1}
🆔 ID: ${row.id}
📋 Название: ${row.title}
👷 Профессия: ${row.profession}
📍 Город / объект: ${row.location}
📅 Опыт: ${row.experience}
💰 Оплата: ${row.payment || "Не указана"}
📋 Условия: ${row.conditions || "Не указаны"}
🚧 Вахта: ${row.shift || "Не указано"}
📱 Контакт: ${row.phone || "Не указан"}
📢 Статус: ${
      row.closed
        ? "🔒 Закрыта"
        : row.published
        ? "Опубликована"
        : "Не опубликована"
    }
`;
  });

  text += `━━━━━━━━━━━━━━
Всего вакансий: ${rows.length}`;

  await sendMessage(chatId, text);
}

// =====================================================
// APPLICATION STATUS
// =====================================================

function getApplicationStatusText(status) {
  if (status === "review") {
    return "🟡 На рассмотрении";
  }

  if (status === "accepted") {
    return "✅ Принят";
  }

  if (status === "rejected") {
    return "❌ Отказ";
  }

  return "🆕 Новый";
}

// =====================================================
// CANDIDATE NOTIFICATION
// =====================================================

async function notifyCandidateAboutStatus(
  applicationId,
  newStatus
) {
  const rows = await sql`
    SELECT
      applications.*,
      vacancies.title AS vacancy_title,
      vacancies.profession AS vacancy_profession,
      vacancies.location AS vacancy_location
    FROM applications
    LEFT JOIN vacancies
      ON vacancies.id = applications.vacancy_id
    WHERE applications.id = ${applicationId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return;
  }

  const application = rows[0];

  let text = "";

  if (newStatus === "review") {
    text = `🟡 ВАШ ОТКЛИК НА РАССМОТРЕНИИ

📋 Вакансия:
${application.vacancy_title || "Не указана"}

👷 Профессия:
${application.vacancy_profession || "Не указана"}

📍 Город / объект:
${application.vacancy_location || "Не указан"}

🆔 Отклик №${application.id}

Работодатель рассматривает вашу кандидатуру.

Ожидайте дальнейшей связи.`;
  }

  if (newStatus === "accepted") {
    text = `✅ ВАШ ОТКЛИК ПРИНЯТ!

📋 Вакансия:
${application.vacancy_title || "Не указана"}

👷 Профессия:
${application.vacancy_profession || "Не указана"}

📍 Город / объект:
${application.vacancy_location || "Не указан"}

🆔 Отклик №${application.id}

🎉 Ваша кандидатура принята!

С вами свяжется работодатель или администратор для дальнейших деталей.`;
  }

  if (newStatus === "rejected") {
    text = `❌ ВАШ ОТКЛИК

📋 Вакансия:
${application.vacancy_title || "Не указана"}

👷 Профессия:
${application.vacancy_profession || "Не указана"}

📍 Город / объект:
${application.vacancy_location || "Не указан"}

🆔 Отклик №${application.id}

К сожалению, по данной вакансии ваша кандидатура не была выбрана.

Не останавливайтесь — следите за новыми вакансиями в канале.`;
  }

  if (newStatus === "new") {
    text = `🆕 СТАТУС ОТКЛИКА ОБНОВЛЁН

📋 Вакансия:
${application.vacancy_title || "Не указана"}

👷 Профессия:
${application.vacancy_profession || "Не указана"}

📍 Город / объект:
${application.vacancy_location || "Не указан"}

🆔 Отклик №${application.id}

Ваш отклик снова находится в статусе «Новый».`;
  }

  if (!text) {
    return;
  }

  const result = await sendMessage(
    application.candidate_chat_id,
    text
  );

  if (!result.ok) {
    console.error(
      "CANDIDATE STATUS NOTIFICATION ERROR:",
      result
    );
  }
}

// =====================================================
// ADMIN — APPLICATIONS
// =====================================================

async function showAllApplications(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT
      applications.*,
      vacancies.title AS vacancy_title,
      vacancies.profession AS vacancy_profession,
      vacancies.location AS vacancy_location
    FROM applications
    LEFT JOIN vacancies
      ON vacancies.id = applications.vacancy_id
    ORDER BY applications.id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "📩 Откликов пока нет."
    );

    return;
  }

  await sendMessage(
    chatId,
    `📩 ВСЕ ОТКЛИКИ

Всего откликов: ${rows.length}

Выберите отклик:`
  );

  for (const row of rows) {
    const statusText =
      getApplicationStatusText(row.status);

    await tg("sendMessage", {
      chat_id: chatId,

      text: `📩 ОТКЛИК №${row.id}

👤 ${row.name}
👷 ${row.vacancy_profession || "Не указана"}
📋 ${row.vacancy_title || "Вакансия не найдена"}
📍 ${row.vacancy_location || "Не указан"}

${statusText}`,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                `📂 Открыть отклик №${row.id}`,

              callback_data:
                `application_view:${row.id}`,
            },
          ],
        ],
      },
    });
  }
}

// =====================================================
// ADMIN — APPLICATION CARD
// =====================================================

async function showApplicationCard(
  chatId,
  applicationId
) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT
      applications.*,
      vacancies.title AS vacancy_title,
      vacancies.profession AS vacancy_profession,
      vacancies.location AS vacancy_location,
      vacancies.phone AS employer_phone
    FROM applications
    LEFT JOIN vacancies
      ON vacancies.id = applications.vacancy_id
    WHERE applications.id = ${applicationId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "❌ Отклик не найден."
    );

    return;
  }

  const row = rows[0];

  const statusText =
    getApplicationStatusText(row.status);

  const text = `📩 КАРТОЧКА ОТКЛИКА №${row.id}

━━━━━━━━━━━━━━

📋 ВАКАНСИЯ
${row.vacancy_title || "Не найдена"}

👷 Профессия
${row.vacancy_profession || "Не указана"}

📍 Город / объект
${row.vacancy_location || "Не указан"}

━━━━━━━━━━━━━━

👤 КАНДИДАТ
${row.name}

📱 Телефон
${row.phone}

📅 Опыт
${row.experience}

💬 Telegram
${
  row.telegram_username
    ? "@" + row.telegram_username
    : "Не указан"
}

🆔 ID кандидата
${row.candidate_chat_id}

━━━━━━━━━━━━━━

📞 КОНТАКТ РАБОТОДАТЕЛЯ
${row.employer_phone || "Не указан"}

━━━━━━━━━━━━━━

📊 СТАТУС
${statusText}`;

  await tg("sendMessage", {
    chat_id: chatId,

    text,

    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🟡 На рассмотрении",
            callback_data:
              `application_status:${row.id}:review`,
          },
        ],

        [
          {
            text: "✅ Принят",
            callback_data:
              `application_status:${row.id}:accepted`,
          },

          {
            text: "❌ Отказ",
            callback_data:
              `application_status:${row.id}:rejected`,
          },
        ],

        [
          {
            text: "🆕 Новый",
            callback_data:
              `application_status:${row.id}:new`,
          },
        ],
      ],
    },
  });
}

// =====================================================
// ADMIN — PUBLISH
// =====================================================

async function showVacanciesForPublishing(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE published = FALSE
      AND closed = FALSE
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `📢 Нет вакансий для публикации.

Все вакансии либо уже опубликованы, либо закрыты.`
    );

    return;
  }

  await sendMessage(
    chatId,
    `📢 ВЫБЕРИТЕ ВАКАНСИЮ ДЛЯ ПУБЛИКАЦИИ

Непубликованных вакансий: ${rows.length}`
  );

  for (const row of rows) {
    const text = `📋 ${row.title}

👷 Профессия: ${row.profession}
📍 ${row.location}
📅 Опыт: ${row.experience}
💰 ${row.payment || "Оплата не указана"}
📋 ${row.conditions || "Условия не указаны"}
🚧 Вахта: ${row.shift || "Не указано"}
📱 ${row.phone || "Не указан"}

🆔 ID вакансии: ${row.id}`;

    await tg("sendMessage", {
      chat_id: chatId,

      text,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                `📢 Опубликовать №${row.id}`,

              callback_data:
                `publish_vacancy:${row.id}`,
            },
          ],
        ],
      },
    });
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function publishVacancy(
  vacancyId,
  adminChatId
) {
  if (String(adminChatId) !== ADMIN_ID) {
    await sendMessage(
      adminChatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      adminChatId,
      "❌ Вакансия не найдена."
    );

    return;
  }

  const vacancy = rows[0];

  if (vacancy.closed) {
    await sendMessage(
      adminChatId,
      `🔒 Вакансия №${vacancy.id} закрыта.

Опубликовать закрытую вакансию нельзя.`
    );

    return;
  }

  if (vacancy.published) {
    await sendMessage(
      adminChatId,
      `⚠️ Вакансия №${vacancy.id} уже была опубликована.`
    );

    return;
  }

  const botUsername =
    "VakhtovykHelperBot";

  const postText = `🏗️ <b>РАБОТА | ВАХТА</b>

🔥 <b>${escapeHtml(vacancy.title)}</b>

👷 <b>Профессия:</b>
${escapeHtml(vacancy.profession)}

📍 <b>Город / объект:</b>
${escapeHtml(vacancy.location)}

📅 <b>Опыт:</b>
${escapeHtml(vacancy.experience)}

💰 <b>Оплата:</b>
${escapeHtml(
  vacancy.payment || "Уточняется"
)}

📋 <b>Условия:</b>
${escapeHtml(
  vacancy.conditions || "Уточняются"
)}

🚧 <b>Вахта:</b>
${escapeHtml(
  vacancy.shift || "Уточняется"
)}

━━━━━━━━━━━━━━

📞 <b>Контакт:</b>
${escapeHtml(vacancy.phone)}

🆔 <b>Вакансия №${vacancy.id}</b>`;

  const result = await tg(
    "sendMessage",
    {
      chat_id: CHANNEL_USERNAME,

      text: postText,

      parse_mode: "HTML",

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📞 Откликнуться",

              url:
                `https://t.me/${botUsername}` +
                `?start=vacancy_${vacancy.id}`,
            },
          ],
        ],
      },
    }
  );

  if (!result.ok) {
    console.error(
      "CHANNEL PUBLISH ERROR:",
      result
    );

    await sendMessage(
      adminChatId,
      `❌ Не удалось опубликовать вакансию.

Telegram сообщил:
${
  result.description ||
  "Неизвестная ошибка"
}`
    );

    return;
  }

  await sql`
    UPDATE vacancies
    SET
      published = TRUE,
      published_at = NOW()
    WHERE id = ${vacancy.id}
  `;

  await sendMessage(
    adminChatId,
    `✅ ВАКАНСИЯ ОПУБЛИКОВАНА!

📋 ${vacancy.title}
👷 ${vacancy.profession}
📍 ${vacancy.location}

📢 Канал:
${CHANNEL_USERNAME}

Вакансия успешно опубликована.`
  );
}

// =====================================================
// EMPLOYER CABINET
// =====================================================

async function showMyVacancies(chatId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE chat_id = ${String(chatId)}
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `📋 МОИ ВАКАНСИИ

У вас пока нет созданных вакансий.

Нажмите «➕ Создать вакансию».`,
      employerKeyboard
    );

    return;
  }

  await sendMessage(
    chatId,
    `📋 МОИ ВАКАНСИИ

Всего вакансий: ${rows.length}

Выберите нужную вакансию:`
  );

  for (const row of rows) {
    let status = "🟡 На проверке";

    if (row.closed) {
      status = "🔒 Закрыта";
    } else if (row.published) {
      status = "🟢 Опубликована";
    }

    await tg(
      "sendMessage",
      {
        chat_id: chatId,

        text: `📋 ${row.title}

👷 ${row.profession}
📍 ${row.location}
📅 Опыт: ${row.experience}
💰 ${row.payment || "Не указана"}

📊 Статус:
${status}

🆔 Вакансия №${row.id}`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📂 Открыть вакансию",
                callback_data:
                  `employer_vacancy:${row.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

// =====================================================
// EMPLOYER VACANCY CARD
// =====================================================

async function showEmployerVacancyCard(
  chatId,
  vacancyId
) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
      AND chat_id = ${String(chatId)}
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "⛔ Эта вакансия вам не принадлежит."
    );

    return;
  }

  const row = rows[0];

  let status = "🟡 На проверке";

  if (row.closed) {
    status = "🔒 Закрыта";
  } else if (row.published) {
    status = "🟢 Опубликована";
  }

  const applications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
    WHERE vacancy_id = ${row.id}
  `;

  const text = `📋 КАРТОЧКА ВАКАНСИИ №${row.id}

━━━━━━━━━━━━━━

📋 Название:
${row.title}

👷 Профессия:
${row.profession}

📍 Город / объект:
${row.location}

📅 Требуемый опыт:
${row.experience}

💰 Оплата:
${row.payment || "Не указана"}

📋 Условия:
${row.conditions || "Не указаны"}

🚧 Вахта:
${row.shift || "Не указано"}

📱 Контакт:
${row.phone || "Не указан"}

📊 Статус:
${status}

📩 Откликов:
${applications[0].count}`;

  const buttons = [];

  if (!row.closed) {
    buttons.push([
      {
        text: "📩 Отклики",
        callback_data:
          `employer_vacancy_applications:${row.id}`,
      },
    ]);

    buttons.push([
      {
        text: "🔒 Закрыть вакансию",
        callback_data:
          `employer_close_vacancy:${row.id}`,
      },
    ]);
  } else {
    buttons.push([
      {
        text: "📩 Отклики",
        callback_data:
          `employer_vacancy_applications:${row.id}`,
      },
    ]);
  }

  await tg(
    "sendMessage",
    {
      chat_id: chatId,

      text,

      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

// =====================================================
// EMPLOYER APPLICATIONS
// =====================================================

async function showEmployerApplications(
  chatId
) {
  const rows = await sql`
    SELECT
      applications.*,
      vacancies.title AS vacancy_title,
      vacancies.profession AS vacancy_profession,
      vacancies.location AS vacancy_location
    FROM applications
    INNER JOIN vacancies
      ON vacancies.id = applications.vacancy_id
    WHERE vacancies.chat_id = ${String(chatId)}
    ORDER BY applications.id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `📩 ОТКЛИКИ

Откликов на ваши вакансии пока нет.`,
      employerKeyboard
    );

    return;
  }

  await sendMessage(
    chatId,
    `📩 ОТКЛИКИ НА МОИ ВАКАНСИИ

Всего откликов: ${rows.length}

Выберите кандидата:`
  );

  for (const row of rows) {
    const statusText =
      getApplicationStatusText(row.status);

    await tg(
      "sendMessage",
      {
        chat_id: chatId,

        text: `👤 ${row.name}

📋 ${row.vacancy_title}
👷 ${row.vacancy_profession}
📍 ${row.vacancy_location}

${statusText}

🆔 Отклик №${row.id}`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "👤 Карточка кандидата",
                callback_data:
                  `employer_application_view:${row.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

// =====================================================
// EMPLOYER — APPLICATIONS FOR VACANCY
// =====================================================

async function showEmployerVacancyApplications(
  chatId,
  vacancyId
) {
  const vacancyRows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
      AND chat_id = ${String(chatId)}
    LIMIT 1
  `;

  if (vacancyRows.length === 0) {
    await sendMessage(
      chatId,
      "⛔ Доступ к этой вакансии запрещён."
    );

    return;
  }

  const vacancy = vacancyRows[0];

  const rows = await sql`
    SELECT *
    FROM applications
    WHERE vacancy_id = ${vacancyId}
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `📩 ОТКЛИКИ

📋 ${vacancy.title}

Откликов пока нет.`
    );

    return;
  }

  await sendMessage(
    chatId,
    `📩 ОТКЛИКИ НА ВАКАНСИЮ

📋 ${vacancy.title}

Всего: ${rows.length}`
  );

  for (const row of rows) {
    await tg(
      "sendMessage",
      {
        chat_id: chatId,

        text: `👤 ${row.name}

📱 ${row.phone}
📅 Опыт: ${row.experience}

${getApplicationStatusText(
          row.status
        )}

🆔 Отклик №${row.id}`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "👤 Открыть карточку",
                callback_data:
                  `employer_application_view:${row.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

// =====================================================
// EMPLOYER — CANDIDATE CARD
// =====================================================

async function showEmployerApplicationCard(
  chatId,
  applicationId
) {
  const rows = await sql`
    SELECT
      applications.*,

      vacancies.title AS vacancy_title,
      vacancies.profession AS vacancy_profession,
      vacancies.location AS vacancy_location,
      vacancies.chat_id AS employer_chat_id

    FROM applications

    INNER JOIN vacancies
      ON vacancies.id = applications.vacancy_id

    WHERE applications.id = ${applicationId}
      AND vacancies.chat_id = ${String(chatId)}

    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "⛔ Кандидат не найден или у вас нет доступа."
    );

    return;
  }

  const row = rows[0];

  const statusText =
    getApplicationStatusText(row.status);

  const text = `👤 КАРТОЧКА КАНДИДАТА

━━━━━━━━━━━━━━

👤 Имя:
${row.name}

📱 Телефон:
${row.phone}

📅 Опыт:
${row.experience}

💬 Telegram:
${
  row.telegram_username
    ? "@" + row.telegram_username
    : "Не указан"
}

━━━━━━━━━━━━━━

📋 ВАКАНСИЯ

${row.vacancy_title}

👷 Профессия:
${row.vacancy_profession}

📍 Объект:
${row.vacancy_location}

━━━━━━━━━━━━━━

📊 СТАТУС:

${statusText}

🆔 Отклик №${row.id}`;

  await tg(
    "sendMessage",
    {
      chat_id: chatId,

      text,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🟡 На рассмотрении",

              callback_data:
                `employer_application_status:${row.id}:review`,
            },
          ],

          [
            {
              text: "✅ Принят",

              callback_data:
                `employer_application_status:${row.id}:accepted`,
            },

            {
              text: "❌ Отказ",

              callback_data:
                `employer_application_status:${row.id}:rejected`,
            },
          ],

          [
            {
              text: "🆕 Новый",

              callback_data:
                `employer_application_status:${row.id}:new`,
            },
          ],
        ],
      },
    }
  );
}

// =====================================================
// EMPLOYER — CLOSE VACANCY
// =====================================================

async function closeEmployerVacancy(
  chatId,
  vacancyId
) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
      AND chat_id = ${String(chatId)}
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "⛔ Эта вакансия вам не принадлежит."
    );

    return;
  }

  const vacancy = rows[0];

  if (vacancy.closed) {
    await sendMessage(
      chatId,
      "🔒 Эта вакансия уже закрыта."
    );

    return;
  }

  await sql`
    UPDATE vacancies
    SET closed = TRUE
    WHERE id = ${vacancyId}
      AND chat_id = ${String(chatId)}
  `;

  await sendMessage(
    chatId,
    `🔒 ВАКАНСИЯ ЗАКРЫТА

📋 ${vacancy.title}

Новые отклики на эту вакансию больше не должны приниматься.

Вакансия сохранена в вашем кабинете.`
  );

  await showEmployerCabinet(chatId);
}

// =====================================================
// CANDIDATE
// =====================================================

async function startCandidate(chatId) {
  await setSession(chatId, {
    step: 1,
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
    application_vacancy_id: null,
  });

  await sendMessage(
    chatId,
    `👷 АНКЕТА СОИСКАТЕЛЯ

Как вас зовут?`
  );
}

// =====================================================
// VACANCY CREATION
// =====================================================

async function startVacancy(chatId) {
  await setSession(chatId, {
    step: 201,
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
    application_vacancy_id: null,
  });

  await sendMessage(
    chatId,
    `📋 РАЗМЕЩЕНИЕ ВАКАНСИИ

Введите название вакансии:`
  );
}

// =====================================================
// SEARCH
// =====================================================

async function startSearch(chatId) {
  await setSession(chatId, {
    step: 100,
  });

  await sendMessage(
    chatId,
    `🔎 ПОИСК СПЕЦИАЛИСТА

Введите профессию.

Например:
Монтажник
Сварщик
Моляр
Изолировщик`
  );
}

// =====================================================
// APPLICATION
// =====================================================

async function startApplication(
  chatId,
  vacancyId
) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
      AND closed = FALSE
    LIMIT 1
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "❌ Эта вакансия больше не доступна."
    );

    await showMainMenu(chatId);

    return;
  }

  const vacancy = rows[0];

  // Проверяем повторный отклик
  const existingApplication = await sql`
    SELECT id
    FROM applications
    WHERE vacancy_id = ${vacancy.id}
      AND candidate_chat_id = ${String(chatId)}
    LIMIT 1
  `;

  if (existingApplication.length > 0) {
    await sendMessage(
      chatId,
      `⚠️ Вы уже откликались на эту вакансию.

🆔 Номер отклика:
${existingApplication[0].id}`
    );

    await showMainMenu(chatId);

    return;
  }

  await setSession(chatId, {
    step: 301,
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
    application_vacancy_id: vacancy.id,
  });

  await sendMessage(
    chatId,
    `📩 ОТКЛИК НА ВАКАНСИЮ

📋 ${vacancy.title}
👷 ${vacancy.profession}
📍 ${vacancy.location}

Чтобы откликнуться, заполните короткую анкету.

👤 Как вас зовут?`
  );
}

// =====================================================
// STATISTICS
// =====================================================

async function showStatistics(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён."
    );

    return;
  }

  const candidates = await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
  `;

  const vacancies = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
  `;

  const published = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
    WHERE published = TRUE
  `;

  const closedVacancies = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
    WHERE closed = TRUE
  `;

  const shifts = await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
    WHERE LOWER(shift) LIKE '%да%'
  `;

  const applications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
  `;

  const newApplications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
    WHERE status = 'new'
  `;

  const reviewApplications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
    WHERE status = 'review'
  `;

  const acceptedApplications = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
    WHERE status = 'accepted'
  `;

  await sendMessage(
    chatId,
    `📊 СТАТИСТИКА

👷 Специалистов:
${candidates[0].count}

📋 Всего вакансий:
${vacancies[0].count}

📢 Опубликовано вакансий:
${published[0].count}

🔒 Закрыто вакансий:
${closedVacancies[0].count}

📩 Всего откликов:
${applications[0].count}

🆕 Новых:
${newApplications[0].count}

🟡 На рассмотрении:
${reviewApplications[0].count}

✅ Принято:
${acceptedApplications[0].count}

🚧 Специалистов готовы на вахту:
${shifts[0].count}`
  );
}

// =====================================================
// HANDLE APPLICATION
// =====================================================

async function handleApplication(
  chatId,
  text,
  session,
  username
) {
  if (session.step === 301) {
    await setSession(chatId, {
      ...session,
      step: 302,
      name: text,
    });

    await sendMessage(
      chatId,
      "📱 Укажите номер телефона:"
    );

    return;
  }

  if (session.step === 302) {
    await setSession(chatId, {
      ...session,
      step: 303,
      phone: text,
    });

    await sendMessage(
      chatId,
      "📅 Сколько лет опыта по этой профессии?"
    );

    return;
  }

  if (session.step === 303) {
    const experience = text;

    const vacancyRows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${session.application_vacancy_id}
        AND closed = FALSE
      LIMIT 1
    `;

    if (vacancyRows.length === 0) {
      await clearSession(chatId);

      await sendMessage(
        chatId,
        "❌ К сожалению, эта вакансия больше не доступна."
      );

      await showMainMenu(chatId);

      return;
    }

    const vacancy = vacancyRows[0];

    const duplicate = await sql`
      SELECT id
      FROM applications
      WHERE vacancy_id = ${vacancy.id}
        AND candidate_chat_id = ${String(chatId)}
      LIMIT 1
    `;

    if (duplicate.length > 0) {
      await clearSession(chatId);

      await sendMessage(
        chatId,
        `⚠️ Вы уже откликались на эту вакансию.

🆔 Номер отклика:
${duplicate[0].id}`
      );

      await showMainMenu(chatId);

      return;
    }

    const telegramUsername =
      username || null;

    const inserted = await sql`
      INSERT INTO applications (
        vacancy_id,
        candidate_chat_id,
        name,
        phone,
        experience,
        telegram_username,
        status
      )
      VALUES (
        ${vacancy.id},
        ${String(chatId)},
        ${session.name},
        ${session.phone},
        ${experience},
        ${telegramUsername},
        'new'
      )
      RETURNING id
    `;

    const applicationId =
      inserted[0].id;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ ОТКЛИК ПРИНЯТ!

📋 Вакансия:
${vacancy.title}

👷 Профессия:
${vacancy.profession}

📍 ${vacancy.location}

👤 Имя:
${session.name}

📱 Телефон:
${session.phone}

📅 Опыт:
${experience}

🆔 Номер отклика:
${applicationId}

Спасибо! Администратор свяжется с вами.`
    );

    await showMainMenu(chatId);

    await tg(
      "sendMessage",
      {
        chat_id: ADMIN_ID,

        text: `🔔 НОВЫЙ ОТКЛИК!

━━━━━━━━━━━━━━

📩 ОТКЛИК №${applicationId}

📋 Вакансия:
${vacancy.title}

👷 Профессия:
${vacancy.profession}

📍 Город / объект:
${vacancy.location}

━━━━━━━━━━━━━━

👤 Имя:
${session.name}

📱 Телефон:
${session.phone}

📅 Опыт:
${experience}

💬 Telegram:
${
  telegramUsername
    ? "@" + telegramUsername
    : "Не указан"
}

🆔 ID кандидата:
${chatId}

━━━━━━━━━━━━━━

🆕 Статус: Новый`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "📂 Открыть отклик",

                callback_data:
                  `application_view:${applicationId}`,
              },
            ],
          ],
        },
      }
    );
  }
}

// =====================================================
// HANDLE CANDIDATE
// =====================================================

async function handleCandidate(
  chatId,
  text,
  session
) {
  if (session.step === 1) {
    await setSession(chatId, {
      ...session,
      step: 2,
      name: text,
    });

    await sendMessage(
      chatId,
      `👷 Какая у вас профессия?

Например:
Монтажник строительных лесов
Сварщик
Моляр
Изолировщик`
    );

    return;
  }

  if (session.step === 2) {
    await setSession(chatId, {
      ...session,
      step: 3,
      profession: text,
    });

    await sendMessage(
      chatId,
      "📅 Сколько лет опыта?"
    );

    return;
  }

  if (session.step === 3) {
    await setSession(chatId, {
      ...session,
      step: 4,
      experience: text,
    });

    await sendMessage(
      chatId,
      "📍 В каком городе вы находитесь?"
    );

    return;
  }

  if (session.step === 4) {
    await setSession(chatId, {
      ...session,
      step: 5,
      city: text,
    });

    await sendMessage(
      chatId,
      `🚧 Готовы работать вахтой?

Ответьте: Да или Нет`
    );

    return;
  }

  if (session.step === 5) {
    await setSession(chatId, {
      ...session,
      step: 6,
      shift: text,
    });

    await sendMessage(
      chatId,
      "📱 Укажите номер телефона:"
    );

    return;
  }

  if (session.step === 6) {
    const phone = text;

    await sql`
      INSERT INTO candidates (
        chat_id,
        name,
        phone,
        profession,
        experience,
        city,
        shift
      )
      VALUES (
        ${String(chatId)},
        ${session.name},
        ${phone},
        ${session.profession},
        ${session.experience},
        ${session.city},
        ${session.shift}
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ АНКЕТА СОХРАНЕНА!

👤 Имя:
${session.name}

📱 Телефон:
${phone}

👷 Профессия:
${session.profession}

📅 Опыт:
${session.experience}

📍 Город:
${session.city}

🚧 Вахта:
${session.shift}

Ваша анкета добавлена в базу специалистов.`
    );

    await showMainMenu(chatId);
  }
}

// =====================================================
// HANDLE VACANCY CREATION
// =====================================================

async function handleVacancy(
  chatId,
  text,
  session
) {
  if (session.step === 201) {
    await setSession(chatId, {
      ...session,
      step: 202,
      name: text,
    });

    await sendMessage(
      chatId,
      `👷 Укажите профессию.

Например:
Монтажник строительных лесов
Сварщик
Моляр
Изолировщик`
    );

    return;
  }

  if (session.step === 202) {
    await setSession(chatId, {
      ...session,
      step: 203,
      profession: text,
    });

    await sendMessage(
      chatId,
      "📍 Укажите город или объект:"
    );

    return;
  }

  if (session.step === 203) {
    await setSession(chatId, {
      ...session,
      step: 204,
      city: text,
    });

    await sendMessage(
      chatId,
      `📅 Какой требуется опыт?

Например:
от 2 лет`
    );

    return;
  }

  if (session.step === 204) {
    await setSession(chatId, {
      ...session,
      step: 205,
      experience: text,
    });

    await sendMessage(
      chatId,
      `💰 Укажите оплату.

Например:
350 000 ₽ в месяц

или

5 000 ₽ за смену`
    );

    return;
  }

  if (session.step === 205) {
    await setSession(chatId, {
      ...session,
      step: 206,
      shift: text,
    });

    await sendMessage(
      chatId,
      `📋 Укажите условия работы.

Например:
Проживание и питание предоставляются`
    );

    return;
  }

  if (session.step === 206) {
    await setSession(chatId, {
      ...session,
      step: 207,
      shift:
        `${session.shift}|||${text}`,
    });

    await sendMessage(
      chatId,
      `🚧 Работа вахтой?

Ответьте: Да или Нет`
    );

    return;
  }

  if (session.step === 207) {
    const temporaryData =
      (session.shift || "").split("|||");

    const payment =
      temporaryData[0] || "Не указана";

    const conditions =
      temporaryData[1] || "Не указаны";

    const shift = text;

    await setSession(chatId, {
      ...session,
      step: 208,
      shift:
        `${payment}|||${conditions}|||${shift}`,
    });

    await sendMessage(
      chatId,
      "📱 Укажите контактный номер работодателя:"
    );

    return;
  }

  if (session.step === 208) {
    const temporaryData =
      (session.shift || "").split("|||");

    const payment =
      temporaryData[0] || "Не указана";

    const conditions =
      temporaryData[1] || "Не указаны";

    const shift =
      temporaryData[2] || "Не указано";

    const phone = text;

    await sql`
      INSERT INTO vacancies (
        chat_id,
        title,
        profession,
        location,
        experience,
        payment,
        conditions,
        shift,
        phone,
        published,
        closed
      )
      VALUES (
        ${String(chatId)},
        ${session.name},
        ${session.profession},
        ${session.city},
        ${session.experience},
        ${payment},
        ${conditions},
        ${shift},
        ${phone},
        FALSE,
        FALSE
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ ВАКАНСИЯ ПРИНЯТА!

📋 Вакансия:
${session.name}

👷 Профессия:
${session.profession}

📍 Город / объект:
${session.city}

📅 Опыт:
${session.experience}

💰 Оплата:
${payment}

📋 Условия:
${conditions}

🚧 Вахта:
${shift}

📱 Контакт:
${phone}

Вакансия сохранена и ожидает проверки администратора.`
    );

    await showEmployerCabinet(chatId);
  }
}

// =====================================================
// SEARCH
// =====================================================

async function handleSearch(
  chatId,
  text
) {
  const search = `%${text}%`;

  const rows = await sql`
    SELECT *
    FROM candidates
    WHERE profession ILIKE ${search}
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      `🔎 По запросу «${text}» специалисты не найдены.`
    );

    return;
  }

  let result = `🔎 РЕЗУЛЬТАТ ПОИСКА

Найдено специалистов: ${rows.length}
`;

  rows.forEach((row, index) => {
    result += `━━━━━━━━━━━━━━
👤 №${index + 1}
👤 Имя: ${row.name}
📱 Телефон: ${row.phone}
👷 Профессия: ${row.profession}
📅 Опыт: ${row.experience}
📍 Город: ${row.city}
🚧 Вахта: ${row.shift}
`;
  });

  await sendMessage(
    chatId,
    result
  );
}

// =====================================================
// CALLBACKS
// =====================================================

async function handleCallbackQuery(
  callbackQuery
) {
  const callbackId =
    callbackQuery.id;

  const data =
    callbackQuery.data || "";

  const fromId =
    String(callbackQuery.from?.id || "");

  // ---------------------------------------------------
  // ADMIN PUBLISH
  // ---------------------------------------------------

  if (data.startsWith("publish_vacancy:")) {
    if (fromId !== ADMIN_ID) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "⛔ Доступ запрещён.",

          show_alert: true,
        }
      );

      return;
    }

    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,
      }
    );

    const vacancyId =
      data.split(":")[1];

    await publishVacancy(
      vacancyId,
      fromId
    );

    return;
  }

  // ---------------------------------------------------
  // ADMIN APPLICATION VIEW
  // ---------------------------------------------------

  if (data.startsWith("application_view:")) {
    if (fromId !== ADMIN_ID) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "⛔ Доступ запрещён.",

          show_alert: true,
        }
      );

      return;
    }

    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,
      }
    );

    const applicationId =
      data.split(":")[1];

    await showApplicationCard(
      fromId,
      applicationId
    );

    return;
  }

  // ---------------------------------------------------
  // ADMIN APPLICATION STATUS
  // ---------------------------------------------------

  if (
    data.startsWith(
      "application_status:"
    )
  ) {
    if (fromId !== ADMIN_ID) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "⛔ Доступ запрещён.",

          show_alert: true,
        }
      );

      return;
    }

    const parts =
      data.split(":");

    const applicationId =
      parts[1];

    const newStatus =
      parts[2];

    const allowedStatuses = [
      "new",
      "review",
      "accepted",
      "rejected",
    ];

    if (
      !allowedStatuses.includes(
        newStatus
      )
    ) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "❌ Недопустимый статус.",

          show_alert: true,
        }
      );

      return;
    }

    const applicationRows =
      await sql`
        SELECT *
        FROM applications
        WHERE id = ${applicationId}
        LIMIT 1
      `;

    if (
      applicationRows.length === 0
    ) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "❌ Отклик не найден.",

          show_alert: true,
        }
      );

      return;
    }

    const oldStatus =
      applicationRows[0].status;

    await sql`
      UPDATE applications
      SET status = ${newStatus}
      WHERE id = ${applicationId}
    `;

    const statusText =
      getApplicationStatusText(
        newStatus
      );

    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,

        text:
          `Статус изменён: ${statusText}`,
      }
    );

    if (
      oldStatus !== newStatus
    ) {
      await notifyCandidateAboutStatus(
        applicationId,
        newStatus
      );
    }

    await showApplicationCard(
      fromId,
      applicationId
    );

    return;
  }

  // ===================================================
  // EMPLOYER — VACANCY CARD
  // ===================================================

  if (
    data.startsWith(
      "employer_vacancy:"
    )
  ) {
    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,
      }
    );

    const vacancyId =
      data.split(":")[1];

    await showEmployerVacancyCard(
      fromId,
      vacancyId
    );

    return;
  }

  // ===================================================
  // EMPLOYER — VACANCY APPLICATIONS
  // ===================================================

  if (
    data.startsWith(
      "employer_vacancy_applications:"
    )
  ) {
    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,
      }
    );

    const vacancyId =
      data.split(":")[1];

    await showEmployerVacancyApplications(
      fromId,
      vacancyId
    );

    return;
  }

  // ===================================================
  // EMPLOYER — APPLICATION CARD
  // ===================================================

  if (
    data.startsWith(
      "employer_application_view:"
    )
  ) {
    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,
      }
    );

    const applicationId =
      data.split(":")[1];

    await showEmployerApplicationCard(
      fromId,
      applicationId
    );

    return;
  }

  // ===================================================
  // EMPLOYER — APPLICATION STATUS
  // ===================================================

  if (
    data.startsWith(
      "employer_application_status:"
    )
  ) {
    const parts =
      data.split(":");

    const applicationId =
      parts[1];

    const newStatus =
      parts[2];

    const allowedStatuses = [
      "new",
      "review",
      "accepted",
      "rejected",
    ];

    if (
      !allowedStatuses.includes(
        newStatus
      )
    ) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "❌ Недопустимый статус.",

          show_alert: true,
        }
      );

      return;
    }

    // Проверяем, что отклик относится
    // именно к вакансии этого работодателя
    const applicationRows =
      await sql`
        SELECT
          applications.*,
          vacancies.chat_id AS employer_chat_id

        FROM applications

        INNER JOIN vacancies
          ON vacancies.id =
             applications.vacancy_id

        WHERE applications.id =
              ${applicationId}

          AND vacancies.chat_id =
              ${fromId}

        LIMIT 1
      `;

    if (
      applicationRows.length === 0
    ) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "⛔ У вас нет доступа к этому отклику.",

          show_alert: true,
        }
      );

      return;
    }

    const oldStatus =
      applicationRows[0].status;

    await sql`
      UPDATE applications
      SET status = ${newStatus}
      WHERE id = ${applicationId}
    `;

    const statusText =
      getApplicationStatusText(
        newStatus
      );

    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,

        text:
          `Статус изменён: ${statusText}`,
      }
    );

    if (
      oldStatus !== newStatus
    ) {
      await notifyCandidateAboutStatus(
        applicationId,
        newStatus
      );
    }

    await showEmployerApplicationCard(
      fromId,
      applicationId
    );

    return;
  }

  // ===================================================
  // EMPLOYER — CLOSE VACANCY
  // ===================================================

  if (
    data.startsWith(
      "employer_close_vacancy:"
    )
  ) {
    const vacancyId =
      data.split(":")[1];

    const rows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacancyId}
        AND chat_id = ${fromId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      await tg(
        "answerCallbackQuery",
        {
          callback_query_id:
            callbackId,

          text:
            "⛔ Эта вакансия вам не принадлежит.",

          show_alert: true,
        }
      );

      return;
    }

    await tg(
      "answerCallbackQuery",
      {
        callback_query_id:
          callbackId,

        text:
          "🔒 Вакансия закрывается...",
      }
    );

    await closeEmployerVacancy(
      fromId,
      vacancyId
    );

    return;
  }

  // ---------------------------------------------------
  // UNKNOWN CALLBACK
  // ---------------------------------------------------

  await tg(
    "answerCallbackQuery",
    {
      callback_query_id:
        callbackId,
    }
  );
}

// =====================================================
// MAIN HANDLER
// =====================================================

export default async function handler(
  req,
  res
) {
  try {
    await initDb();

    // -------------------------------------------------
    // GET
    // -------------------------------------------------

    if (req.method === "GET") {
      if (
        req.query.setup === "1"
      ) {
        const webhook =
          await tg(
            "setWebhook",
            {
              url:
                `https://${req.headers.host}/api/bot`,
            }
          );

        return res
          .status(200)
          .json({
            ok: true,
            webhook,
          });
      }

      return res
        .status(200)
        .json({
          ok: true,
          message:
            "Bot is working",
        });
    }

    // -------------------------------------------------
    // METHOD
    // -------------------------------------------------

    if (req.method !== "POST") {
      return res
        .status(405)
        .json({
          ok: false,
          error:
            "Method not allowed",
        });
    }

    const update =
      req.body;

    if (!update) {
      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // CALLBACK
    // -------------------------------------------------

    if (
      update.callback_query
    ) {
      await handleCallbackQuery(
        update.callback_query
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (!update.message) {
      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // MESSAGE
    // -------------------------------------------------

    const message =
      update.message;

    const chatId =
      message.chat.id;

    const text =
      message.text
        ? message.text.trim()
        : "";

    const username =
      message.from?.username ||
      "";

    if (!text) {
      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // APPLICATION FROM CHANNEL
    // -------------------------------------------------

    if (
      text.startsWith(
        "/start vacancy_"
      )
    ) {
      const vacancyId =
        text.replace(
          "/start vacancy_",
          ""
        );

      await startApplication(
        chatId,
        vacancyId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // START
    // -------------------------------------------------

    if (text === "/start") {
      await clearSession(
        chatId
      );

      await showMainMenu(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // ID
    // -------------------------------------------------

    if (text === "/id") {
      await sendMessage(
        chatId,
        `🆔 Ваш Telegram ID:

${chatId}`
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // ADMIN
    // -------------------------------------------------

    if (
      text === "/admin" ||
      text === "🔐 Админ-панель"
    ) {
      await showAdminPanel(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // MAIN MENU
    // -------------------------------------------------

    if (
      text === "🏠 Главное меню"
    ) {
      await clearSession(
        chatId
      );

      await showMainMenu(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // EMPLOYER CABINET
    // =================================================

    if (
      text === "🏢 Я работодатель"
    ) {
      await clearSession(
        chatId
      );

      await showEmployerCabinet(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // CREATE VACANCY
    // -------------------------------------------------

    if (
      text === "➕ Создать вакансию"
    ) {
      await startVacancy(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // MY VACANCIES
    // -------------------------------------------------

    if (
      text === "📋 Мои вакансии"
    ) {
      await clearSession(
        chatId
      );

      await showMyVacancies(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // -------------------------------------------------
    // MY APPLICATIONS
    // -------------------------------------------------

    if (
      text ===
      "📩 Отклики на мои вакансии"
    ) {
      await clearSession(
        chatId
      );

      await showEmployerApplications(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // ADMIN MENU
    // =================================================

    if (
      text === "👷 Все анкеты"
    ) {
      await showAllCandidates(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (
      text === "📋 Все вакансии"
    ) {
      await showAllVacancies(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (
      text === "📩 Все отклики"
    ) {
      await showAllApplications(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (
      text ===
      "📢 Опубликовать вакансию"
    ) {
      await showVacanciesForPublishing(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (
      text === "📊 Статистика"
    ) {
      await showStatistics(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    if (
      text === "🔎 Найти специалиста"
    ) {
      await startSearch(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // CANDIDATE
    // =================================================

    if (
      text === "👷 Я ищу работу"
    ) {
      await startCandidate(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // VACANCY
    // =================================================

    if (
      text ===
      "📋 Разместить вакансию"
    ) {
      await startVacancy(
        chatId
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // CONTACT ADMIN
    // =================================================

    if (
      text ===
      "📞 Связаться с администратором"
    ) {
      await sendMessage(
        chatId,
        "📞 Для связи с администратором напишите сообщение в этот чат."
      );

      return res
        .status(200)
        .json({
          ok: true,
        });
    }

    // =================================================
    // SESSION
    // =================================================

    const session =
      await getSession(chatId);

    if (session) {
      // ------------------------------------------------
      // SEARCH
      // ------------------------------------------------

      if (
        session.step === 100
      ) {
        await handleSearch(
          chatId,
          text
        );

        await clearSession(
          chatId
        );

        return res
          .status(200)
          .json({
            ok: true,
          });
      }

      // ------------------------------------------------
      // APPLICATION
      // ------------------------------------------------

      if (
        session.step >= 301 &&
        session.step <= 303
      ) {
        await handleApplication(
          chatId,
          text,
          session,
          username
        );

        return res
          .status(200)
          .json({
            ok: true,
          });
      }

      // ------------------------------------------------
      // CANDIDATE
      // ------------------------------------------------

      if (
        session.step >= 1 &&
        session.step <= 6
      ) {
        await handleCandidate(
          chatId,
          text,
          session
        );

        return res
          .status(200)
          .json({
            ok: true,
          });
      }

      // ------------------------------------------------
      // VACANCY
      // ------------------------------------------------

      if (
        session.step >= 201 &&
        session.step <= 208
      ) {
        await handleVacancy(
          chatId,
          text,
          session
        );

        return res
          .status(200)
          .json({
            ok: true,
          });
      }
    }

    // -------------------------------------------------
    // FALLBACK
    // -------------------------------------------------

    await showMainMenu(
      chatId
    );

    return res
      .status(200)
      .json({
        ok: true,
      });

  } catch (error) {
    console.error(
      "BOT ERROR:",
      error
    );

    return res
      .status(500)
      .json({
        ok: false,
        error:
          error.message,
      });
  }
}
