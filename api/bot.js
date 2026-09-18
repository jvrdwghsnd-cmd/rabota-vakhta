
const { neon } = require("@neondatabase/serverless");

const BOT_TOKEN = process.env.BOT_TOKEN;
const POSTGRES_URL = process.env.POSTGRES_URL;
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "vakhtovyk";
const BOT_USERNAME = process.env.BOT_USERNAME || "VakhtovykHelperBot";

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

function json(res, data, status = 200) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(data));
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
      result.description || `Telegram API error: ${method}`
    );
  }

  return result;
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

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function editMessage(chatId, messageId, text, extra = {}) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function initDatabase() {
  if (!sql) {
    throw new Error("POSTGRES_URL is not configured");
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

async function getSession(chatId) {
  const rows = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function saveSession(chatId, state, data = {}) {
  await sql`
    INSERT INTO bot_sessions
      (chat_id, state, data, updated_at)
    VALUES
      (${chatId}, ${state}, ${JSON.stringify(data)}::jsonb, NOW())
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

function mainMenu() {
  return keyboard([
    [{ text: "🔎 Вакансии" }, { text: "👷 Анкета специалиста" }],
    [{ text: "📋 Мои отклики" }, { text: "ℹ️ О проекте" }],
  ]);
}

function adminMenu() {
  return keyboard([
    [{ text: "📊 Статистика" }, { text: "👷 Все специалисты" }],
    [{ text: "📋 Все заявки" }, { text: "📢 Вакансии" }],
    [{ text: "➕ Добавить вакансию" }],
    [{ text: "⬅️ Главное меню" }],
  ]);
}

function vacancyLocation(vacancy) {
  return vacancy.city || vacancy.location || "Не указано";
}

function vacancyText(vacancy) {
  return (
    `<b>🔹 ${escapeHtml(vacancy.title || "Вакансия")}</b>\n\n` +
    `👷 Профессия: <b>${escapeHtml(vacancy.profession || "Не указано")}</b>\n` +
    `📍 Место: <b>${escapeHtml(vacancyLocation(vacancy))}</b>\n` +
    `💰 Оплата: <b>${escapeHtml(vacancy.payment || "По договорённости")}</b>\n` +
    `🛠 Опыт: ${escapeHtml(vacancy.experience || "Не указан")}\n` +
    `🍽 Условия: ${escapeHtml(vacancy.conditions || "Уточняются")}\n` +
    `🚐 Вахта: ${escapeHtml(vacancy.shift || "Уточняется")}`
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    `<b>🔎 АКТУАЛЬНЫЕ ВАКАНСИИ</b>\n\nНажмите «Откликнуться», чтобы отправить заявку.`,
    {
      reply_markup: mainMenu(),
    }
  );

  for (const vacancy of vacancies) {
    await sendMessage(chatId, vacancyText(vacancy), {
      reply_markup: inlineKeyboard([
        [
          {
            text: "📝 ОТКЛИКНУТЬСЯ",
            url: `https://t.me/${BOT_USERNAME}?start=vacancy_${vacancy.id}`,
          },
        ],
      ]),
    });
  }
}

async function startCandidate(chatId, telegramUser, vacancyId = null) {
  const data = {
    vacancy_id: vacancyId,
    telegram_username: telegramUser?.username || "",
  };

  await saveSession(chatId, "candidate_name", data);

  await sendMessage(
    chatId,
    `<b>👷 АНКЕТА СПЕЦИАЛИСТА</b>\n\n` +
      `Заполните несколько пунктов — мы передадим вашу заявку работодателю.\n\n` +
      `1️⃣ Введите ваше имя:`,
    {
      reply_markup: {
        remove_keyboard: true,
      },
    }
  );
}

