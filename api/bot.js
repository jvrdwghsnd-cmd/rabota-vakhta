import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || "");

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tg(method, data = {}) {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return response.json();
}

async function sendMessage(chatId, text, keyboard = null) {
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
      payment TEXT NOT NULL,
      conditions TEXT NOT NULL,
      shift TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // На случай, если таблица vacancies уже была создана старой версией.
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
}

async function getSession(chatId) {
  const rows = await sql`
    SELECT * FROM bot_sessions
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
        shift
      )
      VALUES (
        ${String(chatId)},
        ${data.step || 0},
        ${data.name || null},
        ${data.phone || null},
        ${data.profession || null},
        ${data.experience || null},
        ${data.city || null},
        ${data.shift || null}
      )
    `;
    return;
  }

  await sql`
    UPDATE bot_sessions
    SET
      step = ${data.step !== undefined ? data.step : existing.step},
      name = ${data.name !== undefined ? data.name : existing.name},
      phone = ${data.phone !== undefined ? data.phone : existing.phone},
      profession = ${data.profession !== undefined ? data.profession : existing.profession},
      experience = ${data.experience !== undefined ? data.experience : existing.experience},
      city = ${data.city !== undefined ? data.city : existing.city},
      shift = ${data.shift !== undefined ? data.shift : existing.shift}
    WHERE chat_id = ${String(chatId)}
  `;
}

async function clearSession(chatId) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${String(chatId)}
  `;
}

const mainKeyboard = [
  ["👷 Я ищу работу"],
  ["📋 Разместить вакансию"],
  ["🏢 Я работодатель"],
  ["📞 Связаться с администратором"],
];

const adminKeyboard = [
  ["👷 Все анкеты", "🔎 Найти специалиста"],
  ["📋 Все вакансии"],
  ["📊 Статистика"],
  ["🏠 Главное меню"],
];

async function showMainMenu(chatId) {
  await sendMessage(
    chatId,
    "🏗️ РАБОТА | ВАХТА\n\nВыберите нужный раздел:",
    mainKeyboard
  );
}

async function showAdminPanel(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(chatId, "⛔ Доступ запрещён.");
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

  await sendMessage(
    chatId,
    `🔐 АДМИН-ПАНЕЛЬ

👷 Сохранённых анкет: ${candidates[0].count}
📋 Вакансий: ${vacancies[0].count}`,
    adminKeyboard
  );
}

async function showAllCandidates(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(chatId, "⛔ Доступ запрещён.");
    return;
  }

  const rows = await sql`
    SELECT *
    FROM candidates
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(chatId, "👷 Анкет пока нет.");
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

async function showAllVacancies(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(chatId, "⛔ Доступ запрещён.");
    return;
  }

  const rows = await sql`
    SELECT *
    FROM vacancies
    ORDER BY id DESC
  `;

  if (rows.length === 0) {
    await sendMessage(chatId, "📋 Вакансий пока нет.");
    return;
  }

  let text = "📋 ВСЕ ВАКАНСИИ\n\n";

  rows.forEach((row, index) => {
    text += `━━━━━━━━━━━━━━
📋 ВАКАНСИЯ №${index + 1}

📋 Название: ${row.title}
👷 Профессия: ${row.profession}
📍 Город / объект: ${row.location}
📅 Опыт: ${row.experience}
💰 Оплата: ${row.payment || "Не указана"}
📋 Условия: ${row.conditions || "Не указаны"}
🚧 Вахта: ${row.shift || "Не указано"}
📱 Контакт: ${row.phone}

`;
  });

  text += `━━━━━━━━━━━━━━
Всего вакансий: ${rows.length}`;

  await sendMessage(chatId, text);
}

async function startCandidate(chatId) {
  await setSession(chatId, {
    step: 1,
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
  });

  await sendMessage(
    chatId,
    "👷 АНКЕТА СОИСКАТЕЛЯ\n\nКак вас зовут?"
  );
}

async function startVacancy(chatId) {
  await setSession(chatId, {
    step: 201,
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
  });

  await sendMessage(
    chatId,
    "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\nВведите название вакансии:"
  );
}

async function startSearch(chatId) {
  await setSession(chatId, {
    step: 100,
  });

  await sendMessage(
    chatId,
    "🔎 ПОИСК СПЕЦИАЛИСТА\n\nВведите профессию.\n\nНапример:\nМонтажник\nСварщик\nМоляр\nИзолировщик"
  );
}

