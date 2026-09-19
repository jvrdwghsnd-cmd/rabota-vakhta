const { neon } = require("@neondatabase/serverless");

const BOT_TOKEN = process.env.BOT_TOKEN;
const POSTGRES_URL = process.env.POSTGRES_URL;
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();

const CHANNEL_USERNAME = String(
  process.env.CHANNEL_USERNAME || "vakhtovyk"
).replace(/^@/, "");

const BOT_USERNAME = String(
  process.env.BOT_USERNAME || "VakhtovykHelperBot"
).replace(/^@/, "");

const WEBHOOK_URL =
  "https://rabota-vakhta-bot.vercel.app/api/bot";

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

/* =========================================================
   BASIC HELPERS
========================================================= */

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

function removeKeyboard() {
  return {
    remove_keyboard: true,
  };
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

/* =========================================================
   TELEGRAM API
========================================================= */

async function telegram(method, data = {}) {
  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is not configured"
    );
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
  options = {}
) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: message,
    parse_mode: "HTML",
    ...options,
  });
}

async function editMessage(
  chatId,
  messageId,
  message,
  options = {}
) {
  try {
    return await telegram(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: messageId,
        text: message,
        parse_mode: "HTML",
        ...options,
      }
    );
  } catch (error) {
    console.error(
      "editMessage error:",
      error.message
    );
    return null;
  }
}

async function answerCallback(
  callbackId,
  message = ""
) {
  try {
    return await telegram(
      "answerCallbackQuery",
      {
        callback_query_id: callbackId,
        ...(message
          ? { text: message }
          : {}),
      }
    );
  } catch (error) {
    console.error(
      "callback error:",
      error.message
    );
    return null;
  }
}

