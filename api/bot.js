const { neon } = require("@neondatabase/serverless");

const BOT_TOKEN = process.env.BOT_TOKEN;
const POSTGRES_URL = process.env.POSTGRES_URL;
const ADMIN_ID = String(process.env.ADMIN_ID || "");

const CHANNEL_USERNAME = String(
  process.env.CHANNEL_USERNAME || "vakhtovyk"
).replace(/^@/, "");

const BOT_USERNAME = String(
  process.env.BOT_USERNAME || "VakhtovykHelperBot"
).replace(/^@/, "");

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

const WEBHOOK_URL =
  "https://rabota-vakhta-bot.vercel.app/api/bot";

function json(res, data, status = 200) {
  res.status(status);
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );
  return res.end(JSON.stringify(data));
}

function text(value) {
  return String(value ?? "").trim();
}

function esc(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAdmin(chatId) {
  return (
    ADMIN_ID &&
    String(chatId) === String(ADMIN_ID)
  );
}

function keyboard(rows) {
  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function inlineKeyboard(rows) {
  return {
    inline_keyboard: rows,
  };
}

async function telegram(method, data = {}) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  const result = await response.json();

  if (!result.ok) {
    throw new Error(
      result.description ||
        `Telegram API error: ${method}`
    );
  }

  return result.result;
}

async function sendMessage(
  chatId,
  message,
  extra = {}
) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    ...extra,
  });
}

async function editMessage(
  chatId,
  messageId,
  message,
  extra = {}
) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: message,
    parse_mode: "HTML",
    ...extra,
  });
}

/* =========================
   DATABASE
========================= */

