import { neon } from "@neondatabase/serverless";

const BOT_TOKEN = process.env.BOT_TOKEN;
const POSTGRES_URL = process.env.POSTGRES_URL;
const ADMIN_ID = process.env.ADMIN_ID || "";
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || "@vakhtovyk";

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

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
}

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

  if (String(chatId) === String(ADMIN_ID)) {
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
  await sendMessage(chatId, text, {
    reply_markup: mainKeyboard(chatId),
  });
}

async function handleStart(message) {
  const chatId = message.chat.id;
  const args = String(message.text || "").split(" ")[1];

  if (args && args.startsWith("vacancy_")) {
    const vacancyId = Number(
      args.replace("vacancy_", "")
    );

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
      `📩 Отклик на вакансию\n\n${vacancy.title}\n\nВведите ваше имя и фамилию:`
    );
  }

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "👋 Добро пожаловать в «Работа | Вахта».\n\nЗдесь можно найти работу, разместить вакансию и оставить анкету специалиста.",
    {
      reply_markup: mainKeyboard(chatId),
    }
  );
}

async function candidateFlow(message, session) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

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
    await setSession(chatId, {
      ...session,
      step: "candidate_save",
      shift: value,
    });

    const updated = await getSession(chatId);

    await sql`
      INSERT INTO candidates (
        chat_id,
        username,
        name,
        phone,
        profession,
        experience,
        city,
        shift
      )
      VALUES (
        ${chatId},
        ${message.from?.username || null},
        ${updated.name},
        ${updated.phone},
        ${updated.profession},
        ${updated.experience},
        ${updated.city},
        ${updated.shift}
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ Анкета сохранена!\n\nМы получили ваши данные."
    );

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `🆕 Новая анкета специалиста\n\nИмя: ${updated.name}\nТелефон: ${updated.phone}\nПрофессия: ${updated.profession}\nОпыт: ${updated.experience}\nГород: ${updated.city}\nВахта: ${updated.shift}`
      );
    }

    return mainMenu(chatId);
  }
}

async function vacancyFlow(message, session) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

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

    await sql`
      INSERT INTO vacancies (
        chat_id,
        title,
        profession,
        city,
        experience,
        payment,
        conditions,
        shift,
        phone
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
        ${updated.phone}
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ Вакансия сохранена!\n\nОна отправлена администратору на проверку.",
      {
        reply_markup: employerKeyboard(),
      }
    );

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `📋 Новая вакансия\n\nНазвание: ${updated.name}\nПрофессия: ${updated.profession}\nГород: ${updated.city}\nОпыт: ${updated.experience}\nОплата: ${updated.payment}\nУсловия: ${updated.conditions}\nВахта: ${updated.shift}\nТелефон: ${updated.phone}`
      );
    }
  }
}

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

    await sql`
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
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      "✅ Отклик отправлен!\n\nРаботодатель получил вашу заявку."
    );

    if (vacancy.chat_id) {
      await sendMessage(
        vacancy.chat_id,
        `📩 Новый отклик!\n\nВакансия: ${vacancy.title}\nИмя: ${updated.name}\nТелефон: ${updated.phone}\nОпыт: ${updated.experience}`
      );
    }

    if (ADMIN_ID) {
      await sendMessage(
        ADMIN_ID,
        `📩 Новый отклик\n\nВакансия: ${vacancy.title}\nИмя: ${updated.name}\nТелефон: ${updated.phone}\nОпыт: ${updated.experience}`
      );
    }

    return mainMenu(chatId);
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const value = String(message.text || "").trim();

  if (value === "/start" || value.startsWith("/start ")) {
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

  if (value === "👷 Я ищу работу") {
    await setSession(chatId, {
      step: "candidate_name",
    });

    return sendMessage(
      chatId,
      "👷 <b>Анкета специалиста</b>\n\nВведите имя и фамилию:",
      {
        parse_mode: "HTML",
      }
    );
  }

  if (value === "📋 Разместить вакансию") {
    await setSession(chatId, {
      step: "vacancy_title",
    });

    return sendMessage(
      chatId,
      "📋 <b>Создание вакансии</b>\n\nВведите название вакансии:",
      {
        parse_mode: "HTML",
      }
    );
  }

  if (
    value === "🏢 Работодатель"
  ) {
    return sendMessage(
      chatId,
      "🏢 <b>Кабинет работодателя</b>\n\nЗдесь можно создавать вакансии и получать отклики.",
      {
        parse_mode: "HTML",
        reply_markup: employerKeyboard(),
      }
    );
  }

  if (
    value === "📞 Администратор"
  ) {
    return sendMessage(
      chatId,
      "📞 По вопросам сотрудничества обратитесь к администратору."
    );
  }

  if (
    value === "🔐 Админ-панель"
  ) {
    if (
      String(chatId) !== String(ADMIN_ID)
    ) {
      return mainMenu(chatId);
    }

    return sendMessage(
      chatId,
      "🔐 <b>Админ-панель</b>\n\nВыберите раздел:",
      {
        parse_mode: "HTML",
        reply_markup: adminKeyboard(),
      }
    );
  }

  if (
    value === "📊 Статистика"
  ) {
    if (
      String(chatId) !== String(ADMIN_ID)
    ) {
      return;
    }

    const candidates =
      await sql`SELECT COUNT(*)::int AS n FROM candidates`;

    const vacancies =
      await sql`SELECT COUNT(*)::int AS n FROM vacancies`;

    const applications =
      await sql`SELECT COUNT(*)::int AS n FROM applications`;

    return sendMessage(
      chatId,
      `📊 <b>Статистика</b>\n\n👷 Специалистов: ${candidates[0].n}\n📋 Вакансий: ${vacancies[0].n}\n📩 Откликов: ${applications[0].n}`,
      {
        parse_mode: "HTML",
      }
    );
  }

  const session = await getSession(chatId);

  if (session) {
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

export default async function handler(
  req,
  res
) {
  try {
    if (req.method === "GET") {
      if (
        req.query?.setup === "1"
      ) {
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
      error: error.message,
    });
  }
}