/* =========================================================
   DATABASE INITIALIZATION
   ВАЖНО:
   initDatabase вызывается только через ?setup=1
   и НЕ вызывается на каждый webhook.
========================================================= */

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
      chat_id BIGINT,
      title TEXT,
      profession TEXT,
      city TEXT,
      location TEXT,
      experience TEXT,
      payment TEXT,
      conditions TEXT,
      shift TEXT,
      phone TEXT,
      status TEXT DEFAULT 'draft',
      published BOOLEAN DEFAULT FALSE,
      published_at TIMESTAMPTZ,
      closed BOOLEAN DEFAULT FALSE,
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  /* -------- BOT SESSIONS -------- */

  await sql`
    ALTER TABLE bot_sessions
    ADD COLUMN IF NOT EXISTS state TEXT
  `;

  await sql`
    ALTER TABLE bot_sessions
    ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb
  `;

  await sql`
    ALTER TABLE bot_sessions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  /* -------- CANDIDATES -------- */

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS chat_id BIGINT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS name TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS phone TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS profession TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS experience TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS city TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS shift TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS telegram_username TEXT
  `;

  await sql`
    ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `;

  /* -------- VACANCIES -------- */

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS chat_id BIGINT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS title TEXT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS profession TEXT
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
    ADD COLUMN IF NOT EXISTS experience TEXT
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
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT FALSE
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS channel_message_id BIGINT
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await sql`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  /* -------- APPLICATIONS -------- */

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS vacancy_id BIGINT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS candidate_chat_id BIGINT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS name TEXT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS phone TEXT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS experience TEXT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS telegram_username TEXT
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `;

  await sql`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `;

  /* -------- COMPATIBILITY -------- */

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

  await sql`
    UPDATE vacancies
    SET published = TRUE
    WHERE published = FALSE
      AND status = 'published'
  `;

  await sql`
    UPDATE vacancies
    SET closed = TRUE
    WHERE closed = FALSE
      AND status = 'closed'
  `;

  /* -------- INDEXES -------- */

  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_chat_id
    ON candidates(chat_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vacancies_chat_id
    ON vacancies(chat_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vacancies_status
    ON vacancies(status)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_vacancy_id
    ON applications(vacancy_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_candidate
    ON applications(candidate_chat_id)
  `;

  return true;
}

/* =========================================================
   SESSION
========================================================= */

async function getSession(chatId) {
  if (!sql) {
    throw new Error(
      "POSTGRES_URL is not configured"
    );
  }

  const rows = await sql`
    SELECT chat_id, state, data
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

/* =========================================================
   MENUS
========================================================= */

function mainMenu() {
  return keyboard([
    [
      {
        text: "🔎 Вакансии",
      },
      {
        text: "👷 Я специалист",
      },
    ],
    [
      {
        text: "📋 Мои отклики",
      },
      {
        text: "ℹ️ О проекте",
      },
    ],
  ]);
}

function employerMenu() {
  return inlineKeyboard([
    [
      {
        text: "➕ Создать вакансию",
        callback_data:
          "employer_create",
      },
    ],
    [
      {
        text: "📋 Мои вакансии",
        callback_data:
          "employer_vacancies",
      },
    ],
    [
      {
        text: "📩 Отклики",
        callback_data:
          "employer_applications",
      },
    ],
    [
      {
        text: "🏠 Главное меню",
        callback_data:
          "menu_main",
      },
    ],
  ]);
}

function adminMenu() {
  return inlineKeyboard([
    [
      {
        text: "📊 Статистика",
        callback_data:
          "admin_stats",
      },
    ],
    [
      {
        text: "👷 Все специалисты",
        callback_data:
          "admin_candidates",
      },
    ],
    [
      {
        text: "📋 Все отклики",
        callback_data:
          "admin_applications",
      },
    ],
    [
      {
        text: "📢 Все вакансии",
        callback_data:
          "admin_vacancies",
      },
    ],
    [
      {
        text: "🔎 Найти специалиста",
        callback_data:
          "admin_search",
      },
    ],
    [
      {
        text: "➕ Добавить вакансию",
        callback_data:
          "admin_create_vacancy",
      },
    ],
    [
      {
        text: "🏠 Главное меню",
        callback_data:
          "menu_main",
      },
    ],
  ]);
}

/* =========================================================
   VACANCY HELPERS
========================================================= */

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
      vacancy.title ||
        "Вакансия"
    )}</b>\n\n` +

    `👷 Профессия: <b>${esc(
      vacancy.profession ||
        "Не указано"
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

function vacancyIsOpen(vacancy) {
  return (
    vacancy &&
    vacancy.closed !== true &&
    vacancy.status !== "closed"
  );
}

/* =========================================================
   PUBLIC VACANCIES
========================================================= */

async function showVacancies(chatId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE COALESCE(closed, FALSE) = FALSE
      AND (
        status IS NULL
        OR status <> 'closed'
      )
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      `<b>🔎 ВАКАНСИИ</b>\n\n` +
        `Сейчас активных вакансий нет.\n\n` +
        `Попробуйте зайти позже.`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>🔎 АКТУАЛЬНЫЕ ВАКАНСИИ</b>\n\n` +
      `Выберите подходящую вакансию:`,
    {
      reply_markup:
        mainMenu(),
    }
  );

  for (const vacancy of rows) {
    await sendMessage(
      chatId,
      vacancyText(vacancy),
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "📝 ОТКЛИКНУТЬСЯ",
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

/* =========================================================
   CANDIDATE FLOW
========================================================= */

async function startCandidate(
  chatId,
  telegramUser,
  vacancyId = null
) {
  let validVacancyId = null;

  if (vacancyId) {
    const rows = await sql`
      SELECT id
      FROM vacancies
      WHERE id = ${vacancyId}
        AND COALESCE(closed, FALSE) = FALSE
        AND (
          status IS NULL
          OR status <> 'closed'
        )
      LIMIT 1
    `;

    if (rows.length) {
      validVacancyId = rows[0].id;
    }
  }

  const data = {
    vacancy_id:
      validVacancyId,
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
      `Заполните анкету.\n\n` +
      `<b>1.</b> Введите ваше имя:`,
    {
      reply_markup:
        removeKeyboard(),
    }
  );
}

async function finishCandidate(
  chatId,
  session
) {
  const data =
    session.data || {};

  const candidateRows =
    await sql`
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

  const candidateId =
    candidateRows[0]?.id;

  let applicationCreated = false;
  let vacancyOwnerChatId = null;

  if (data.vacancy_id) {
    const vacancies =
      await sql`
        SELECT *
        FROM vacancies
        WHERE id = ${data.vacancy_id}
          AND COALESCE(closed, FALSE) = FALSE
          AND (
            status IS NULL
            OR status <> 'closed'
          )
        LIMIT 1
      `;

    if (vacancies.length) {
      const vacancy =
        vacancies[0];

      vacancyOwnerChatId =
        vacancy.chat_id || null;

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

      applicationCreated = true;
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
      (applicationCreated
        ? `\n\nВаш отклик также отправлен работодателю.`
        : "") +
      `\n\nС вами свяжутся по указанному номеру.`,
    {
      reply_markup:
        mainMenu(),
    }
  );

  const adminMessage =
    `<b>🔔 НОВАЯ АНКЕТА</b>\n\n` +
    `🆔 ID: <b>${esc(
      candidateId || ""
    )}</b>\n` +
    `👤 ${esc(
      data.name || ""
    )}\n` +
    `📞 ${esc(
      data.phone || ""
    )}\n` +
    `👷 ${esc(
      data.profession || ""
    )}\n` +
    `📅 Опыт: ${esc(
      data.experience || ""
    )}\n` +
    `📍 ${esc(
      data.city || ""
    )}\n` +
    `🚐 Вахта: ${esc(
      data.shift || ""
    )}\n` +
    `📝 Отклик: ${
      applicationCreated
        ? "Да"
        : "Нет"
    }`;

  if (ADMIN_ID) {
    try {
      await sendMessage(
        ADMIN_ID,
        adminMessage
      );
    } catch (error) {
      console.error(
        "Admin notification:",
        error.message
      );
    }
  }

  if (
    vacancyOwnerChatId &&
    String(vacancyOwnerChatId) !==
      String(chatId)
  ) {
    try {
      await sendMessage(
        vacancyOwnerChatId,
        `<b>🔔 НОВЫЙ ОТКЛИК</b>\n\n` +
          `👤 ${esc(
            data.name || ""
          )}\n` +
          `📞 ${esc(
            data.phone || ""
          )}\n` +
          `👷 ${esc(
            data.profession || ""
          )}\n` +
          `📅 Опыт: ${esc(
            data.experience || ""
          )}\n` +
          `📍 ${esc(
            data.city || ""
          )}`
      );
    } catch (error) {
      console.error(
        "Employer notification:",
        error.message
      );
    }
  }
}

async function handleCandidateStep(
  chatId,
  message,
  session
) {
  const value =
    text(message.text);

  const data =
    session.data || {};

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
        `<b>2.</b> Отправьте номер телефона:`,
        {
          reply_markup:
            keyboard([
              [
                {
                  text:
                    "📱 Отправить номер",
                  request_contact:
                    true,
                },
              ],
              [
                {
                  text:
                    "❌ Отмена",
                },
              ],
            ]),
        }
      );

      return;

    case "candidate_phone":
      if (
        message.contact &&
        message.contact.phone_number
      ) {
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
        `<b>3.</b> Укажите вашу профессию.\n\n` +
          `Например: сварщик, монтажник ЖБК, ` +
          `монтажник строительных лесов.`,
        {
          reply_markup:
            keyboard([
              [
                {
                  text:
                    "❌ Отмена",
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
          "Укажите профессию."
        );
        return;
      }

      data.profession =
        value;

      await saveSession(
        chatId,
        "candidate_experience",
        data
      );

      await sendMessage(
        chatId,
        `<b>4.</b> Сколько лет опыта?`
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

      data.experience =
        value;

      await saveSession(
        chatId,
        "candidate_city",
        data
      );

      await sendMessage(
        chatId,
        `<b>5.</b> В каком городе вы сейчас находитесь?`
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
        `<b>6.</b> Готовы работать вахтой?`,
        {
          reply_markup:
            keyboard([
              [
                {
                  text: "Да",
                },
                {
                  text: "Нет",
                },
              ],
              [
                {
                  text:
                    "❌ Отмена",
                },
              ],
            ]),
        }
      );

      return;

    case "candidate_shift":
      data.shift =
        value;

      await finishCandidate(
        chatId,
        {
          state:
            session.state,
          data,
        }
      );

      return;

    default:
      await clearSession(
        chatId
      );

      await sendMessage(
        chatId,
        "Сессия устарела. Начните заново.",
        {
          reply_markup:
            mainMenu(),
        }
      );
  }
}

/* =========================================================
   MY APPLICATIONS
========================================================= */

async function showMyApplications(
  chatId
) {
  const rows =
    await sql`
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
      LIMIT 30
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      `<b>📋 МОИ ОТКЛИКИ</b>\n\n` +
        `У вас пока нет откликов.`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  let message =
    `<b>📋 МОИ ОТКЛИКИ</b>\n\n`;

  for (const row of rows) {
    message +=
      `🆔 #${esc(row.id)}\n` +
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
      `📌 Статус: <b>${esc(
        row.status ||
          "new"
      )}</b>\n\n`;
  }

  await sendMessage(
    chatId,
    message,
    {
      reply_markup:
        mainMenu(),
    }
  );
}

/* =========================================================
   EMPLOYER
========================================================= */

async function startEmployer(
  chatId
) {
  await sendMessage(
    chatId,
    `<b>🏢 КАБИНЕТ РАБОТОДАТЕЛЯ</b>\n\n` +
      `Здесь можно создать вакансию и просматривать отклики.`,
    {
      reply_markup:
        employerMenu(),
    }
  );
}

async function startCreateVacancy(
  chatId
) {
  await saveSession(
    chatId,
    "vacancy_title",
    {
      employer_chat_id:
        chatId,
    }
  );

  await sendMessage(
    chatId,
    `<b>➕ СОЗДАНИЕ ВАКАНСИИ</b>\n\n` +
      `<b>1.</b> Название вакансии:`,
    {
      reply_markup:
        keyboard([
          [
            {
              text:
                "❌ Отмена",
            },
          ],
        ]),
    }
  );
}

async function handleVacancyStep(
  chatId,
  message,
  session
) {
  const value =
    text(message.text);

  if (!value) {
    await sendMessage(
      chatId,
      "Пожалуйста, введите значение."
    );
    return;
  }

  const data =
    session.data || {};

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
        `<b>2.</b> Профессия:`
      );

      return;

    case "vacancy_profession":
      data.profession =
        value;

      await saveSession(
        chatId,
        "vacancy_location",
        data
      );

      await sendMessage(
        chatId,
        `<b>3.</b> Город / объект:`
      );

      return;

    case "vacancy_location":
      data.location =
        value;

      data.city =
        value;

      await saveSession(
        chatId,
        "vacancy_experience",
        data
      );

      await sendMessage(
        chatId,
        `<b>4.</b> Требования по опыту:`
      );

      return;

    case "vacancy_experience":
      data.experience =
        value;

      await saveSession(
        chatId,
        "vacancy_payment",
        data
      );

      await sendMessage(
        chatId,
        `<b>5.</b> Оплата:`
      );

      return;

    case "vacancy_payment":
      data.payment =
        value;

      await saveSession(
        chatId,
        "vacancy_conditions",
        data
      );

      await sendMessage(
        chatId,
        `<b>6.</b> Условия:`
      );

      return;

    case "vacancy_conditions":
      data.conditions =
        value;

      await saveSession(
        chatId,
        "vacancy_shift",
        data
      );

      await sendMessage(
        chatId,
        `<b>7.</b> Вахта? Например: Да / Нет:`
      );

      return;

    case "vacancy_shift":
      data.shift =
        value;

      await saveSession(
        chatId,
        "vacancy_phone",
        data
      );

      await sendMessage(
        chatId,
        `<b>8.</b> Контактный телефон работодателя:`
      );

      return;

    case "vacancy_phone":
      data.phone =
        value;

      const rows =
        await sql`
          INSERT INTO vacancies
            (
              chat_id,
              title,
              profession,
              city,
              location,
              experience,
              payment,
              conditions,
              shift,
              phone,
              status,
              published,
              closed,
              updated_at
            )
          VALUES
            (
              ${chatId},
              ${data.title || ""},
              ${data.profession || ""},
              ${data.city || ""},
              ${data.location || ""},
              ${data.experience || ""},
              ${data.payment || ""},
              ${data.conditions || ""},
              ${data.shift || ""},
              ${data.phone || ""},
              'draft',
              FALSE,
              FALSE,
              NOW()
            )
          RETURNING *
        `;

      await clearSession(
        chatId
      );

      const vacancy =
        rows[0];

      await sendMessage(
        chatId,
        `<b>✅ ВАКАНСИЯ СОЗДАНА</b>\n\n` +
          vacancyText(vacancy) +
          `\n\n` +
          `📌 Статус: <b>Ожидает публикации</b>`,
        {
          reply_markup:
            employerMenu(),
        }
      );

      if (ADMIN_ID) {
        try {
          await sendMessage(
            ADMIN_ID,
            `<b>🔔 НОВАЯ ВАКАНСИЯ</b>\n\n` +
              vacancyText(
                vacancy
              ) +
              `\n\n` +
              `🆔 ID: <b>${esc(
                vacancy.id
              )}</b>`,
            {
              reply_markup:
                inlineKeyboard([
                  [
                    {
                      text:
                        "📢 Опубликовать",
                      callback_data:
                        `publish_${vacancy.id}`,
                    },
                  ],
                ]),
            }
          );
        } catch (error) {
          console.error(
            "Admin vacancy notification:",
            error.message
          );
        }
      }

      return;

    default:
      await clearSession(
        chatId
      );

      await sendMessage(
        chatId,
        "Сессия устарела.",
        {
          reply_markup:
            mainMenu(),
        }
      );
  }
}

/* =========================================================
   EMPLOYER VACANCIES
========================================================= */

async function showEmployerVacancies(
  chatId
) {
  const rows =
    await sql`
      SELECT *
      FROM vacancies
      WHERE chat_id = ${chatId}
      ORDER BY id DESC
      LIMIT 30
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      `<b>📋 МОИ ВАКАНСИИ</b>\n\n` +
        `У вас пока нет вакансий.`,
      {
        reply_markup:
          employerMenu(),
      }
    );

    return;
  }

  for (const vacancy of rows) {
    await sendMessage(
      chatId,
      vacancyText(vacancy) +
        `\n\n📌 Статус: <b>${esc(
          vacancy.status ||
            "draft"
        )}</b>`,
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "📩 Отклики",
                callback_data:
                  `employer_apps_${vacancy.id}`,
              },
            ],
          ]),
      }
    );
  }
}

async function showEmployerApplications(
  chatId,
  vacancyId = null
) {
  let rows;

  if (vacancyId) {
    rows =
      await sql`
        SELECT
          a.*,
          v.title,
          v.profession,
          v.city
        FROM applications a
        LEFT JOIN vacancies v
          ON v.id = a.vacancy_id
        WHERE a.vacancy_id = ${vacancyId}
          AND v.chat_id = ${chatId}
        ORDER BY a.id DESC
      `;
  } else {
    rows =
      await sql`
        SELECT
          a.*,
          v.title,
          v.profession,
          v.city
        FROM applications a
        JOIN vacancies v
          ON v.id = a.vacancy_id
        WHERE v.chat_id = ${chatId}
        ORDER BY a.id DESC
        LIMIT 50
      `;
  }

  if (!rows.length) {
    await sendMessage(
      chatId,
      `<b>📩 ОТКЛИКИ</b>\n\n` +
        `Откликов пока нет.`,
      {
        reply_markup:
          employerMenu(),
      }
    );

    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>📩 ОТКЛИК #${esc(
        row.id
      )}</b>\n\n` +
        `💼 ${esc(
          row.title ||
            row.profession ||
            "Вакансия"
        )}\n` +
        `👤 ${esc(
          row.name || ""
        )}\n` +
        `📞 ${esc(
          row.phone || ""
        )}\n` +
        `📅 Опыт: ${esc(
          row.experience || ""
        )}\n` +
        `📍 ${esc(
          row.city || ""
        )}\n` +
        `📌 Статус: <b>${esc(
          row.status ||
            "new"
        )}</b>`,
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "✅ Принять",
                callback_data:
                  `app_accept_${row.id}`,
              },
              {
                text:
                  "❌ Отклонить",
                callback_data:
                  `app_reject_${row.id}`,
              },
            ],
          ]),
      }
    );
  }
}

