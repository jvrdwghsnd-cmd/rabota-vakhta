import { neon } from "@neondatabase/serverless";

const BOT_TOKEN = process.env.BOT_TOKEN;
const POSTGRES_URL = process.env.POSTGRES_URL;
const ADMIN_ID = process.env.ADMIN_ID || "";
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "@vakhtovyk";
const BOT_USERNAME =
  process.env.BOT_USERNAME || "VakhtovykHelperBot";

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

/* =========================
   TELEGRAM
========================= */

async function telegram(method, data = {}) {
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

  return await response.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function answerCallbackQuery(id, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: false,
  });
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_ID);
}

/* =========================
   DATABASE
========================= */

async function initDatabase() {
  await sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id BIGINT PRIMARY KEY,
      step TEXT,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      payment TEXT,
      conditions TEXT,
      application_vacancy_id BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT,
      username TEXT,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS vacancies (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT,
      title TEXT,
      profession TEXT,
      city TEXT,
      experience TEXT,
      payment TEXT,
      conditions TEXT,
      shift TEXT,
      phone TEXT,
      published BOOLEAN DEFAULT FALSE,
      closed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
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

  /*
    Безопасно добавляем дополнительные поля,
    если их ещё нет.
  */

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS channel_message_id BIGINT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
  `;
}

/* =========================
   KEYBOARDS
========================= */

function mainKeyboard(chatId) {
  const keyboard = [
    [
      { text: "👷 Я ищу работу" },
      { text: "📋 Разместить вакансию" },
    ],
    [
      { text: "🏢 Работодатель" },
      { text: "📞 Администратор" },
    ],
  ];

  if (isAdmin(chatId)) {
    keyboard.push([
      { text: "🔐 Админ-панель" },
    ]);
  }

  return {
    keyboard,
    resize_keyboard: true,
  };
}

function adminKeyboard() {
  return {
    keyboard: [
      [
        { text: "👷 Все специалисты" },
        { text: "📋 Все вакансии" },
      ],
      [
        { text: "📩 Все отклики" },
        { text: "📊 Статистика" },
      ],
      [
        { text: "🔎 Поиск специалиста" },
      ],
      [
        { text: "📢 Опубликовать вакансию" },
      ],
      [
        { text: "🏠 Главное меню" },
      ],
    ],
    resize_keyboard: true,
  };
}

function employerKeyboard() {
  return {
    keyboard: [
      [
        { text: "➕ Создать вакансию" },
        { text: "📋 Мои вакансии" },
      ],
      [
        { text: "📩 Отклики" },
      ],
      [
        { text: "🏠 Главное меню" },
      ],
    ],
    resize_keyboard: true,
  };
}

/* =========================
   SESSION
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

async function setSession(chatId, data) {
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
      payment,
      conditions,
      application_vacancy_id,
      updated_at
    )
    VALUES (
      ${chatId},
      ${data.step || null},
      ${data.name || null},
      ${data.phone || null},
      ${data.profession || null},
      ${data.experience || null},
      ${data.city || null},
      ${data.shift || null},
      ${data.payment || null},
      ${data.conditions || null},
      ${data.application_vacancy_id || null},
      NOW()
    )
    ON CONFLICT (chat_id)
    DO UPDATE SET
      step = EXCLUDED.step,
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      profession = EXCLUDED.profession,
      experience = EXCLUDED.experience,
      city = EXCLUDED.city,
      shift = EXCLUDED.shift,
      payment = EXCLUDED.payment,
      conditions = EXCLUDED.conditions,
      application_vacancy_id = EXCLUDED.application_vacancy_id,
      updated_at = NOW()
  `;
}

async function clearSession(chatId) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${chatId}
  `;
}

async function mainMenu(chatId, text = "Главное меню") {
  return sendMessage(chatId, text, {
    reply_markup: mainKeyboard(chatId),
  });
}

/* =========================
   VACANCY CARD
========================= */

function vacancyText(vacancy) {
  return (
    `🔥 <b>${esc(vacancy.title)}</b>\n\n` +
    `🧰 <b>Профессия:</b> ${esc(vacancy.profession)}\n` +
    `📍 <b>Город:</b> ${esc(vacancy.city)}\n` +
    `⏱ <b>Опыт:</b> ${esc(vacancy.experience)}\n` +
    `💰 <b>Оплата:</b> ${esc(vacancy.payment)}\n` +
    `🏠 <b>Условия:</b> ${esc(vacancy.conditions)}\n` +
    `🔄 <b>График:</b> ${esc(vacancy.shift)}\n\n` +
    `📞 <b>Контакт:</b> ${esc(vacancy.phone)}\n\n` +
    `Работа | Вахта\n` +
    `Вакансии, поиск и подбор рабочих специалистов`
  );
}

function vacancyInlineKeyboard(vacancyId) {
  return {
    inline_keyboard: [
      [
        {
          text: "📩 Откликнуться",
          url: `https://t.me/${BOT_USERNAME}?start=vacancy_${vacancyId}`,
        },
      ],
      [
        {
          text: "📢 Канал «Работа | Вахта»",
          url: `https://t.me/${String(
            CHANNEL_USERNAME
          ).replace("@", "")}`,
        },
      ],
    ],
  };
}