async function showStatistics(chatId) {
  if (String(chatId) !== ADMIN_ID) {
    await sendMessage(chatId, "⛔ Доступ запрещён.");
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

  const shifts = await sql`
    SELECT COUNT(*)::int AS count
    FROM candidates
    WHERE LOWER(shift) LIKE '%да%'
  `;

  await sendMessage(
    chatId,
    `📊 СТАТИСТИКА

👷 Специалистов: ${candidates[0].count}
📋 Вакансий: ${vacancies[0].count}
🚧 Ищут вахту: ${shifts[0].count}`
  );
}

async function handleCandidate(chatId, text, session) {
  if (session.step === 1) {
    await setSession(chatId, {
      ...session,
      step: 2,
      name: text,
    });

    await sendMessage(
      chatId,
      "👷 Какая у вас профессия?\n\nНапример:\nМонтажник строительных лесов\nСварщик\nМоляр\nИзолировщик"
    );

    return;
  }

  if (session.step === 2) {
    await setSession(chatId, {
      ...session,
      step: 3,
      profession: text,
    });

    await sendMessage(chatId, "📅 Сколько лет опыта?");
    return;
  }

  if (session.step === 3) {
    await setSession(chatId, {
      ...session,
      step: 4,
      experience: text,
    });

    await sendMessage(chatId, "📍 В каком городе вы находитесь?");
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
      "🚧 Готовы работать вахтой?\n\nОтветьте: Да или Нет"
    );

    return;
  }

  if (session.step === 5) {
    await setSession(chatId, {
      ...session,
      step: 6,
      shift: text,
    });

    await sendMessage(chatId, "📱 Укажите номер телефона:");
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

👤 Имя: ${session.name}
📱 Телефон: ${phone}
👷 Профессия: ${session.profession}
📅 Опыт: ${session.experience}
📍 Город: ${session.city}
🚧 Вахта: ${session.shift}

Ваша анкета добавлена в базу специалистов.`
    );

    await showMainMenu(chatId);
  }
}

async function handleVacancy(chatId, text, session) {
  // 201 — название вакансии
  if (session.step === 201) {
    await setSession(chatId, {
      ...session,
      step: 202,
      name: text,
    });

    await sendMessage(
      chatId,
      "👷 Укажите профессию.\n\nНапример:\nМонтажник строительных лесов\nСварщик\nМоляр\nИзолировщик"
    );

    return;
  }

  // 202 — профессия
  if (session.step === 202) {
    await setSession(chatId, {
      ...session,
      step: 203,
      profession: text,
    });

    await sendMessage(chatId, "📍 Укажите город или объект:");
    return;
  }

  // 203 — город / объект
  if (session.step === 203) {
    await setSession(chatId, {
      ...session,
      step: 204,
      city: text,
    });

    await sendMessage(
      chatId,
      "📅 Какой требуется опыт?\n\nНапример: от 2 лет"
    );

    return;
  }

  // 204 — опыт
  if (session.step === 204) {
    await setSession(chatId, {
      ...session,
      step: 205,
      experience: text,
    });

    await sendMessage(
      chatId,
      "💰 Укажите оплату.\n\nНапример:\n350 000 ₽ в месяц\nили\n5 000 ₽ за смену"
    );

    return;
  }

  // 205 — оплата
  if (session.step === 205) {
    await setSession(chatId, {
      ...session,
      step: 206,
      shift: text,
    });

    await sendMessage(
      chatId,
      "📋 Укажите условия работы.\n\nНапример:\nПроживание и питание предоставляются"
    );

    return;
  }

  // 206 — условия
  if (session.step === 206) {
    await setSession(chatId, {
      ...session,
      step: 207,
      shift: `${session.shift}|||${text}`,
    });

    await sendMessage(
      chatId,
      "🚧 Работа вахтой?\n\nОтветьте: Да или Нет"
    );

    return;
  }

  // 207 — вахта
  if (session.step === 207) {
    const temporaryData = (session.shift || "").split("|||");

    const payment = temporaryData[0] || "Не указана";
    const conditions = temporaryData[1] || "Не указаны";
    const shift = text;

    await setSession(chatId, {
      ...session,
      step: 208,
      shift: `${payment}|||${conditions}|||${shift}`,
    });

    await sendMessage(chatId, "📱 Укажите контактный номер работодателя:");
    return;
  }

  // 208 — телефон
  if (session.step === 208) {
    const temporaryData = (session.shift || "").split("|||");

    const payment = temporaryData[0] || "Не указана";
    const conditions = temporaryData[1] || "Не указаны";
    const shift = temporaryData[2] || "Не указано";

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
        phone
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
        ${phone}
      )
    `;

    await clearSession(chatId);

    await sendMessage(
      chatId,
      `✅ ВАКАНСИЯ ПРИНЯТА!

📋 Вакансия: ${session.name}
👷 Профессия: ${session.profession}
📍 Город / объект: ${session.city}
📅 Опыт: ${session.experience}
💰 Оплата: ${payment}
📋 Условия: ${conditions}
🚧 Вахта: ${shift}
📱 Контакт: ${phone}

Вакансия сохранена.`
    );

    await showMainMenu(chatId);
  }
}