/* =========================================================
   ADMIN
========================================================= */

async function showStats(chatId) {
  const candidateRows =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM candidates
    `;

  const applicationRows =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM applications
    `;

  const vacancyRows =
    await sql`
      SELECT COUNT(*)::int AS count
      FROM vacancies
      WHERE COALESCE(closed, FALSE) = FALSE
        AND (
          status IS NULL
          OR status <> 'closed'
        )
    `;

  await sendMessage(
    chatId,
    `<b>📊 СТАТИСТИКА</b>\n\n` +
      `👷 Специалистов: <b>${candidateRows[0].count}</b>\n` +
      `📋 Откликов: <b>${applicationRows[0].count}</b>\n` +
      `📢 Активных вакансий: <b>${vacancyRows[0].count}</b>`,
    {
      reply_markup:
        adminMenu(),
    }
  );
}

async function showAdminCandidates(
  chatId
) {
  const rows =
    await sql`
      SELECT *
      FROM candidates
      ORDER BY id DESC
      LIMIT 50
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "👷 Специалистов пока нет.",
      {
        reply_markup:
          adminMenu(),
      }
    );

    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>👷 СПЕЦИАЛИСТ #${esc(
        row.id
      )}</b>\n\n` +
        `👤 ${esc(
          row.name || ""
        )}\n` +
        `📞 ${esc(
          row.phone || ""
        )}\n` +
        `🔧 ${esc(
          row.profession || ""
        )}\n` +
        `📅 Опыт: ${esc(
          row.experience || ""
        )}\n` +
        `📍 ${esc(
          row.city || ""
        )}\n` +
        `🚐 Вахта: ${esc(
          row.shift || ""
        )}\n` +
        `💬 Telegram: ${
          row.telegram_username
            ? "@" +
              esc(
                row.telegram_username
              )
            : "не указан"
        }`,
      {
        reply_markup:
          adminMenu(),
      }
    );
  }
}