/* =========================
   START
========================= */

async function handleStart(message) {
  const chatId = message.chat.id;
  const args = String(message.text || "").split(" ")[1];

  if (args && args.startsWith("vacancy_")) {
    const vacancyId = Number(
      args.replace("vacancy_", "")
    );

    if (!Number.isFinite(vacancyId)) {
      return sendMessage(
        chatId,
        "❌ Некорректный номер вакансии."
      );
    }

    const rows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacancyId}
      AND closed = FALSE
      LIMIT 1
    `;

    const vacancy = rows[0];

    if (!vacancy) {
      return sendMessage(
        chatId,
        "❌ Вакансия не найдена или уже закрыта."
      );
    }

    await setSession(chatId, {
      step: "application_name",
      application_vacancy_id: vacancyId,
    });

    return sendMessage(
      chatId,
      `📩 <b>Отклик на вакансию</b>\n\n${vacancyText(
        vacancy
      )}\n\nВведите ваше имя и фамилию:`,
      {
        parse_mode: "HTML",
      }
    );
  }

  await clearSession(chatId);

  return sendMessage(
    chatId,
    "👋 <b>Добро пожаловать в «Работа | Вахта».</b>\n\nЗдесь можно найти работу, разместить вакансию и оставить анкету специалиста.",
    {
      parse_mode: "HTML",
      reply_markup: mainKeyboard(chatId),
    }
  );
}

/* =========================
   CANDIDATE
========================= */

async function candidateFlow(message, session) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

  if (!value) {
    return sendMessage(
      chatId,
      "Пожалуйста, отправьте информацию текстом."
    );
  }

  if (session.step === "candidate_name") {
    await setSession(chatId, {
      ...session,
      step: "candidate_phone",
      name: value,
    });

    return sendMessage(
      chatId,
      "📞 Отправьте номер телефона:"
    );
  }

  if (session.step === "candidate_phone") {
    await setSession(chatId, {
      ...session,
      step: "candidate_profession",
      phone: value,
    });

    return sendMessage(
      chatId,
      "🧰 Какая у вас профессия?"
    );
  }

  if (session.step === "candidate_profession") {
    await setSession(chatId, {
      ...session,
      step: "candidate_experience",
      profession: value,
    });

    return sendMessage(
      chatId,
      "⏱️ Сколько лет опыта?"
    );
  }

  if (session.step === "candidate_experience") {
    await setSession(chatId, {
      ...session,
      step: "candidate_city",
      experience: value,
    });

    return sendMessage(
      chatId,
      "📍 В каком городе вы находитесь?"
    );
  }

  if (session.step === "candidate_city") {
    await setSession(chatId, {
      ...session,
      step: "candidate_shift",
      city: value,
    });

    return sendMessage(
      chatId,
      "🔄 Готовы работать вахтой?\n\nНапишите Да или Нет."
    );
  }

  if (session.step === "candidate_shift") {
    const updated = {
      ...session,
      shift: value,
    };

    await sql`
      INSERT INTO candidates (
        chat_id,
        username,
        name,
        phone,
        profession,
        experience,
        city,
        shift,
        updated_at
      )
      VALUES (
        ${chatId},
        ${message.from?.username || null},
        ${updated.name},
        ${updated.phone},
        ${updated.profession},
        ${updated.experience},
        ${updated.city},
        ${updated.shift},
        NOW()
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ <b>Анкета сохранена!</b>\n\nВаш профиль добавлен в базу специалистов.",
      {
        parse_mode: "HTML",
      }
    );

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `🆕 <b>Новая анкета специалиста</b>\n\n` +
          `👤 ${esc(updated.name)}\n` +
          `📞 ${esc(updated.phone)}\n` +
          `🧰 ${esc(updated.profession)}\n` +
          `⏱ ${esc(updated.experience)}\n` +
          `📍 ${esc(updated.city)}\n` +
          `🔄 Вахта: ${esc(updated.shift)}`,
        {
          parse_mode: "HTML",
        }
      );
    }

    return mainMenu(chatId);
  }
}