async function handleSearch(chatId, text) {
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

  await sendMessage(chatId, result);
}

export default async function handler(req, res) {
  try {
    await initDb();

    if (req.method === "GET") {
      if (req.query.setup === "1") {
        await tg("setWebhook", {
          url: `https://${req.headers.host}/api/bot`,
        });

        return res.status(200).json({
          ok: true,
          message: "Webhook установлен",
        });
      }

      return res.status(200).json({
        ok: true,
        message: "Bot is working",
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const update = req.body;

    if (!update || !update.message) {
      return res.status(200).json({
        ok: true,
      });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text ? message.text.trim() : "";

    if (!text) {
      return res.status(200).json({
        ok: true,
      });
    }

    // Команда /start
    if (text === "/start") {
      await clearSession(chatId);
      await showMainMenu(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Команда /id
    if (text === "/id") {
      await sendMessage(
        chatId,
        `🆔 Ваш Telegram ID:\n${chatId}`
      );

      return res.status(200).json({
        ok: true,
      });
    }

    // Админ
    if (text === "/admin" || text === "🔐 Админ-панель") {
      await showAdminPanel(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Главное меню
    if (text === "🏠 Главное меню") {
      await clearSession(chatId);
      await showMainMenu(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Все анкеты
    if (text === "👷 Все анкеты") {
      await showAllCandidates(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Все вакансии
    if (text === "📋 Все вакансии") {
      await showAllVacancies(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Статистика
    if (text === "📊 Статистика") {
      await showStatistics(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Поиск специалиста
    if (text === "🔎 Найти специалиста") {
      await startSearch(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Я ищу работу
    if (text === "👷 Я ищу работу") {
      await startCandidate(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Разместить вакансию
    if (text === "📋 Разместить вакансию") {
      await startVacancy(chatId);

      return res.status(200).json({
        ok: true,
      });
    }

    // Работодатель
    if (text === "🏢 Я работодатель") {
      await sendMessage(
        chatId,
        `🏢 РАЗДЕЛ ДЛЯ РАБОТОДАТЕЛЯ

Здесь вы можете:

📋 Разместить вакансию
🔎 Найти специалиста
📞 Связаться с администратором`,
        mainKeyboard
      );

      return res.status(200).json({
        ok: true,
      });
    }

    // Связь с администратором
    if (text === "📞 Связаться с администратором") {
      await sendMessage(
        chatId,
        "📞 Для связи с администратором напишите сообщение в этот чат."
      );

      return res.status(200).json({
        ok: true,
      });
    }

    const session = await getSession(chatId);

    if (session) {
      // Поиск специалиста
      if (session.step === 100) {
        await handleSearch(chatId, text);
        await clearSession(chatId);

        return res.status(200).json({
          ok: true,
        });
      }

      // Анкета специалиста
      if (session.step >= 1 && session.step <= 6) {
        await handleCandidate(chatId, text, session);

        return res.status(200).json({
          ok: true,
        });
      }

      // Вакансия
      if (session.step >= 201 && session.step <= 208) {
        await handleVacancy(chatId, text, session);

        return res.status(200).json({
          ok: true,
        });
      }
    }

    await showMainMenu(chatId);

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    console.error("BOT ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