async function showAdminApplications(
  chatId
) {
  const rows =
    await sql`
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
      "📋 Откликов пока нет.",
      {
        reply_markup:
          adminMenu(),
      }
    );

    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>📋 ОТКЛИК #${esc(
        row.id
      )}</b>\n\n` +
        `👤 ${esc(
          row.name || ""
        )}\n` +
        `📞 ${esc(
          row.phone || ""
        )}\n` +
        `👷 Опыт: ${esc(
          row.experience || ""
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
        `📌 Статус: <b>${esc(
          row.status ||
            "new"
        )}</b>`,
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "✅ Принять",
                callback_data:
                  `app_accept_${row.id}`,
              },
              {
                text:
                  "❌ Отклонить",
                callback_data:
                  `app_reject_${row.id}`,
              },
            ],
          ]),
      }
    );
  }
}

async function showAdminVacancies(
  chatId
) {
  const rows =
    await sql`
      SELECT *
      FROM vacancies
      ORDER BY id DESC
      LIMIT 50
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "📢 Вакансий пока нет.",
      {
        reply_markup:
          adminMenu(),
      }
    );

    return;
  }

  for (const vacancy of rows) {
    const buttons = [];

    if (
      vacancy.status !==
        "published" &&
      vacancy.status !==
        "closed"
    ) {
      buttons.push([
        {
          text:
            "📢 Опубликовать",
          callback_data:
            `publish_${vacancy.id}`,
        },
      ]);
    }

    if (
      vacancy.status !==
      "closed"
    ) {
      buttons.push([
        {
          text:
            "❌ Закрыть",
          callback_data:
            `close_${vacancy.id}`,
        },
      ]);
    } else {
      buttons.push([
        {
          text:
            "🔓 Открыть",
          callback_data:
            `open_${vacancy.id}`,
        },
      ]);
    }

    await sendMessage(
      chatId,
      vacancyText(vacancy) +
        `\n\n🆔 ID: <b>${esc(
          vacancy.id
        )}</b>` +
        `\n📌 Статус: <b>${esc(
          vacancy.status ||
            "draft"
        )}</b>`,
      {
        reply_markup:
          inlineKeyboard(
            buttons
          ),
      }
    );
  }
}