/* =========================
   VACANCY CREATION
========================= */

async function vacancyFlow(message, session) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

  if (!value) {
    return sendMessage(
      chatId,
      "Пожалуйста, отправьте информацию текстом."
    );
  }

  if (session.step === "vacancy_title") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_profession",
      name: value,
    });

    return sendMessage(
      chatId,
      "🧰 Какая профессия требуется?"
    );
  }

  if (session.step === "vacancy_profession") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_city",
      profession: value,
    });

    return sendMessage(
      chatId,
      "📍 Где находится объект?"
    );
  }

  if (session.step === "vacancy_city") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_experience",
      city: value,
    });

    return sendMessage(
      chatId,
      "⏱️ Какой требуется опыт?"
    );
  }

  if (session.step === "vacancy_experience") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_payment",
      experience: value,
    });

    return sendMessage(
      chatId,
      "💰 Укажите оплату:"
    );
  }

  if (session.step === "vacancy_payment") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_conditions",
      payment: value,
    });

    return sendMessage(
      chatId,
      "🏠 Укажите условия: проживание, питание, проезд и т.д."
    );
  }

  if (session.step === "vacancy_conditions") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_shift",
      conditions: value,
    });

    return sendMessage(
      chatId,
      "🔄 Укажите график / вахту:"
    );
  }

  if (session.step === "vacancy_shift") {
    await setSession(chatId, {
      ...session,
      step: "vacancy_phone",
      shift: value,
    });

    return sendMessage(
      chatId,
      "📞 Телефон работодателя:"
    );
  }

  if (session.step === "vacancy_phone") {
    const updated = {
      ...session,
      phone: value,
    };

    const rows = await sql`
      INSERT INTO vacancies (
        chat_id,
        title,
        profession,
        city,
        experience,
        payment,
        conditions,
        shift,
        phone,
        published,
        closed
      )
      VALUES (
        ${chatId},
        ${updated.name},
        ${updated.profession},
        ${updated.city},
        ${updated.experience},
        ${updated.payment},
        ${updated.conditions},
        ${updated.shift},
        ${updated.phone},
        FALSE,
        FALSE
      )
      RETURNING *
    `;

    const vacancy = rows[0];

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ <b>Вакансия №${vacancy.id} сохранена.</b>\n\nОна отправлена администратору на проверку.`,
      {
        parse_mode: "HTML",
        reply_markup: employerKeyboard(),
      }
    );

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `📋 <b>Новая вакансия №${vacancy.id}</b>\n\n${vacancyText(
          vacancy
        )}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📢 Опубликовать",
                  callback_data: `publish:${vacancy.id}`,
                },
              ],
              [
                {
                  text: "❌ Закрыть",
                  callback_data: `close:${vacancy.id}`,
                },
              ],
            ],
          },
        }
      );
    }
  }
}

/* =========================
   APPLICATION
========================= */