async function initDatabase() {
  if (!sql) {
    throw new Error(
      "POSTGRES_URL is not configured"
    );
  }

  await sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id BIGINT PRIMARY KEY,
      state TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      telegram_username TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS vacancies (
      id BIGSERIAL PRIMARY KEY,
      title TEXT,
      profession TEXT,
      city TEXT,
      location TEXT,
      experience TEXT,
      payment TEXT,
      conditions TEXT,
      shift TEXT,
      status TEXT DEFAULT 'draft',
      published_at TIMESTAMPTZ,
      channel_message_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id BIGSERIAL PRIMARY KEY,
      vacancy_id BIGINT,
      candidate_chat_id BIGINT,
      name TEXT,
      phone TEXT,
      experience TEXT,
      telegram_username TEXT,
      status TEXT DEFAULT 'new',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS city TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS location TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS channel_message_id BIGINT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await sql`
    UPDATE vacancies
    SET city = location
    WHERE city IS NULL
      AND location IS NOT NULL
  `;

  await sql`
    UPDATE vacancies
    SET location = city
    WHERE location IS NULL
      AND city IS NOT NULL
  `;

  return true;
}

/* =========================
   SESSIONS
========================= */

async function getSession(chatId) {
  const rows = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function saveSession(
  chatId,
  state,
  data = {}
) {
  await sql`
    INSERT INTO bot_sessions
      (
        chat_id,
        state,
        data,
        updated_at
      )
    VALUES
      (
        ${chatId},
        ${state},
        ${JSON.stringify(data)}::jsonb,
        NOW()
      )
    ON CONFLICT (chat_id)
    DO UPDATE SET
      state = EXCLUDED.state,
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

async function clearSession(chatId) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${chatId}
  `;
}

/* =========================
   MENUS
========================= */

function mainMenu() {
  return keyboard([
    [
      { text: "🔎 Вакансии" },
      { text: "👷 Анкета специалиста" },
    ],
    [
      { text: "📋 Мои отклики" },
      { text: "ℹ️ О проекте" },
    ],
  ]);
}

function adminMenu() {
  return keyboard([
    [
      { text: "📊 Статистика" },
      { text: "👷 Все специалисты" },
    ],
    [
      { text: "📋 Все заявки" },
      { text: "📢 Вакансии" },
    ],
    [
      { text: "➕ Добавить вакансию" },
    ],
    [
      { text: "⬅️ Главное меню" },
    ],
  ]);
}

/* =========================
   VACANCIES
========================= */

function vacancyLocation(vacancy) {
  return (
    vacancy.city ||
    vacancy.location ||
    "Не указано"
  );
}

function vacancyText(vacancy) {
  return (
    `<b>🔹 ${esc(
      vacancy.title || "Вакансия"
    )}</b>\n\n` +

    `👷 Профессия: <b>${esc(
      vacancy.profession || "Не указано"
    )}</b>\n` +

    `📍 Место: <b>${esc(
      vacancyLocation(vacancy)
    )}</b>\n` +

    `💰 Оплата: <b>${esc(
      vacancy.payment ||
        "По договорённости"
    )}</b>\n` +

    `🛠 Опыт: ${esc(
      vacancy.experience ||
        "Не указан"
    )}\n` +

    `🍽 Условия: ${esc(
      vacancy.conditions ||
        "Уточняются"
    )}\n` +

    `🚐 Вахта: ${esc(
      vacancy.shift ||
        "Уточняется"
    )}`
  );
}

async function showVacancies(chatId) {
  const vacancies = await sql`
    SELECT *
    FROM vacancies
    WHERE status IS NULL
       OR status <> 'closed'
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!vacancies.length) {
    await sendMessage(
      chatId,
      "📭 Сейчас опубликованных вакансий нет.\n\nПопробуйте зайти позже.",
      {
        reply_markup: mainMenu(),
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>🔎 АКТУАЛЬНЫЕ ВАКАНСИИ</b>\n\n` +
      `Нажмите «Откликнуться», чтобы отправить заявку.`,
    {
      reply_markup: mainMenu(),
    }
  );

  for (const vacancy of vacancies) {
    await sendMessage(
      chatId,
      vacancyText(vacancy),
      {
        reply_markup: inlineKeyboard([
          [
            {
              text: "📝 ОТКЛИКНУТЬСЯ",
              url:
                `https://t.me/${BOT_USERNAME}` +
                `?start=vacancy_${vacancy.id}`,
            },
          ],
        ]),
      }
    );
  }
}

/* =========================
   CANDIDATE
========================= */

async function startCandidate(
  chatId,
  telegramUser,
  vacancyId = null
) {
  const data = {
    vacancy_id: vacancyId,
    telegram_username:
      telegramUser?.username || "",
  };

  await saveSession(
    chatId,
    "candidate_name",
    data
  );

  await sendMessage(
    chatId,
    `<b>👷 АНКЕТА СПЕЦИАЛИСТА</b>\n\n` +
      `Заполните несколько пунктов.\n\n` +
      `1️⃣ Введите ваше имя:`,
    {
      reply_markup: {
        remove_keyboard: true,
      },
    }
  );
}

async function finishCandidate(
  chatId,
  session
) {
  const data = session.data || {};

  const result = await sql`
    INSERT INTO candidates
      (
        chat_id,
        name,
        phone,
        profession,
        experience,
        city,
        shift,
        telegram_username
      )
    VALUES
      (
        ${chatId},
        ${data.name || ""},
        ${data.phone || ""},
        ${data.profession || ""},
        ${data.experience || ""},
        ${data.city || ""},
        ${data.shift || ""},
        ${data.telegram_username || ""}
      )
    RETURNING id
  `;

  if (data.vacancy_id) {
    const vacancy = await sql`
      SELECT id
      FROM vacancies
      WHERE id = ${data.vacancy_id}
        AND (
          status IS NULL
          OR status <> 'closed'
        )
      LIMIT 1
    `;

    if (vacancy.length) {
      await sql`
        INSERT INTO applications
          (
            vacancy_id,
            candidate_chat_id,
            name,
            phone,
            experience,
            telegram_username,
            status
          )
        VALUES
          (
            ${data.vacancy_id},
            ${chatId},
            ${data.name || ""},
            ${data.phone || ""},
            ${data.experience || ""},
            ${data.telegram_username || ""},
            'new'
          )
      `;
    }
  }

  await clearSession(chatId);

  await sendMessage(
    chatId,
    `<b>✅ АНКЕТА СОХРАНЕНА</b>\n\n` +
      `Спасибо, ${esc(
        data.name || ""
      )}!\n\n` +
      `Ваша анкета сохранена.` +
      `\n\nС вами свяжутся по указанному номеру.`,
    {
      reply_markup: mainMenu(),
    }
  );

  if (ADMIN_ID) {
    try {
      await sendMessage(
        ADMIN_ID,
        `<b>🔔 НОВАЯ АНКЕТА</b>\n\n` +
          `👤 ${esc(data.name || "")}\n` +
          `📞 ${esc(data.phone || "")}\n` +
          `👷 ${esc(
            data.profession || ""
          )}\n` +
          `📅 Опыт: ${esc(
            data.experience || ""
          )}\n` +
          `📍 ${esc(data.city || "")}\n` +
          `🚐 Вахта: ${esc(
            data.shift || ""
          )}\n` +
          `🆔 ID: ${result[0].id}`
      );
    } catch (error) {
      console.error(
        "Admin notification error:",
        error
      );
    }
  }
}

async function handleCandidateStep(
  chatId,
  message,
  session
) {
  const value = text(message.text);
  const data = session.data || {};

  switch (session.state) {
    case "candidate_name":
      if (!value) {
        await sendMessage(
          chatId,
          "Пожалуйста, напишите ваше имя."
        );
        return;
      }

      data.name = value;

      await saveSession(
        chatId,
        "candidate_phone",
        data
      );

      await sendMessage(
        chatId,
        "2️⃣ Отправьте номер телефона:",
        {
          reply_markup: keyboard([
            [
              {
                text:
                  "📱 Отправить номер телефона",
                request_contact: true,
              },
            ],
            [
              {
                text: "❌ Отмена",
              },
            ],
          ]),
        }
      );

      return;

    case "candidate_phone":
      if (message.contact?.phone_number) {
        data.phone =
          message.contact.phone_number;
      } else if (value) {
        data.phone = value;
      } else {
        await sendMessage(
          chatId,
          "Пожалуйста, отправьте номер телефона."
        );
        return;
      }

      await saveSession(
        chatId,
        "candidate_profession",
        data
      );

      await sendMessage(
        chatId,
        "3️⃣ Укажите профессию.\n\n" +
          "Например: монтажник, сварщик, арматурщик.",
        {
          reply_markup: keyboard([
            [
              {
                text: "❌ Отмена",
              },
            ],
          ]),
        }
      );

      return;

    case "candidate_profession":
      if (!value) {
        await sendMessage(
          chatId,
          "Укажите вашу профессию."
        );
        return;
      }

      data.profession = value;

      await saveSession(
        chatId,
        "candidate_experience",
        data
      );

      await sendMessage(
        chatId,
        "4️⃣ Сколько лет опыта?"
      );

      return;

    case "candidate_experience":
      if (!value) {
        await sendMessage(
          chatId,
          "Укажите ваш опыт."
        );
        return;
      }

      data.experience = value;

      await saveSession(
        chatId,
        "candidate_city",
        data
      );

      await sendMessage(
        chatId,
        "5️⃣ В каком городе вы сейчас находитесь?"
      );

      return;

    case "candidate_city":
      if (!value) {
        await sendMessage(
          chatId,
          "Укажите город."
        );
        return;
      }

      data.city = value;

      await saveSession(
        chatId,
        "candidate_shift",
        data
      );

      await sendMessage(
        chatId,
        "6️⃣ Готовы работать вахтой?",
        {
          reply_markup: keyboard([
            [
              { text: "Да" },
              { text: "Нет" },
            ],
            [
              { text: "❌ Отмена" },
            ],
          ]),
        }
      );

      return;

    case "candidate_shift":
      data.shift = value;

      await finishCandidate(
        chatId,
        {
          state: session.state,
          data,
        }
      );

      return;
  }
}

/* =========================
   APPLICATIONS
========================= */

async function showMyApplications(chatId) {
  const rows = await sql`
    SELECT
      a.*,
      v.title,
      v.profession,
      v.city,
      v.location
    FROM applications a
    LEFT JOIN vacancies v
      ON v.id = a.vacancy_id
    WHERE a.candidate_chat_id = ${chatId}
    ORDER BY a.id DESC
    LIMIT 20
  `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "📋 У вас пока нет откликов.",
      {
        reply_markup: mainMenu(),
      }
    );

    return;
  }

  let message =
    "<b>📋 МОИ ОТКЛИКИ</b>\n\n";

  for (const row of rows) {
    message +=
      `🆔 #${row.id}\n` +
      `👷 ${esc(
        row.title ||
          row.profession ||
          "Вакансия"
      )}\n` +
      `📍 ${esc(
        row.city ||
          row.location ||
          ""
      )}\n` +
      `📌 Статус: ${esc(
        row.status || "new"
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    message,
    {
      reply_markup: mainMenu(),
    }
  );
}

/* =========================
   ADMIN
========================= */

async function showStats(chatId) {
  const [candidates] = await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
  `;

  const [applications] = await sql`
    SELECT COUNT(*)::int AS count
    FROM applications
  `;

  const [vacancies] = await sql`
    SELECT COUNT(*)::int AS count
    FROM vacancies
    WHERE status IS NULL
       OR status <> 'closed'
  `;

  await sendMessage(
    chatId,
    `<b>📊 СТАТИСТИКА</b>\n\n` +
      `👷 Специалистов: <b>${candidates.count}</b>\n` +
      `📋 Откликов: <b>${applications.count}</b>\n` +
      `📢 Активных вакансий: <b>${vacancies.count}</b>`,
    {
      reply_markup: adminMenu(),
    }
  );
}