/* =========================================================
   PUBLISH VACANCY
========================================================= */

async function publishVacancy(
  vacancyId,
  adminChatId
) {
  if (!CHANNEL_USERNAME) {
    throw new Error(
      "CHANNEL_USERNAME is not configured"
    );
  }

  const rows =
    await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacancyId}
      LIMIT 1
    `;

  if (!rows.length) {
    throw new Error(
      "Вакансия не найдена"
    );
  }

  const vacancy =
    rows[0];

  if (
    vacancy.status ===
    "published"
  ) {
    await sendMessage(
      adminChatId,
      "ℹ️ Эта вакансия уже опубликована.",
      {
        reply_markup:
          adminMenu(),
      }
    );

    return;
  }

  const channelText =
    `<b>🔥 НОВАЯ ВАКАНСИЯ</b>\n\n` +
    vacancyText(vacancy) +
    `\n\n` +
    `📲 Чтобы откликнуться, нажмите кнопку ниже.`;

  const result =
    await telegram(
      "sendMessage",
      {
        chat_id:
          `@${CHANNEL_USERNAME}`,
        text:
          channelText,
        parse_mode:
          "HTML",
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "📝 ОТКЛИКНУТЬСЯ",
                url:
                  `https://t.me/${BOT_USERNAME}` +
                  `?start=vacancy_${vacancy.id}`,
              },
            ],
          ]),
      }
    );

  await sql`
    UPDATE vacancies
    SET
      status = 'published',
      published = TRUE,
      closed = FALSE,
      published_at = NOW(),
      channel_message_id = ${result.message_id},
      updated_at = NOW()
    WHERE id = ${vacancy.id}
  `;

  await sendMessage(
    adminChatId,
    `<b>✅ ВАКАНСИЯ ОПУБЛИКОВАНА</b>\n\n` +
      `🆔 ID: ${esc(
        vacancy.id
      )}\n` +
      `📢 Канал: @${esc(
        CHANNEL_USERNAME
      )}`,
    {
      reply_markup:
        adminMenu(),
    }
  );
}

/* =========================================================
   CLOSE / OPEN VACANCY
========================================================= */

async function closeVacancy(
  vacancyId,
  chatId
) {
  const rows =
    await sql`
      UPDATE vacancies
      SET
        status = 'closed',
        closed = TRUE,
        updated_at = NOW()
      WHERE id = ${vacancyId}
      RETURNING *
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "Вакансия не найдена."
    );
    return;
  }

  await sendMessage(
    chatId,
    `<b>✅ ВАКАНСИЯ ЗАКРЫТА</b>\n\n` +
      `ID: ${esc(
        vacancyId
      )}`,
    {
      reply_markup:
        adminMenu(),
    }
  );
}

async function openVacancy(
  vacancyId,
  chatId
) {
  const rows =
    await sql`
      UPDATE vacancies
      SET
        status = 'published',
        published = TRUE,
        closed = FALSE,
        updated_at = NOW()
      WHERE id = ${vacancyId}
      RETURNING *
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "Вакансия не найдена."
    );
    return;
  }

  await sendMessage(
    chatId,
    `<b>🔓 ВАКАНСИЯ ОТКРЫТА</b>\n\n` +
      `ID: ${esc(
        vacancyId
      )}`,
    {
      reply_markup:
        adminMenu(),
    }
  );
}

/* =========================================================
   APPLICATION STATUS
========================================================= */

async function updateApplicationStatus(
  applicationId,
  status,
  chatId
) {
  const rows =
    await sql`
      SELECT
        a.*,
        v.title,
        v.profession
      FROM applications a
      LEFT JOIN vacancies v
        ON v.id = a.vacancy_id
      WHERE a.id = ${applicationId}
      LIMIT 1
    `;

  if (!rows.length) {
    await sendMessage(
      chatId,
      "Отклик не найден."
    );
    return;
  }

  const application =
    rows[0];

  await sql`
    UPDATE applications
    SET
      status = ${status},
      updated_at = NOW()
    WHERE id = ${applicationId}
  `;

  const statusText =
    status === "accepted"
      ? "✅ Отклик принят"
      : "❌ Отклик отклонён";

  await sendMessage(
    chatId,
    `${statusText}\n\n` +
      `Отклик #${esc(
        applicationId
      )}`,
    {
      reply_markup:
        adminMenu(),
    }
  );

  if (
    application.candidate_chat_id
  ) {
    try {
      await sendMessage(
        application.candidate_chat_id,
        status === "accepted"
          ? `<b>🎉 ВАШ ОТКЛИК ПРИНЯТ</b>\n\n` +
              `Вакансия: <b>${esc(
                application.title ||
                  application.profession ||
                  ""
              )}</b>\n\n` +
              `Работодатель может связаться с вами по указанному номеру.`
          : `<b>ℹ️ ИНФОРМАЦИЯ ПО ОТКЛИКУ</b>\n\n` +
              `Вакансия: <b>${esc(
                application.title ||
                  application.profession ||
                  ""
              )}</b>\n\n` +
              `По этому отклику пока не принято положительное решение.`,
        {
          reply_markup:
            mainMenu(),
        }
      );
    } catch (error) {
      console.error(
        "Candidate notification:",
        error.message
      );
    }
  }
}

/* =========================================================
   SEARCH SPECIALIST
========================================================= */

async function startAdminSearch(
  chatId
) {
  await saveSession(
    chatId,
    "admin_search",
    {}
  );

  await sendMessage(
    chatId,
    `<b>🔎 ПОИСК СПЕЦИАЛИСТА</b>\n\n` +
      `Введите профессию или ключевое слово.\n\n` +
      `Например: сварщик`,
    {
      reply_markup:
        keyboard([
          [
            {
              text:
                "❌ Отмена",
            },
          ],
        ]),
    }
  );
}