async function applicationFlow(message, session) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

  if (session.step === "application_name") {
    await setSession(chatId, {
      ...session,
      step: "application_phone",
      name: value,
    });

    return sendMessage(
      chatId,
      "📞 Ваш номер телефона:"
    );
  }

  if (session.step === "application_phone") {
    await setSession(chatId, {
      ...session,
      step: "application_experience",
      phone: value,
    });

    return sendMessage(
      chatId,
      "⏱️ Укажите ваш опыт работы:"
    );
  }

  if (session.step === "application_experience") {
    const updated = {
      ...session,
      experience: value,
    };

    const vacancyRows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${updated.application_vacancy_id}
      AND closed = FALSE
      LIMIT 1
    `;

    const vacancy = vacancyRows[0];

    if (!vacancy) {
      await clearSession(chatId);

      return sendMessage(
        chatId,
        "❌ Вакансия уже закрыта."
      );
    }

    const duplicate = await sql`
      SELECT id
      FROM applications
      WHERE vacancy_id = ${vacancy.id}
      AND candidate_chat_id = ${chatId}
      LIMIT 1
    `;

    if (duplicate.length) {
      await clearSession(chatId);

      return mainMenu(
        chatId,
        "ℹ️ Вы уже откликались на эту вакансию."
      );
    }

    const applicationRows = await sql`
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
        ${chatId},
        ${updated.name},
        ${updated.phone},
        ${updated.experience},
        ${message.from?.username || null},
        'new'
      )
      RETURNING id
    `;

    const applicationId =
      applicationRows[0]?.id;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ <b>Отклик отправлен!</b>\n\nЗаявка №${applicationId}\nРаботодатель получил ваши данные.`,
      {
        parse_mode: "HTML",
      }
    );

    if (vacancy.chat_id) {
      await sendMessage(
        vacancy.chat_id,
        `📩 <b>Новый отклик №${applicationId}</b>\n\n` +
          `Вакансия: ${esc(vacancy.title)}\n` +
          `Имя: ${esc(updated.name)}\n` +
          `Телефон: ${esc(updated.phone)}\n` +
          `Опыт: ${esc(updated.experience)}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🤝 Пригласить",
                  callback_data: `invite:${applicationId}`,
                },
                {
                  text: "❌ Отказать",
                  callback_data: `reject:${applicationId}`,
                },
              ],
            ],
          },
        }
      );
    }

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `📩 <b>Новый отклик №${applicationId}</b>\n\n` +
          `Вакансия: ${esc(vacancy.title)}\n` +
          `Имя: ${esc(updated.name)}\n` +
          `Телефон: ${esc(updated.phone)}\n` +
          `Опыт: ${esc(updated.experience)}`,
        {
          parse_mode: "HTML",
        }
      );
    }

    return mainMenu(chatId);
  }
}

/* =========================
   PUBLISH VACANCY
========================= */

async function publishVacancy(vacancyId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
    AND closed = FALSE
    LIMIT 1
  `;

  const vacancy = rows[0];

  if (!vacancy) {
    return {
      ok: false,
      message: "Вакансия не найдена или закрыта.",
    };
  }

  const result = await telegram(
    "sendMessage",
    {
      chat_id: CHANNEL_USERNAME,
      text: vacancyText(vacancy),
      parse_mode: "HTML",
      reply_markup:
        vacancyInlineKeyboard(vacancy.id),
    }
  );

  if (!result.ok) {
    return {
      ok: false,
      message:
        result.description ||
        "Telegram не смог опубликовать вакансию.",
    };
  }

  await sql`
    UPDATE vacancies
    SET
      published = TRUE,
      published_at = NOW(),
      channel_message_id = ${result.result?.message_id || null}
    WHERE id = ${vacancyId}
  `;

  return {
    ok: true,
    message: "Вакансия опубликована.",
  };
}

/* =========================
   ADMIN: SPECIALISTS
========================= */

async function showAllCandidates(chatId) {
  const rows = await sql`
    SELECT *
    FROM candidates
    ORDER BY created_at DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "👷 В базе пока нет специалистов."
    );
  }

  let text =
    "👷 <b>СПЕЦИАЛИСТЫ</b>\n\n";

  for (const c of rows) {
    text +=
      `#${c.id} — <b>${esc(c.name)}</b>\n` +
      `🧰 ${esc(c.profession)}\n` +
      `⏱ ${esc(c.experience)}\n` +
      `📍 ${esc(c.city)}\n` +
      `📞 ${esc(c.phone)}\n` +
      `🔄 Вахта: ${esc(c.shift)}\n\n`;
  }

  return sendMessage(chatId, text, {
    parse_mode: "HTML",
  });
}

/* =========================
   ADMIN: VACANCIES
========================= */