async function showCandidates(chatId) {
  const rows = await sql`
    SELECT *
    FROM candidates
    ORDER BY id DESC
    LIMIT 50
  `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "👷 Анкет пока нет.",
      {
        reply_markup: adminMenu(),
      }
    );

    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>👷 СПЕЦИАЛИСТ #${row.id}</b>\n\n` +
        `👤 ${esc(row.name)}\n` +
        `📞 ${esc(row.phone)}\n` +
        `🔧 ${esc(row.profession)}\n` +
        `📅 Опыт: ${esc(row.experience)}\n` +
        `📍 ${esc(row.city)}\n` +
        `🚐 Вахта: ${esc(row.shift)}\n` +
        `💬 Telegram: ${
          row.telegram_username
            ? "@" +
              esc(row.telegram_username)
            : "не указан"
        }`,
      {
        reply_markup: adminMenu(),
      }
    );
  }
}

async function showApplications(chatId) {
  const rows = await sql`
    SELECT
      a.*,
      v.title,
      v.profession,
      v.city,
      v.location
    FROM applications a
    LEFT JOIN vacancies v
      ON v.id = a.vacancy_id
    ORDER BY a.id DESC
    LIMIT 50
  `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "📋 Заявок пока нет.",
      {
        reply_markup: adminMenu(),
      }
    );

    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>📋 ЗАЯВКА #${row.id}</b>\n\n` +
        `👤 ${esc(row.name)}\n` +
        `📞 ${esc(row.phone)}\n` +
        `👷 Опыт: ${esc(
          row.experience
        )}\n` +
        `💼 ${esc(
          row.title ||
            row.profession ||
            "Вакансия"
        )}\n` +
        `📍 ${esc(
          row.city ||
            row.location ||
            ""
        )}\n` +
        `📌 Статус: ${esc(
          row.status || "new"
        )}`,
      {
        reply_markup: inlineKeyboard([
          [
            {
              text: "✅ Принять",
              callback_data:
                `app_accept_${row.id}`,
            },
            {
              text: "❌ Отклонить",
              callback_data:
                `app_reject_${row.id}`,
            },
          ],
        ]),
      }
    );
  }
}