async function performCandidateSearch(
  chatId,
  query
) {
  const q = `%${query}%`;

  const rows =
    await sql`
      SELECT *
      FROM candidates
      WHERE
        profession ILIKE ${q}
        OR name ILIKE ${q}
        OR city ILIKE ${q}
        OR experience ILIKE ${q}
      ORDER BY id DESC
      LIMIT 30
    `;

  await clearSession(
    chatId
  );

  if (!rows.length) {
    await sendMessage(
      chatId,
      `<b>🔎 РЕЗУЛЬТАТ</b>\n\n` +
        `Специалисты не найдены.`,
      {
        reply_markup:
          adminMenu(),
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>🔎 НАЙДЕНО: ${rows.length}</b>`,
    {
      reply_markup:
        adminMenu(),
    }
  );

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>👷 ${esc(
        row.name || ""
      )}</b>\n\n` +
        `🔧 ${esc(
          row.profession || ""
        )}\n` +
        `📅 Опыт: ${esc(
          row.experience || ""
        )}\n` +
        `📍 ${esc(
          row.city || ""
        )}\n` +
        `📞 ${esc(
          row.phone || ""
        )}\n` +
        `🚐 Вахта: ${esc(
          row.shift || ""
        )}`
    );
  }
}

/* =========================================================
   ADMIN TEXT COMMANDS
========================================================= */

async function openAdmin(
  chatId
) {
  if (!isAdmin(chatId)) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён.",
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  await clearSession(
    chatId
  );

  await sendMessage(
    chatId,
    `<b>🔐 АДМИН-ПАНЕЛЬ</b>\n\n` +
      `Выберите действие:`,
    {
      reply_markup:
        adminMenu(),
    }
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallbackQuery(
  callback
) {
  const callbackId =
    callback.id;

  const chatId =
    callback.message?.chat?.id;

  const messageId =
    callback.message?.message_id;

  const data =
    text(callback.data);

  if (!chatId) {
    await answerCallback(
      callbackId
    );
    return;
  }

  await answerCallback(
    callbackId
  );

  /* MAIN */

  if (data === "menu_main") {
    await clearSession(
      chatId
    );

    await sendMessage(
      chatId,
      `<b>🏠 ГЛАВНОЕ МЕНЮ</b>\n\n` +
        `Выберите нужный раздел:`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  /* EMPLOYER */

  if (
    data ===
    "employer_create"
  ) {
    await clearSession(
      chatId
    );

    await startCreateVacancy(
      chatId
    );

    return;
  }

  if (
    data ===
    "employer_menu"
  ) {
    await clearSession(
      chatId
    );

    await startEmployer(
      chatId
    );

    return;
  }

  if (
    data ===
    "employer_vacancies"
  ) {
    await showEmployerVacancies(
      chatId
    );

    return;
  }

  if (
    data ===
    "employer_applications"
  ) {
    await showEmployerApplications(
      chatId
    );

    return;
  }

  if (
    data.startsWith(
      "employer_apps_"
    )
  ) {
    const vacancyId =
      Number(
        data.replace(
          "employer_apps_",
          ""
        )
      );

    if (
      Number.isInteger(
        vacancyId
      )
    ) {
      await showEmployerApplications(
        chatId,
        vacancyId
      );
    }

    return;
  }

  /* ADMIN */

  if (
    data.startsWith(
      "admin_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Доступ запрещён."
      );
      return;
    }
  }

  if (
    data ===
    "admin_stats"
  ) {
    await showStats(
      chatId
    );
    return;
  }

  if (
    data ===
    "admin_candidates"
  ) {
    await showAdminCandidates(
      chatId
    );
    return;
  }

  if (
    data ===
    "admin_applications"
  ) {
    await showAdminApplications(
      chatId
    );
    return;
  }

  if (
    data ===
    "admin_vacancies"
  ) {
    await showAdminVacancies(
      chatId
    );
    return;
  }

  if (
    data ===
    "admin_search"
  ) {
    await startAdminSearch(
      chatId
    );
    return;
  }

  if (
    data ===
    "admin_create_vacancy"
  ) {
    await startCreateVacancy(
      chatId
    );
    return;
  }

  /* PUBLISH */

  if (
    data.startsWith(
      "publish_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Только администратор может публиковать вакансии."
      );
      return;
    }

    const vacancyId =
      Number(
        data.replace(
          "publish_",
          ""
        )
      );

    if (
      Number.isInteger(
        vacancyId
      )
    ) {
      try {
        await publishVacancy(
          vacancyId,
          chatId
        );
      } catch (error) {
        console.error(
          "Publish error:",
          error
        );

        await sendMessage(
          chatId,
          `<b>❌ ОШИБКА ПУБЛИКАЦИИ</b>\n\n` +
            `${esc(
              error.message
            )}\n\n` +
            `Проверьте, что бот добавлен администратором канала @${esc(
              CHANNEL_USERNAME
            )} и имеет право публиковать сообщения.`,
          {
            reply_markup:
              adminMenu(),
          }
        );
      }
    }

    return;
  }

  /* CLOSE */

  if (
    data.startsWith(
      "close_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Доступ запрещён."
      );
      return;
    }

    const vacancyId =
      Number(
        data.replace(
          "close_",
          ""
        )
      );

    if (
      Number.isInteger(
        vacancyId
      )
    ) {
      await closeVacancy(
        vacancyId,
        chatId
      );
    }

    return;
  }

  /* OPEN */

  if (
    data.startsWith(
      "open_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Доступ запрещён."
      );
      return;
    }

    const vacancyId =
      Number(
        data.replace(
          "open_",
          ""
        )
      );

    if (
      Number.isInteger(
        vacancyId
      )
    ) {
      await openVacancy(
        vacancyId,
        chatId
      );
    }

    return;
  }

  /* APPLICATION ACCEPT */

  if (
    data.startsWith(
      "app_accept_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Доступ запрещён."
      );
      return;
    }

    const applicationId =
      Number(
        data.replace(
          "app_accept_",
          ""
        )
      );

    if (
      Number.isInteger(
        applicationId
      )
    ) {
      await updateApplicationStatus(
        applicationId,
        "accepted",
        chatId
      );
    }

    return;
  }

  /* APPLICATION REJECT */

  if (
    data.startsWith(
      "app_reject_"
    )
  ) {
    if (!isAdmin(chatId)) {
      await sendMessage(
        chatId,
        "⛔ Доступ запрещён."
      );
      return;
    }

    const applicationId =
      Number(
        data.replace(
          "app_reject_",
          ""
        )
      );

    if (
      Number.isInteger(
        applicationId
      )
    ) {
      await updateApplicationStatus(
        applicationId,
        "rejected",
        chatId
      );
    }

    return;
  }

  /* CONTACT ADMIN */

  if (
    data ===
    "contact_admin"
  ) {
    if (!ADMIN_ID) {
      await sendMessage(
        chatId,
        "Контакт администратора пока не настроен."
      );
      return;
    }

    await sendMessage(
      chatId,
      `<b>📞 СВЯЗЬ С АДМИНИСТРАТОРОМ</b>\n\n` +
        `Нажмите кнопку ниже:`,
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "💬 Написать администратору",
                url:
                  `tg://user?id=${ADMIN_ID}`,
              },
            ],
          ]),
      }
    );

    return;
  }

  /* UNKNOWN */

  if (
    messageId &&
    callback.message
  ) {
    await editMessage(
      chatId,
      messageId,
      `<b>РАБОТА | ВАХТА</b>\n\n` +
        `Выберите действие:`,
      {
        reply_markup:
          inlineKeyboard([
            [
              {
                text:
                  "🏠 Главное меню",
                callback_data:
                  "menu_main",
              },
            ],
          ]),
      }
    );
  }
}

