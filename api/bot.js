import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id TEXT PRIMARY KEY,
      step INTEGER NOT NULL DEFAULT 1,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
}

async function getSession(chatId) {
  const rows = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${String(chatId)}
    LIMIT 1
  `;

  return rows[0] || null;
}

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "BOT_TOKEN is not configured"
    });
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({
      ok: false,
      error: "POSTGRES_URL is not configured"
    });
  }

  if (req.method === "GET" && req.query?.setup === "1") {
    const checkResponse = await fetch(
      `https://api.telegram.org/bot${token}/getMe`
    );

    const checkResult = await checkResponse.json();

    if (!checkResult.ok) {
      return res.status(200).json({
        ok: false,
        step: "getMe",
        telegram: checkResult
      });
    }

    const webhookUrl =
      "https://rabota-vakhta-bot.vercel.app/api/bot";

    const webhookResponse = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    );

    const webhookResult = await webhookResponse.json();

    return res.status(200).json({
      ok: webhookResult.ok,
      bot: checkResult.result.username,
      webhook: webhookResult
    });
  }

  if (req.method !== "POST") {
    return res.status(200).send("РАБОТА | ВАХТА — бот работает");
  }

  try {
    await initDb();

    const update = req.body;

    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const chatIdText = String(chatId);
    const text = update.message.text || "";

    let reply = "";
    let keyboard = null;

    const session = await getSession(chatId);

    // TELEGRAM ID
    if (text === "/id") {

      reply =
        "🆔 Ваш Telegram ID:\n\n" +
        chatIdText;

    // START
    } else if (text === "/start") {

      await sql`
        DELETE FROM bot_sessions
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "👷 РАБОТА | ВАХТА\n\n" +
        "Добро пожаловать!\n\n" +
        "Выберите нужный раздел:";

      keyboard = {
        keyboard: [
          [
            { text: "👷 Я ищу работу" },
            { text: "🏢 Я работодатель" }
          ],
          [
            { text: "🔎 Найти работу" },
            { text: "📋 Разместить вакансию" }
          ],
          [
            { text: "📞 Связаться с администратором" }
          ]
        ],
        resize_keyboard: true
      };

    // НАЧАЛО АНКЕТЫ
    } else if (text === "👷 Я ищу работу") {

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
          ${chatIdText},
          1,
          '',
          '',
          '',
          '',
          '',
          ''
        )
        ON CONFLICT (chat_id)
        DO UPDATE SET
          step = 1,
          name = '',
          phone = '',
          profession = '',
          experience = '',
          city = '',
          shift = '',
          updated_at = NOW()
      `;

      reply =
        "👷 АНКЕТА СПЕЦИАЛИСТА\n\n" +
        "Шаг 1 из 6\n\n" +
        "Напишите ваше имя.";

    // ШАГ 1
    } else if (session?.step === 1) {

      await sql`
        UPDATE bot_sessions
        SET
          name = ${text},
          step = 2,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📱 Шаг 2 из 6\n\n" +
        "Напишите ваш номер телефона.";

    // ШАГ 2
    } else if (session?.step === 2) {

      await sql`
        UPDATE bot_sessions
        SET
          phone = ${text},
          step = 3,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "👷 Шаг 3 из 6\n\n" +
        "Какая у вас профессия?";

    // ШАГ 3
    } else if (session?.step === 3) {

      await sql`
        UPDATE bot_sessions
        SET
          profession = ${text},
          step = 4,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📅 Шаг 4 из 6\n\n" +
        "Сколько лет опыта работы?";

    // ШАГ 4
    } else if (session?.step === 4) {

      await sql`
        UPDATE bot_sessions
        SET
          experience = ${text},
          step = 5,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📍 Шаг 5 из 6\n\n" +
        "В каком городе вы находитесь?";

    // ШАГ 5
    } else if (session?.step === 5) {

      await sql`
        UPDATE bot_sessions
        SET
          city = ${text},
          step = 6,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "🚧 Шаг 6 из 6\n\n" +
        "Готовы работать вахтой?\n\n" +
        "Напишите: Да или Нет.";

    // ШАГ 6
    } else if (session?.step === 6) {

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
          ${chatIdText},
          ${session.name || ""},
          ${session.phone || ""},
          ${session.profession || ""},
          ${session.experience || ""},
          ${session.city || ""},
          ${text}
        )
      `;

      await sql`
        DELETE FROM bot_sessions
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "✅ АНКЕТА ПРИНЯТА!\n\n" +
        "👤 Имя: " + session.name + "\n" +
        "📱 Телефон: " + session.phone + "\n" +
        "👷 Профессия: " + session.profession + "\n" +
        "📅 Опыт: " + session.experience + "\n" +
        "📍 Город: " + session.city + "\n" +
        "🚧 Вахта: " + text + "\n\n" +
        "Спасибо! Ваша анкета сохранена.";

    // РАБОТОДАТЕЛЬ
    } else if (text === "🏢 Я работодатель") {

      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Для размещения вакансии нажмите:\n" +
        "📋 Разместить вакансию";

    // ПОИСК РАБОТЫ
    } else if (text === "🔎 Найти работу") {

      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.";

    // РАЗМЕЩЕНИЕ ВАКАНСИИ
    } else if (text === "📋 Разместить вакансию") {

      reply =
        "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\n" +
        "Напишите название вакансии и город/объект.";

    // АДМИНИСТРАТОР
    } else if (text === "📞 Связаться с администратором") {

      reply =
        "📞 СВЯЗЬ С АДМИНИСТРАТОРОМ\n\n" +
        "Напишите ваше сообщение.";

    } else {

      reply =
        "Используйте /start для открытия главного меню.";
    }

    const messageData = {
      chat_id: chatId,
      text: reply
    };

    if (keyboard) {
      messageData.reply_markup = keyboard;
    }

    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(messageData)
      }
    );

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}