async function showAdminVacancies(chatId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "📢 Вакансий пока нет.",
      {
        reply_markup: adminMenu(),
      }
    );

    return;
  }

  for (const vacancy of rows) {
    await sendMessage(
      chatId,
      vacancyText(vacancy) +
        `\n\n📌 Статус: <b>${esc(
          vacancy.status || "draft"
        )}</b>`,
      {
        reply_markup: inlineKeyboard([
          [
            {
              text: "📢 Опубликовать",
              callback_data:
                `publish_${vacancy.id}`,
            },
          ],
          [
            {
              text: "❌ Закрыть",
              callback_data:
                `close_${vacancy.id}`,
            },
          ],
        ]),
      }
    );
  }
}

/* =========================
   CREATE VACANCY
========================= */

async function startCreateVacancy(chatId) {
  await saveSession(
    chatId,
    "vacancy_title",
    {}
  );

  await sendMessage(
    chatId,
    `<b>➕ СОЗДАНИЕ ВАКАНСИИ</b>\n\n` +
      `1️⃣ Название вакансии:`,
    {
      reply_markup: keyboard([
        [
          {
            text: "❌ Отмена",
          },
        ],
      ]),
    }
  );
}

async function handleVacancyStep(
  chatId,
  value,
  session
) {
  const data = session.data || {};

  switch (session.state) {
    case "vacancy_title":
      data.title = value;

      await saveSession(
        chatId,
        "vacancy_profession",
        data
      );

      await sendMessage(
        chatId,
        "2️⃣ Профессия:"
      );

      return;

    case "vacancy_profession":
      data.profession = value;

      await saveSession(
        chatId,
        "vacancy_location",
        data
      );

      await sendMessage(
        chatId,
        "3️⃣ Город / объект:"
      );

      return;

    case "vacancy_location":
      data.location = value;

      await saveSession(
        chatId,
        "vacancy_experience",
        data
      );

      await sendMessage(
        chatId,
        "4️⃣ Требования по опыту:"
      );

      return;

    case "vacancy_experience":
      data.experience = value;

      await saveSession(
        chatId,
        "vacancy_payment",
        data
      );

      await sendMessage(
        chatId,
        "5️⃣ Оплата:"
      );

      return;

    case "vacancy_payment":
      data.payment = value;

      await saveSession(
        chatId,
        "vacancy_conditions",
        data
      );

      await sendMessage(
        chatId,
        "6️⃣ Условия:"
      );

      return;

    case "vacancy_conditions":
      data.conditions = value;

      await saveSession(
        chatId,
        "vacancy_shift",
        data
      );

      await sendMessage(
        chatId,
        "7️⃣ Вахта? Например: Да / Нет:"
      );

      return;

    case "vacancy_shift": {
      data.shift = value;

      const rows = await sql`
        INSERT INTO vacancies
          (
            title,
            profession,
            city,
            location,
            experience,
            payment,
            conditions,
            shift,
            status,
            updated_at
          )
        VALUES
          (
            ${data.title || ""},
            ${data.profession || ""},
            ${data.location || ""},
            ${data.location || ""},
            ${data.experience || ""},
            ${data.payment || ""},
            ${data.conditions || ""},
            ${data.shift || ""},
            'draft',
            NOW()
          )
        RETURNING *
      `;

      await clearSession(chatId);

      await sendMessage(
        chatId,
        `<b>✅ ВАКАНСИЯ СОЗДАНА</b>\n\n` +
          `${vacancyText(rows[0])}\n\n` +
          `Теперь её можно опубликовать в канал.`,
        {
          reply_markup:
            inlineKeyboard([
              [
                {
                  text:
                    "📢 Опубликовать",
                  callback_data:
                    `publish_${rows[0].id}`,
                },
              ],
            ]),
        }
      );

      return;
    }
  }
}