/* =========================================================
   COMMAND HELP
========================================================= */

async function sendHelp(
  chatId
) {
  await sendMessage(
    chatId,
    `<b>ℹ️ КОМАНДЫ БОТА</b>\n\n` +
      `/start — главное меню\n` +
      `/vacancies — вакансии\n` +
      `/candidate — анкета специалиста\n` +
      `/employer — кабинет работодателя\n` +
      `/id — узнать Telegram ID\n` +
      `/cancel — отменить действие\n` +
      `/help — помощь`,
    {
      reply_markup:
        mainMenu(),
    }
  );
}

/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessage(
  message
) {
  if (
    !message ||
    !message.chat
  ) {
    return;
  }

  const chatId =
    message.chat.id;

  const telegramUser =
    message.from || {};

  const value =
    text(message.text);

  /* CANCEL */

  if (
    value ===
      "❌ Отмена" ||
    value ===
      "/cancel"
  ) {
    await clearSession(
      chatId
    );

    await sendMessage(
      chatId,
      `<b>❌ ДЕЙСТВИЕ ОТМЕНЕНО</b>\n\n` +
        `Вы вернулись в главное меню.`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  /* START */

  const parts =
    value.split(/\s+/);

  const command =
    (parts[0] || "")
      .split("@")[0]
      .toLowerCase();

  const argument =
    parts[1] || "";

  if (
    command ===
    "/start"
  ) {
    if (
      argument.startsWith(
        "vacancy_"
      )
    ) {
      const vacancyId =
        Number(
          argument.replace(
            "vacancy_",
            ""
          )
        );

      if (
        Number.isInteger(
          vacancyId
        )
      ) {
        await startCandidate(
          chatId,
          telegramUser,
          vacancyId
        );

        return;
      }
    }

    await clearSession(
      chatId
    );

    await sendMessage(
      chatId,
      `<b>👋 ДОБРО ПОЖАЛОВАТЬ!</b>\n\n` +
        `<b>РАБОТА | ВАХТА</b>\n\n` +
        `Вакансии для рабочих специалистов, ` +
        `подбор кандидатов и отклики.`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  /* ID */

  if (
    command ===
    "/id"
  ) {
    await sendMessage(
      chatId,
      `<b>🆔 ВАШ TELEGRAM ID</b>\n\n` +
        `<code>${esc(
          chatId
        )}</code>`
    );

    return;
  }

  /* HELP */

  if (
    command ===
    "/help"
  ) {
    await sendHelp(
      chatId
    );
    return;
  }

  /* VACANCIES */

  if (
    command ===
      "/vacancies" ||
    value ===
      "🔎 Вакансии"
  ) {
    await showVacancies(
      chatId
    );
    return;
  }

  /* CANDIDATE */

  if (
    command ===
      "/candidate" ||
    value ===
      "👷 Я специалист"
  ) {
    await startCandidate(
      chatId,
      telegramUser
    );
    return;
  }

  /* EMPLOYER */

  if (
    command ===
      "/employer"
  ) {
    await startEmployer(
      chatId
    );
    return;
  }

  /* ADMIN */

  if (
    command ===
    "/admin"
  ) {
    await openAdmin(
      chatId
    );
    return;
  }

  /* ABOUT */

  if (
    value ===
    "ℹ️ О проекте"
  ) {
    await sendMessage(
      chatId,
      `<b>ℹ️ РАБОТА | ВАХТА</b>\n\n` +
        `Сервис для поиска работы, специалистов и размещения вакансий.\n\n` +
        `👷 Специалисты могут оставить анкету.\n` +
        `🏢 Работодатели могут разместить вакансию.\n` +
        `📋 По вакансиям можно отправлять отклики.`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  /* MY APPLICATIONS */

  if (
    value ===
    "📋 Мои отклики"
  ) {
    await showMyApplications(
      chatId
    );
    return;
  }

  /* OLD / EXTRA EMPLOYER BUTTONS */

  if (
    value ===
      "📋 Мои вакансии" ||
    value ===
      "🏢 Кабинет работодателя"
  ) {
    await startEmployer(
      chatId
    );
    return;
  }

  /* ACTIVE SESSION */

  let session = null;

  try {
    session =
      await getSession(
        chatId
      );
  } catch (error) {
    console.error(
      "Session read error:",
      error.message
    );

    await sendMessage(
      chatId,
      `<b>⚠️ Временная ошибка</b>\n\n` +
        `Попробуйте ещё раз через несколько секунд.`
    );

    return;
  }

  if (!session) {
    await sendMessage(
      chatId,
      `<b>Выберите действие:</b>`,
      {
        reply_markup:
          mainMenu(),
      }
    );

    return;
  }

  if (
    session.state &&
    session.state.startsWith(
      "candidate_"
    )
  ) {
    await handleCandidateStep(
      chatId,
      message,
      session
    );

    return;
  }

  if (
    session.state &&
    session.state.startsWith(
      "vacancy_"
    )
  ) {
    await handleVacancyStep(
      chatId,
      message,
      session
    );

    return;
  }

  if (
    session.state ===
    "admin_search"
  ) {
    if (!isAdmin(chatId)) {
      await clearSession(
        chatId
      );

      await sendMessage(
        chatId,
        "⛔ Доступ запрещён.",
        {
          reply_markup:
            mainMenu(),
        }
      );

      return;
    }

    if (!value) {
      await sendMessage(
        chatId,
        "Введите запрос для поиска."
      );

      return;
    }

    await performCandidateSearch(
      chatId,
      value
    );

    return;
  }

  await clearSession(
    chatId
  );

  await sendMessage(
    chatId,
    `<b>🏠 Главное меню</b>`,
    {
      reply_markup:
        mainMenu(),
    }
  );
}

/* =========================================================
   UPDATE HANDLER
========================================================= */

async function handleUpdate(
  update
) {
  if (
    update.callback_query
  ) {
    await handleCallbackQuery(
      update.callback_query
    );

    return;
  }

  if (
    update.message
  ) {
    await handleMessage(
      update.message
    );

    return;
  }
}

/* =========================================================
   TELEGRAM COMMAND MENU
========================================================= */

async function setBotCommands() {
  await telegram(
    "setMyCommands",
    {
      commands: [
        {
          command: "start",
          description:
            "Главное меню",
        },
        {
          command:
            "vacancies",
          description:
            "Посмотреть вакансии",
        },
        {
          command:
            "candidate",
          description:
            "Заполнить анкету",
        },
        {
          command:
            "employer",
          description:
            "Кабинет работодателя",
        },
        {
          command: "id",
          description:
            "Показать Telegram ID",
        },
        {
          command: "help",
          description:
            "Помощь",
        },
        {
          command:
            "cancel",
          description:
            "Отменить действие",
        },
      ],
    }
  );
}

/* =========================================================
   SETUP
   https://rabota-vakhta-bot.vercel.app/api/bot?setup=1
========================================================= */

async function setupBot() {
  await initDatabase();

  const webhook =
    await telegram(
      "setWebhook",
      {
        url: WEBHOOK_URL,
        drop_pending_updates:
          false,
      }
    );

  await setBotCommands();

  const me =
    await telegram(
      "getMe"
    );

  const webhookInfo =
    await telegram(
      "getWebhookInfo"
    );

  return {
    ok: true,
    message:
      "Бот настроен",
    bot: {
      id: me.id,
      username:
        me.username,
      name:
        me.first_name,
    },
    webhook,
    webhook_info:
      webhookInfo,
  };
}

/* =========================================================
   HEALTH CHECK
========================================================= */

async function healthCheck() {
  const result = {
    ok: true,
    telegram: null,
    database: null,
  };

  try {
    const me =
      await telegram(
        "getMe"
      );

    result.telegram = {
      ok: true,
      id: me.id,
      username:
        me.username,
    };
  } catch (error) {
    result.ok = false;

    result.telegram = {
      ok: false,
      error:
        error.message,
    };
  }

  try {
    if (!sql) {
      throw new Error(
        "POSTGRES_URL is not configured"
      );
    }

    await sql`SELECT 1`;

    result.database = {
      ok: true,
    };
  } catch (error) {
    result.ok = false;

    result.database = {
      ok: false,
      error:
        error.message,
    };
  }

  return result;
}

/* =========================================================
   MAIN VERCEL HANDLER
========================================================= */

module.exports = async function handler(
  req,
  res
) {
  try {
    /* -------- GET -------- */

    if (
      req.method ===
      "GET"
    ) {
      const setup =
        String(
          req.query?.setup ||
            ""
        ) === "1";

      const health =
        String(
          req.query?.health ||
            ""
        ) === "1";

      const webhook =
        String(
          req.query?.webhook ||
            ""
        ) === "1";

      if (setup) {
        const result =
          await setupBot();

        return json(
          res,
          result,
          200
        );
      }

      if (health) {
        const result =
          await healthCheck();

        return json(
          res,
          result,
          result.ok
            ? 200
            : 500
        );
      }

      if (webhook) {
        const info =
          await telegram(
            "getWebhookInfo"
          );

        return json(
          res,
          {
            ok: true,
            webhook:
              info,
          },
          200
        );
      }

      return json(
        res,
        {
          ok: true,
          service:
            "Работа | Вахта Telegram Bot",
          bot:
            BOT_USERNAME,
          webhook:
            WEBHOOK_URL,
        },
        200
      );
    }

    /* -------- POST -------- */

    if (
      req.method !==
      "POST"
    ) {
      return json(
        res,
        {
          ok: false,
          error:
            "Method Not Allowed",
        },
        405
      );
    }

    if (!BOT_TOKEN) {
      return json(
        res,
        {
          ok: false,
          error:
            "BOT_TOKEN is not configured",
        },
        500
      );
    }

    if (!POSTGRES_URL) {
      return json(
        res,
        {
          ok: false,
          error:
            "POSTGRES_URL is not configured",
        },
        500
      );
    }

    let update =
      req.body;

    if (
      typeof update ===
      "string"
    ) {
      try {
        update =
          JSON.parse(update);
      } catch (error) {
        return json(
          res,
          {
            ok: false,
            error:
              "Invalid JSON",
          },
          400
        );
      }
    }

    if (
      !update ||
      typeof update !==
        "object"
    ) {
      return json(
        res,
        {
          ok: false,
          error:
            "Empty Telegram update",
        },
        400
      );
    }

    await handleUpdate(
      update
    );

    return json(
      res,
      {
        ok: true,
      },
      200
    );
  } catch (error) {
    console.error(
      "BOT ERROR:",
      error
    );

    return json(
      res,
      {
        ok: false,
        error:
          error.message ||
          "Internal server error",
      },
      500
    );
  }
};