async function finishCandidate(chatId, session) {
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

  await clearSession(chatId);

  await sendMessage(
    chatId,
    `<b>✅ АНКЕТА СОХРАНЕНА</b>\n\n` +
      `Спасибо, ${escapeHtml(data.name || "")}!\n\n` +
      `Ваша анкета сохранена. Если вы откликнулись на вакансию, заявка также передана в систему работодателя.\n\n` +
      `С вами свяжутся по указанному номеру.`,
    {
      reply_markup: mainMenu(),
    }
  );

  if (ADMIN_ID) {
    await sendMessage(
      ADMIN_ID,
      `<b>🔔 НОВАЯ АНКЕТА</b>\n\n` +
        `👤 ${escapeHtml(data.name || "")}\n` +
        `📞 ${escapeHtml(data.phone || "")}\n` +
        `👷 ${escapeHtml(data.profession || "")}\n` +
        `📅 Опыт: ${escapeHtml(data.experience || "")}\n` +
        `📍 ${escapeHtml(data.city || "")}\n` +
        `🚐 Вахта: ${escapeHtml(data.shift || "")}\n` +
        `🆔 ID: ${result[0].id}`
    );
  }
}

async function handleCandidateStep(chatId, message, session) {
  const text = (message.text || "").trim();
  const data = session.data || {};

  switch (session.state) {
    case "candidate_name":
      data.name = text;
      await saveSession(chatId, "candidate_phone", data);

      await sendMessage(
        chatId,
        "2️⃣ Отправьте номер телефона:",
        {
          reply_markup: keyboard([
            [{ text: "📱 Отправить номер телефона", request_contact: true }],
            [{ text: "❌ Отмена" }],
          ]),
        }
      );
      return;

    case "candidate_phone":
      if (message.contact?.phone_number) {
        data.phone = message.contact.phone_number;
      } else {
        data.phone = text;
      }

      await saveSession(chatId, "candidate_profession", data);

      await sendMessage(
        chatId,
        "3️⃣ Укажите профессию.\n\nНапример: монтажник, сварщик, арматурщик.",
        {
          reply_markup: keyboard([
            [{ text: "❌ Отмена" }],
          ]),
        }
      );
      return;

    case "candidate_profession":
      data.profession = text;
      await saveSession(chatId, "candidate_experience", data);

      await sendMessage(
        chatId,
        "4️⃣ Сколько лет опыта?",
        {
          reply_markup: keyboard([
            [{ text: "❌ Отмена" }],
          ]),
        }
      );
      return;

    case "candidate_experience":
      data.experience = text;
      await saveSession(chatId, "candidate_city", data);

      await sendMessage(
        chatId,
        "5️⃣ В каком городе вы сейчас находитесь?",
        {
          reply_markup: keyboard([
            [{ text: "❌ Отмена" }],
          ]),
        }
      );
      return;

    case "candidate_city":
      data.city = text;
      await saveSession(chatId, "candidate_shift", data);

      await sendMessage(
        chatId,
        "6️⃣ Готовы работать вахтой?",
        {
          reply_markup: keyboard([
            [{ text: "Да" }, { text: "Нет" }],
            [{ text: "❌ Отмена" }],
          ]),
        }
      );
      return;

    case "candidate_shift":
      data.shift = text;
      await finishCandidate(chatId, {
        state: session.state,
        data,
      });
      return;
  }
}

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

  let text = "<b>📋 МОИ ОТКЛИКИ</b>\n\n";

  for (const row of rows) {
    text +=
      `🆔 #${row.id}\n` +
      `👷 ${escapeHtml(row.title || row.profession || "Вакансия")}\n` +
      `📍 ${escapeHtml(row.city || row.location || "")}\n` +
      `📌 Статус: ${escapeHtml(row.status || "new")}\n\n`;
  }

  await sendMessage(chatId, text, {
    reply_markup: mainMenu(),
  });
}

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
    WHERE status IS NULL OR status <> 'closed'
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
    await sendMessage(chatId, "👷 Анкет пока нет.", {
      reply_markup: adminMenu(),
    });
    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>👷 СПЕЦИАЛИСТ #${row.id}</b>\n\n` +
        `👤 ${escapeHtml(row.name)}\n` +
        `📞 ${escapeHtml(row.phone)}\n` +
        `🔧 ${escapeHtml(row.profession)}\n` +
        `📅 Опыт: ${escapeHtml(row.experience)}\n` +
        `📍 ${escapeHtml(row.city)}\n` +
        `🚐 Вахта: ${escapeHtml(row.shift)}\n` +
        `💬 Telegram: @${escapeHtml(row.telegram_username || "")}`,
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
    await sendMessage(chatId, "📋 Заявок пока нет.", {
      reply_markup: adminMenu(),
    });
    return;
  }

  for (const row of rows) {
    await sendMessage(
      chatId,
      `<b>📋 ЗАЯВКА #${row.id}</b>\n\n` +
        `👤 ${escapeHtml(row.name)}\n` +
        `📞 ${escapeHtml(row.phone)}\n` +
        `👷 ${escapeHtml(row.experience)}\n` +
        `💼 ${escapeHtml(row.title || row.profession || "Вакансия")}\n` +
        `📍 ${escapeHtml(row.city || row.location || "")}\n` +
        `📌 Статус: ${escapeHtml(row.status || "new")}`,
      {
        reply_markup: inlineKeyboard([
          [
            {
              text: "✅ Принять",
              callback_data: `app_accept_${row.id}`,
            },
            {
              text: "❌ Отклонить",
              callback_data: `app_reject_${row.id}`,
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
    await sendMessage(chatId, "📢 Вакансий пока нет.", {
      reply_markup: adminMenu(),
    });
    return;
  }

  for (const vacancy of rows) {
    await sendMessage(
      chatId,
      vacancyText(vacancy) +
        `\n\n📌 Статус: <b>${escapeHtml(vacancy.status || "draft")}</b>`,
      {
        reply_markup: inlineKeyboard([
          [
            {
              text: "📢 Опубликовать",
              callback_data: `publish_${vacancy.id}`,
            },
          ],
          [
            {
              text: "❌ Закрыть",
              callback_data: `close_${vacancy.id}`,
            },
          ],
        ]),
      }
    );
  }
}

async function startCreateVacancy(chatId) {
  await saveSession(chatId, "vacancy_title", {});

  await sendMessage(
    chatId,
    "<b>➕ СОЗДАНИЕ ВАКАНСИИ</b>\n\n1️⃣ Название вакансии:",
    {
      reply_markup: keyboard([
        [{ text: "❌ Отмена" }],
      ]),
    }
  );
}

async function handleVacancyStep(chatId, text, session) {
  const data = session.data || {};

  switch (session.state) {
    case "vacancy_title":
      data.title = text;
      await saveSession(chatId, "vacancy_profession", data);
      await sendMessage(chatId, "2️⃣ Профессия:");
      return;

    case "vacancy_profession":
      data.profession = text;
      await saveSession(chatId, "vacancy_location", data);
      await sendMessage(chatId, "3️⃣ Город / объект:");
      return;

    case "vacancy_location":
      data.location = text;
      await saveSession(chatId, "vacancy_experience", data);
      await sendMessage(chatId, "4️⃣ Требования по опыту:");
      return;

    case "vacancy_experience":
      data.experience = text;
      await saveSession(chatId, "vacancy_payment", data);
      await sendMessage(chatId, "5️⃣ Оплата:");
      return;

    case "vacancy_payment":
      data.payment = text;
      await saveSession(chatId, "vacancy_conditions", data);
      await sendMessage(chatId, "6️⃣ Условия:");
      return;

    case "vacancy_conditions":
      data.conditions = text;
      await saveSession(chatId, "vacancy_shift", data);
      await sendMessage(chatId, "7️⃣ Вахта? Например: Да / Нет:");
      return;

    case "vacancy_shift":
      data.shift = text;

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
        `<b>✅ ВАКАНСИЯ СОЗДАНА</b>\n\n${vacancyText(rows[0])}\n\nТеперь её можно опубликовать в канал.`,
        {
          reply_markup: inlineKeyboard([
            [
              {
                text: "📢 Опубликовать",
                callback_data: `publish_${rows[0].id}`,
              },
            ],
          ]),
        }
      );
      return;
  }
}

async function publishVacancy(vacancyId) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE id = ${vacancyId}
    LIMIT 1
  `;

  if (!rows.length) {
    throw new Error("Вакансия не найдена");
  }

  const vacancy = rows[0];

  const message = await telegram("sendMessage", {
    chat_id: `@${CHANNEL_USERNAME.replace("@", "")}`,
    text:
      `<b>🔥 НОВАЯ ВАКАНСИЯ</b>\n\n` +
      vacancyText(vacancy) +
      `\n\n<b>👇 Нажмите кнопку ниже, чтобы откликнуться.</b>`,
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([
      [
        {
          text: "📝 ОТКЛИКНУТЬСЯ",
          url: `https://t.me/${BOT_USERNAME}?start=vacancy_${vacancy.id}`,
        },
      ],
    ]),
  });

  await sql`
    UPDATE vacancies
    SET
      status = 'published',
      published_at = NOW(),
      channel_message_id = ${message.result.message_id},
      updated_at = NOW()
    WHERE id = ${vacancyId}
  `;

  return message.result;
}