async function showAllVacancies(chatId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    ORDER BY created_at DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "📋 Вакансий пока нет."
    );
  }

  for (const vacancy of rows) {
    const status = vacancy.closed
      ? "🔴 Закрыта"
      : vacancy.published
      ? "🟢 Опубликована"
      : "🟡 На проверке";

    await sendMessage(
      chatId,
      `${vacancyText(vacancy)}\n\n<b>Статус:</b> ${status}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            ...(!vacancy.published &&
            !vacancy.closed
              ? [
                  [
                    {
                      text: "📢 Опубликовать",
                      callback_data: `publish:${vacancy.id}`,
                    },
                  ],
                ]
              : []),
            ...(!vacancy.closed
              ? [
                  [
                    {
                      text: "🔒 Закрыть",
                      callback_data: `close:${vacancy.id}`,
                    },
                  ],
                ]
              : []),
          ],
        },
      }
    );
  }
}

/* =========================
   ADMIN: APPLICATIONS
========================= */

async function showAllApplications(chatId) {
  const rows = await sql`
    SELECT
      a.*,
      v.title AS vacancy_title
    FROM applications a
    LEFT JOIN vacancies v
      ON v.id = a.vacancy_id
    ORDER BY a.created_at DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "📩 Откликов пока нет."
    );
  }

  for (const a of rows) {
    await sendMessage(
      chatId,
      `📩 <b>Отклик №${a.id}</b>\n\n` +
        `📋 Вакансия: ${esc(a.vacancy_title)}\n` +
        `👤 ${esc(a.name)}\n` +
        `📞 ${esc(a.phone)}\n` +
        `⏱ ${esc(a.experience)}\n` +
        `📌 Статус: ${esc(a.status)}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🤝 Пригласить",
                callback_data: `invite:${a.id}`,
              },
              {
                text: "❌ Отказать",
                callback_data: `reject:${a.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

/* =========================
   ADMIN: SEARCH
========================= */

async function searchCandidates(chatId, query) {
  const q = `%${query}%`;

  const rows = await sql`
    SELECT *
    FROM candidates
    WHERE
      profession ILIKE ${q}
      OR city ILIKE ${q}
      OR experience ILIKE ${q}
      OR name ILIKE ${q}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      `🔎 По запросу «${query}» ничего не найдено.`
    );
  }

  let text =
    `🔎 <b>Результаты поиска: ${esc(
      query
    )}</b>\n\n`;

  for (const c of rows) {
    text +=
      `👤 <b>${esc(c.name)}</b>\n` +
      `🧰 ${esc(c.profession)}\n` +
      `📍 ${esc(c.city)}\n` +
      `⏱ ${esc(c.experience)}\n` +
      `📞 ${esc(c.phone)}\n\n`;
  }

  return sendMessage(chatId, text, {
    parse_mode: "HTML",
  });
}

/* =========================
   EMPLOYER: VACANCIES
========================= */

async function showEmployerVacancies(chatId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "📋 У вас пока нет вакансий."
    );
  }

  for (const vacancy of rows) {
    const status = vacancy.closed
      ? "🔴 Закрыта"
      : vacancy.published
      ? "🟢 Опубликована"
      : "🟡 На проверке";

    await sendMessage(
      chatId,
      `${vacancyText(vacancy)}\n\n<b>${status}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            ...(!vacancy.closed
              ? [
                  [
                    {
                      text: "📩 Отклики",
                      callback_data: `vacapps:${vacancy.id}`,
                    },
                  ],
                  [
                    {
                      text: "🔒 Закрыть",
                      callback_data: `close:${vacancy.id}`,
                    },
                  ],
                ]
              : []),
          ],
        },
      }
    );
  }
}

/* =========================
   EMPLOYER APPLICATIONS
========================= */

async function showEmployerApplications(chatId) {
  const rows = await sql`
    SELECT
      a.*,
      v.title AS vacancy_title
    FROM applications a
    JOIN vacancies v
      ON v.id = a.vacancy_id
    WHERE v.chat_id = ${chatId}
    ORDER BY a.created_at DESC
    LIMIT 50
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "📩 У вас пока нет откликов."
    );
  }

  for (const a of rows) {
    await sendMessage(
      chatId,
      `📩 <b>Отклик №${a.id}</b>\n\n` +
        `📋 ${esc(a.vacancy_title)}\n` +
        `👤 ${esc(a.name)}\n` +
        `📞 ${esc(a.phone)}\n` +
        `⏱ ${esc(a.experience)}\n` +
        `📌 ${esc(a.status)}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🤝 Пригласить",
                callback_data: `invite:${a.id}`,
              },
              {
                text: "❌ Отказать",
                callback_data: `reject:${a.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

/* =========================
   VACANCY APPLICATIONS
========================= */

async function showVacancyApplications(
  chatId,
  vacancyId
) {
  const vacancyRows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
    LIMIT 1
  `;

  const vacancy = vacancyRows[0];

  if (!vacancy || String(vacancy.chat_id) !== String(chatId)) {
    return sendMessage(
      chatId,
      "❌ Доступ запрещён."
    );
  }

  const rows = await sql`
    SELECT *
    FROM applications
    WHERE vacancy_id = ${vacancyId}
    ORDER BY created_at DESC
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "📩 На эту вакансию пока нет откликов."
    );
  }

  for (const a of rows) {
    await sendMessage(
      chatId,
      `📩 <b>Отклик №${a.id}</b>\n\n` +
        `👤 ${esc(a.name)}\n` +
        `📞 ${esc(a.phone)}\n` +
        `⏱ ${esc(a.experience)}\n` +
        `📌 ${esc(a.status)}`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🤝 Пригласить",
                callback_data: `invite:${a.id}`,
              },
              {
                text: "❌ Отказать",
                callback_data: `reject:${a.id}`,
              },
            ],
          ],
        },
      }
    );
  }
}

/* =========================
   STATUS
========================= */

async function changeApplicationStatus(
  applicationId,
  status
) {
  const rows = await sql`
    UPDATE applications
    SET status = ${status}
    WHERE id = ${applicationId}
    RETURNING *
  `;

  const application = rows[0];

  if (!application) {
    return {
      ok: false,
      message: "Отклик не найден.",
    };
  }

  const vacancyRows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${application.vacancy_id}
    LIMIT 1
  `;

  const vacancy = vacancyRows[0];

  if (status === "invited") {
    await sendMessage(
      application.candidate_chat_id,
      `🤝 <b>Вас приглашают на работу!</b>\n\n` +
        `Вакансия: ${esc(
          vacancy?.title || "Вакансия"
        )}\n` +
        `Работодатель получил ваши контакты и готов продолжить общение.\n\n` +
        `📞 Контакт: ${esc(
          vacancy?.phone || "уточняется"
        )}`,
      {
        parse_mode: "HTML",
      }
    );
  }

  if (status === "rejected") {
    await sendMessage(
      application.candidate_chat_id,
      `ℹ️ <b>Изменение по отклику</b>\n\n` +
        `Вакансия: ${esc(
          vacancy?.title || "Вакансия"
        )}\n\n` +
        `Работодатель пока не выбрал вашу кандидатуру.\n` +
        `Не останавливайтесь — новые вакансии появляются регулярно.`,
      {
        parse_mode: "HTML",
      }
    );
  }

  return {
    ok: true,
    message:
      status === "invited"
        ? "Кандидат приглашён."
        : "Кандидату отправлено уведомление.",
  };
}