async function handleCallback(callback) {
  const data = callback.data || "";
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;

  if (!chatId) return;

  try {
    if (data.startsWith("publish_")) {
      if (String(chatId) !== String(ADMIN_ID)) return;

      const vacancyId = data.replace("publish_", "");
      await publishVacancy(vacancyId);

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Вакансия опубликована",
      });

      await editMessage(
        chatId,
        messageId,
        "✅ <b>ВАКАНСИЯ ОПУБЛИКОВАНА В КАНАЛЕ</b>"
      );

      return;
    }

    if (data.startsWith("close_")) {
      if (String(chatId) !== String(ADMIN_ID)) return;

      const vacancyId = data.replace("close_", "");

      await sql`
        UPDATE vacancies
        SET
          status = 'closed',
          updated_at = NOW()
        WHERE id = ${vacancyId}
      `;

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Вакансия закрыта",
      });

      await editMessage(
        chatId,
        messageId,
        "❌ <b>ВАКАНСИЯ ЗАКРЫТА</b>"
      );

      return;
    }

    if (data.startsWith("app_accept_")) {
      if (String(chatId) !== String(ADMIN_ID)) return;

      const applicationId = data.replace("app_accept_", "");

      await sql`
        UPDATE applications
        SET status = 'accepted'
        WHERE id = ${applicationId}
      `;

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Заявка принята",
      });

      await editMessage(
        chatId,
        messageId,
        "✅ <b>ЗАЯВКА ПРИНЯТА</b>"
      );

      return;
    }

    if (data.startsWith("app_reject_")) {
      if (String(chatId) !== String(ADMIN_ID)) return;

      const applicationId = data.replace("app_reject_", "");

      await sql`
        UPDATE applications
        SET status = 'rejected'
        WHERE id = ${applicationId}
      `;

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Заявка отклонена",
      });

      await editMessage(
        chatId,
        messageId,
        "❌ <b>ЗАЯВКА ОТКЛОНЕНА</b>"
      );

      return;
    }

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
    });
  } catch (error) {
    console.error("Callback error:", error);

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Произошла ошибка",
      show_alert: true,
    });
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const username = message.from?.username || "";

  if (text === "/start") {
    await clearSession(chatId);

    await sendMessage(
      chatId,
      `<b>👋 Добро пожаловать в «Работа | Вахта»</b>\n\n` +
        `Здесь вы можете найти работу вахтой, оставить анкету специалиста или откликнуться на конкретную вакансию.`,
      {
        reply_markup: mainMenu(),
      }
    );
    return;
  }

  if (text.startsWith("/start vacancy_")) {
    const vacancyId = text.replace("/start vacancy_", "");

    const rows = await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacancyId}
      LIMIT 1
    `;

    if (!rows.length) {
      await sendMessage(
        chatId,
        "❌ Эта вакансия не найдена или уже закрыта.",
        {
          reply_markup: mainMenu(),
        }
      );
      return;
    }

    const vacancy = rows[0];

    await sendMessage(
      chatId,
      `<b>📝 ОТКЛИК НА ВАКАНСИЮ</b>\n\n${vacancyText(vacancy)}\n\nНачнём заполнение анкеты.`,
      {
        reply_markup: mainMenu(),
      }
    );

    await startCandidate(chatId, message.from, vacancyId);
    return;
  }

  if (text === "/admin" || text === "🔐 Админ-панель") {
    if (String(chatId) !== String(ADMIN_ID)) {
      await sendMessage(chatId, "⛔ Доступ запрещён.");
      return;
    }

    await sendMessage(
      chatId,
      "<b>🔐 АДМИН-ПАНЕЛЬ</b>\n\nВыберите раздел:",
      {
        reply_markup: adminMenu(),
      }
    );
    return;
  }

  if (text === "🔎 Вакансии") {
    await showVacancies(chatId);
    return;
  }

  if (text === "👷 Анкета специалиста") {
    await startCandidate(chatId, message.from);
    return;
  }

  if (text === "📋 Мои отклики") {
    await showMyApplications(chatId);
    return;
  }

  if (text === "ℹ️ О проекте") {
    await sendMessage(
      chatId,
      `<b>ℹ️ Работа | Вахта</b>\n\n` +
        `Подбор рабочих специалистов и актуальных вакансий.\n\n` +
        `Мы собираем анкеты специалистов и передаём их работодателям по подходящим вакансиям.`,
      {
        reply_markup: mainMenu(),
      }
    );
    return;
  }

  if (text === "⬅️ Главное меню") {
    await clearSession(chatId);

    await sendMessage(chatId, "Главное меню:", {
      reply_markup:
        String(chatId) === String(ADMIN_ID)
          ? adminMenu()
          : mainMenu(),
    });

    return;
  }

  if (text === "❌ Отмена") {
    await clearSession(chatId);

    await sendMessage(chatId, "Действие отменено.", {
      reply_markup:
        String(chatId) === String(ADMIN_ID)
          ? adminMenu()
          : mainMenu(),
    });

    return;
  }

  if (String(chatId) === String(ADMIN_ID)) {
    if (text === "📊 Статистика") {
      await showStats(chatId);
      return;
    }

    if (text === "👷 Все специалисты") {
      await showCandidates(chatId);
      return;
    }

    if (text === "📋 Все заявки") {
      await showApplications(chatId);
      return;
    }

    if (text === "📢 Вакансии") {
      await showAdminVacancies(chatId);
      return;
    }

    if (text === "➕ Добавить вакансию") {
      await startCreateVacancy(chatId);
      return;
    }
  }

  const session = await getSession(chatId);

  if (session) {
    if (session.state.startsWith("candidate_")) {
      await handleCandidateStep(chatId, message, session);
      return;
    }

    if (session.state.startsWith("vacancy_")) {
      await handleVacancyStep(chatId, text, session);
      return;
    }
  }

  await sendMessage(
    chatId,
    "Выберите действие из меню 👇",
    {
      reply_markup:
        String(chatId) === String(ADMIN_ID)
          ? adminMenu()
          : mainMenu(),
    }
  );
}

async function setWebhook() {
  const webhookUrl =
    "https://rabota-vakhta-bot.vercel.app/api/bot";

  return telegram("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (req.query?.setup === "1") {
        if (!BOT_TOKEN) {
          return json(res, {
            ok: false,
            error: "BOT_TOKEN is not configured",
          }, 500);
        }

        const result = await setWebhook();

        return json(res, {
          ok: true,
          message: "Webhook установлен",
          telegram: result,
        });
      }

      if (req.query?.health === "1") {
        return json(res, {
          ok: true,
          status: "online",
          bot: BOT_USERNAME,
          database: Boolean(POSTGRES_URL),
          admin: Boolean(ADMIN_ID),
        });
      }

      return json(res, {
        ok: true,
        status: "online",
        bot: BOT_USERNAME,
      });
    }

    if (req.method !== "POST") {
      return json(res, {
        ok: false,
        error: "Method not allowed",
      }, 405);
    }

    if (!BOT_TOKEN) {
      return json(res, {
        ok: false,
        error: "BOT_TOKEN is not configured",
      }, 500);
    }

    if (!POSTGRES_URL) {
      return json(res, {
        ok: false,
        error: "POSTGRES_URL is not configured",
      }, 500);
    }

    await initDatabase();

    const update = req.body;

    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    }

    if (update?.message) {
      await handleMessage(update.message);
    }

    return json(res, {
      ok: true,
    });
  } catch (error) {
    console.error("BOT ERROR:", error);

    return json(res, {
      ok: false,
      error: error.message || "Unknown error",
    }, 500);
  }
};