/* =========================
   CALLBACKS
========================= */

async function handleCallbackQuery(callback) {
  const chatId = callback.from.id;
  const data = String(callback.data || "");

  await answerCallbackQuery(
    callback.id,
    "Обрабатываю..."
  );

  if (data.startsWith("publish:")) {
    if (!isAdmin(chatId)) {
      return;
    }

    const vacancyId = Number(
      data.split(":")[1]
    );

    const result =
      await publishVacancy(vacancyId);

    return sendMessage(
      chatId,
      result.ok
        ? `✅ Вакансия №${vacancyId} опубликована в канале ${CHANNEL_USERNAME}.`
        : `❌ ${result.message}`
    );
  }

  if (data.startsWith("close:")) {
    const vacancyId = Number(
      data.split(":")[1]
    );

    const rows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacancyId}
      LIMIT 1
    `;

    const vacancy = rows[0];

    if (!vacancy) {
      return sendMessage(
        chatId,
        "❌ Вакансия не найдена."
      );
    }

    if (
      !isAdmin(chatId) &&
      String(vacancy.chat_id) !== String(chatId)
    ) {
      return sendMessage(
        chatId,
        "❌ У вас нет доступа к этой вакансии."
      );
    }

    await sql`
      UPDATE vacancies
      SET closed = TRUE
      WHERE id = ${vacancyId}
    `;

    return sendMessage(
      chatId,
      `🔒 Вакансия №${vacancyId} закрыта.`
    );
  }

  if (data.startsWith("invite:")) {
    const applicationId = Number(
      data.split(":")[1]
    );

    const rows = await sql`
      SELECT a.*, v.chat_id AS employer_chat_id
      FROM applications a
      JOIN vacancies v
        ON v.id = a.vacancy_id
      WHERE a.id = ${applicationId}
      LIMIT 1
    `;

    const application = rows[0];

    if (!application) {
      return sendMessage(
        chatId,
        "❌ Отклик не найден."
      );
    }

    if (
      !isAdmin(chatId) &&
      String(application.employer_chat_id) !==
        String(chatId)
    ) {
      return sendMessage(
        chatId,
        "❌ У вас нет доступа к этому отклику."
      );
    }

    const result =
      await changeApplicationStatus(
        applicationId,
        "invited"
      );

    return sendMessage(
      chatId,
      `🤝 ${result.message}`
    );
  }

  if (data.startsWith("reject:")) {
    const applicationId = Number(
      data.split(":")[1]
    );

    const rows = await sql`
      SELECT a.*, v.chat_id AS employer_chat_id
      FROM applications a
      JOIN vacancies v
        ON v.id = a.vacancy_id
      WHERE a.id = ${applicationId}
      LIMIT 1
    `;

    const application = rows[0];

    if (!application) {
      return sendMessage(
        chatId,
        "❌ Отклик не найден."
      );
    }

    if (
      !isAdmin(chatId) &&
      String(application.employer_chat_id) !==
        String(chatId)
    ) {
      return sendMessage(
        chatId,
        "❌ У вас нет доступа к этому отклику."
      );
    }

    const result =
      await changeApplicationStatus(
        applicationId,
        "rejected"
      );

    return sendMessage(
      chatId,
      `❌ ${result.message}`
    );
  }

  if (data.startsWith("vacapps:")) {
    const vacancyId = Number(
      data.split(":")[1]
    );

    return showVacancyApplications(
      chatId,
      vacancyId
    );
  }
}

/* =========================
   ADMIN MENU
========================= */

async function adminAction(
  message,
  value
) {
  const chatId = message.chat.id;

  if (!isAdmin(chatId)) {
    return mainMenu(chatId);
  }

  if (value === "👷 Все специалисты") {
    return showAllCandidates(chatId);
  }

  if (value === "📋 Все вакансии") {
    return showAllVacancies(chatId);
  }

  if (value === "📩 Все отклики") {
    return showAllApplications(chatId);
  }

  if (value === "📢 Опубликовать вакансию") {
    const rows = await sql`
      SELECT *
      FROM vacancies
      WHERE closed = FALSE
      AND published = FALSE
      ORDER BY created_at DESC
      LIMIT 20
    `;

    if (!rows.length) {
      return sendMessage(
        chatId,
        "📢 Нет вакансий, ожидающих публикации."
      );
    }

    for (const vacancy of rows) {
      await sendMessage(
        chatId,
        `📢 <b>Вакансия №${vacancy.id}</b>\n\n${vacancyText(
          vacancy
        )}`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "📢 Опубликовать",
                  callback_data: `publish:${vacancy.id}`,
                },
              ],
              [
                {
                  text: "🔒 Закрыть",
                  callback_data: `close:${vacancy.id}`,
                },
              ],
            ],
          },
        }
      );
    }

    return;
  }

  if (value === "🔎 Поиск специалиста") {
    await setSession(chatId, {
      step: "admin_search",
    });

    return sendMessage(
      chatId,
      "🔎 Введите профессию, город, имя или опыт для поиска.\n\nНапример:\nМонтажник\nМосква\nСварщик"
    );
  }

  if (value === "📊 Статистика") {
    const candidates =
      await sql`SELECT COUNT(*)::int AS n FROM candidates`;

    const vacancies =
      await sql`SELECT COUNT(*)::int AS n FROM vacancies`;

    const published =
      await sql`
        SELECT COUNT(*)::int AS n
        FROM vacancies
        WHERE published = TRUE
        AND closed = FALSE
      `;

    const closed =
      await sql`
        SELECT COUNT(*)::int AS n
        FROM vacancies
        WHERE closed = TRUE
      `;

    const applications =
      await sql`SELECT COUNT(*)::int AS n FROM applications`;

    const newApplications =
      await sql`
        SELECT COUNT(*)::int AS n
        FROM applications
        WHERE status = 'new'
      `;

    const invited =
      await sql`
        SELECT COUNT(*)::int AS n
        FROM applications
        WHERE status = 'invited'
      `;

    return sendMessage(
      chatId,
      `📊 <b>СТАТИСТИКА «РАБОТА | ВАХТА»</b>\n\n` +
        `👷 Специалистов: <b>${candidates[0].n}</b>\n` +
        `📋 Всего вакансий: <b>${vacancies[0].n}</b>\n` +
        `🟢 Активных: <b>${published[0].n}</b>\n` +
        `🔴 Закрытых: <b>${closed[0].n}</b>\n` +
        `📩 Всего откликов: <b>${applications[0].n}</b>\n` +
        `🆕 Новых откликов: <b>${newApplications[0].n}</b>\n` +
        `🤝 Приглашений: <b>${invited[0].n}</b>`,
      {
        parse_mode: "HTML",
      }
    );
  }
}

/* =========================
   MESSAGE HANDLER
========================= */

async function handleMessage(message) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

  if (
    value === "/start" ||
    value.startsWith("/start ")
  ) {
    return handleStart(message);
  }

  if (value === "/id") {
    return sendMessage(
      chatId,
      `Ваш Telegram ID: ${chatId}`
    );
  }

  if (value === "🏠 Главное меню") {
    await clearSession(chatId);
    return mainMenu(chatId);
  }

  /* ADMIN */

  if (
    isAdmin(chatId) &&
    [
      "👷 Все специалисты",
      "📋 Все вакансии",
      "📩 Все отклики",
      "📊 Статистика",
      "🔎 Поиск специалиста",
      "📢 Опубликовать вакансию",
    ].includes(value)
  ) {
    return adminAction(message, value);
  }

  if (value === "🔐 Админ-панель") {
    if (!isAdmin(chatId)) {
      return mainMenu(chatId);
    }

    return sendMessage(
      chatId,
      "🔐 <b>АДМИН-ПАНЕЛЬ</b>\n\nВыберите раздел:",
      {
        parse_mode: "HTML",
        reply_markup: adminKeyboard(),
      }
    );
  }

  /* CANDIDATE */

  if (value === "👷 Я ищу работу") {
    await clearSession(chatId);

    await setSession(chatId, {
      step: "candidate_name",
    });

    return sendMessage(
      chatId,
      "👷 <b>АНКЕТА СПЕЦИАЛИСТА</b>\n\nВведите имя и фамилию:",
      {
        parse_mode: "HTML",
      }
    );
  }

  /* EMPLOYER */

  if (value === "🏢 Работодатель") {
    await clearSession(chatId);

    return sendMessage(
      chatId,
      "🏢 <b>КАБИНЕТ РАБОТОДАТЕЛЯ</b>\n\nСоздавайте вакансии и получайте отклики специалистов.",
      {
        parse_mode: "HTML",
        reply_markup: employerKeyboard(),
      }
    );
  }

  if (
    value === "📋 Разместить вакансию" ||
    value === "➕ Создать вакансию"
  ) {
    await clearSession(chatId);

    await setSession(chatId, {
      step: "vacancy_title",
    });

    return sendMessage(
      chatId,
      "📋 <b>СОЗДАНИЕ ВАКАНСИИ</b>\n\nВведите название вакансии:",
      {
        parse_mode: "HTML",
      }
    );
  }

  if (value === "📋 Мои вакансии") {
    return showEmployerVacancies(chatId);
  }

  if (value === "📩 Отклики") {
    return showEmployerApplications(chatId);
  }

  if (value === "📞 Администратор") {
    return sendMessage(
      chatId,
      "📞 <b>Администратор</b>\n\nПо вопросам сотрудничества обратитесь к администратору канала.",
      {
        parse_mode: "HTML",
      }
    );
  }

  /* SESSION */

  const session = await getSession(chatId);

  if (session) {
    if (session.step === "admin_search") {
      await clearSession(chatId);

      if (!isAdmin(chatId)) {
        return mainMenu(chatId);
      }

      return searchCandidates(
        chatId,
        value
      );
    }

    if (
      session.step?.startsWith("candidate_")
    ) {
      return candidateFlow(
        message,
        session
      );
    }

    if (
      session.step?.startsWith("vacancy_")
    ) {
      return vacancyFlow(
        message,
        session
      );
    }

    if (
      session.step?.startsWith("application_")
    ) {
      return applicationFlow(
        message,
        session
      );
    }
  }

  return mainMenu(
    chatId,
    "Выберите нужный раздел 👇"
  );
}

/* =========================
   HANDLER
========================= */

export default async function handler(
  req,
  res
) {
  try {
    if (req.method === "GET") {
      if (!BOT_TOKEN) {
        return res.status(500).json({
          ok: false,
          error: "BOT_TOKEN is not configured",
        });
      }

      if (req.query?.health === "1") {
        return res.status(200).json({
          ok: true,
          service: "Работа | Вахта",
          status: "online",
          database: Boolean(POSTGRES_URL),
          bot_username: BOT_USERNAME,
          channel: CHANNEL_USERNAME,
        });
      }

      if (req.query?.setup === "1") {
        const host = req.headers.host;

        const protocol =
          req.headers["x-forwarded-proto"] ||
          "https";

        const webhook =
          `${protocol}://${host}/api/bot`;

        const result =
          await telegram(
            "setWebhook",
            {
              url: webhook,
              allowed_updates: [
                "message",
                "callback_query",
              ],
            }
          );

        return res.status(200).json({
          ok: true,
          webhook,
          telegram: result,
        });
      }

      return res.status(200).json({
        ok: true,
        service: "Работа | Вахта",
        status: "online",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    if (!BOT_TOKEN) {
      throw new Error(
        "BOT_TOKEN is not configured"
      );
    }

    if (!POSTGRES_URL) {
      throw new Error(
        "POSTGRES_URL is not configured"
      );
    }

    await initDatabase();

    const update = req.body;

    if (update?.callback_query) {
      await handleCallbackQuery(
        update.callback_query
      );
    }

    if (update?.message) {
      await handleMessage(
        update.message
      );
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "BOT ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Unknown error",
    });
  }
}
