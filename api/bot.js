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

  await sql`
    CREATE TABLE IF NOT EXISTS vacancies (
      id BIGSERIAL PRIMARY KEY,
      chat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      profession TEXT NOT NULL,
      location TEXT NOT NULL,
      experience TEXT NOT NULL,
      conditions TEXT NOT NULL,
      shift TEXT NOT NULL,
      phone TEXT NOT NULL,
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

    // ADMIN PANEL
    } else if (text === "/admin") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const candidates = await sql`
          SELECT COUNT(*)::int AS count
          FROM candidates
        `;

        const vacancies = await sql`
          SELECT COUNT(*)::int AS count
          FROM vacancies
        `;

        reply =
          "🔐 АДМИН-ПАНЕЛЬ\n\n" +
          "👷 Сохранённых анкет: " +
          candidates[0].count +
          "\n" +
          "📋 Вакансий: " +
          vacancies[0].count;

        keyboard = {
          keyboard: [
            [
              { text: "👷 Все анкеты" },
              { text: "🔎 Найти специалиста" }
            ],
            [
              { text: "📋 Все вакансии" },
              { text: "📊 Статистика" }
            ],
            [
              { text: "🏠 Главное меню" }
            ]
          ],
          resize_keyboard: true
        };
      }

    // ALL CANDIDATES
    } else if (text === "👷 Все анкеты") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const rows = await sql`
          SELECT
            id,
            name,
            phone,
            profession,
            experience,
            city,
            shift
          FROM candidates
          ORDER BY created_at DESC
        `;

        if (rows.length === 0) {

          reply =
            "👷 ВСЕ АНКЕТЫ\n\n" +
            "Анкет пока нет.";

        } else {

          reply = "👷 ВСЕ АНКЕТЫ\n\n";

          rows.forEach((candidate, index) => {

            reply +=
              "━━━━━━━━━━━━━━\n" +
              "👤 №" + (index + 1) + "\n\n" +
              "👤 Имя: " + candidate.name + "\n" +
              "📱 Телефон: " + candidate.phone + "\n" +
              "👷 Профессия: " + candidate.profession + "\n" +
              "📅 Опыт: " + candidate.experience + "\n" +
              "📍 Город: " + candidate.city + "\n" +
              "🚧 Вахта: " + candidate.shift + "\n";
          });

          reply +=
            "\n━━━━━━━━━━━━━━\n" +
            "Всего анкет: " + rows.length;
        }
      }

      keyboard = {
        keyboard: [
          [
            { text: "👷 Все анкеты" },
            { text: "🔎 Найти специалиста" }
          ],
          [
            { text: "📋 Все вакансии" },
            { text: "📊 Статистика" }
          ],
          [
            { text: "🔐 Админ-панель" }
          ]
        ],
        resize_keyboard: true
      };

    // START SEARCH
    } else if (text === "🔎 Найти специалиста") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        await sql`
          INSERT INTO bot_sessions (
            chat_id,
            step
          )
          VALUES (
            ${chatIdText},
            100
          )
          ON CONFLICT (chat_id)
          DO UPDATE SET
            step = 100,
            updated_at = NOW()
        `;

        reply =
          "🔎 ПОИСК СПЕЦИАЛИСТА\n\n" +
          "Введите профессию.\n\n" +
          "Например:\n" +
          "• Сварщик\n" +
          "• Монтажник\n" +
          "• Моляр\n" +
          "• Изолировщик";
      }

      keyboard = {
        keyboard: [
          [
            { text: "🔐 Админ-панель" }
          ]
        ],
        resize_keyboard: true
      };

    // SEARCH RESULT
    } else if (session?.step === 100) {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const searchText = text.trim();

        const rows = await sql`
          SELECT
            id,
            name,
            phone,
            profession,
            experience,
            city,
            shift
          FROM candidates
          WHERE profession ILIKE ${"%" + searchText + "%"}
          ORDER BY created_at DESC
        `;

        if (rows.length === 0) {

          reply =
            "🔎 РЕЗУЛЬТАТ ПОИСКА\n\n" +
            "Специалисты по запросу «" +
            searchText +
            "» не найдены.";

        } else {

          reply =
            "🔎 РЕЗУЛЬТАТ ПОИСКА\n\n" +
            "Найдено специалистов: " +
            rows.length +
            "\n";

          rows.forEach((candidate, index) => {

            reply +=
              "\n━━━━━━━━━━━━━━\n" +
              "👤 №" + (index + 1) + "\n\n" +
              "👤 Имя: " + candidate.name + "\n" +
              "📱 Телефон: " + candidate.phone + "\n" +
              "👷 Профессия: " + candidate.profession + "\n" +
              "📅 Опыт: " + candidate.experience + "\n" +
              "📍 Город: " + candidate.city + "\n" +
              "🚧 Вахта: " + candidate.shift + "\n";
          });
        }

        await sql`
          DELETE FROM bot_sessions
          WHERE chat_id = ${chatIdText}
        `;
      }

      keyboard = {
        keyboard: [
          [
            { text: "🔎 Найти специалиста" },
            { text: "👷 Все анкеты" }
          ],
          [
            { text: "📋 Все вакансии" },
            { text: "📊 Статистика" }
          ],
          [
            { text: "🔐 Админ-панель" }
          ]
        ],
        resize_keyboard: true
      };

    // START VACANCY
    } else if (text === "📋 Разместить вакансию") {

      await sql`
        INSERT INTO bot_sessions (
          chat_id,
          step
        )
        VALUES (
          ${chatIdText},
          200
        )
        ON CONFLICT (chat_id)
        DO UPDATE SET
          step = 200,
          updated_at = NOW()
      `;

      reply =
        "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\n" +
        "Шаг 1 из 7\n\n" +
        "Напишите название вакансии.\n\n" +
        "Например: Монтажник строительных лесов";

      keyboard = {
        remove_keyboard: true
      };

    // VACANCY STEP 1
    } else if (session?.step === 200) {

      await sql`
        UPDATE bot_sessions
        SET
          name = ${text},
          step = 201,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "👷 Шаг 2 из 7\n\n" +
        "Какая профессия требуется?";

    // VACANCY STEP 2
    } else if (session?.step === 201) {

      await sql`
        UPDATE bot_sessions
        SET
          profession = ${text},
          step = 202,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📍 Шаг 3 из 7\n\n" +
        "Укажите город и объект.";

    // VACANCY STEP 3
    } else if (session?.step === 202) {

      await sql`
        UPDATE bot_sessions
        SET
          city = ${text},
          step = 203,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📅 Шаг 4 из 7\n\n" +
        "Какой опыт требуется?\n\n" +
        "Например: от 2 лет.";

    // VACANCY STEP 4
    } else if (session?.step === 203) {

      await sql`
        UPDATE bot_sessions
        SET
          experience = ${text},
          step = 204,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "💰 Шаг 5 из 7\n\n" +
        "Опишите условия и оплату.";

    // VACANCY STEP 5
    } else if (session?.step === 204) {

      await sql`
        UPDATE bot_sessions
        SET
          shift = ${text},
          step = 205,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "🚧 Шаг 6 из 7\n\n" +
        "Работа вахтой?\n\n" +
        "Напишите: Да или Нет.";

    // VACANCY STEP 6
    } else if (session?.step === 205) {

      await sql`
        UPDATE bot_sessions
        SET
          shift = ${text},
          step = 206,
          updated_at = NOW()
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "📱 Шаг 7 из 7\n\n" +
        "Укажите контактный номер работодателя.";

    // VACANCY STEP 7
    } else if (session?.step === 206) {

      const vacancyTitle = session.name || "";
      const vacancyProfession = session.profession || "";
      const vacancyLocation = session.city || "";
      const vacancyExperience = session.experience || "";
      const vacancyShift = session.shift || "";

      await sql`
        INSERT INTO vacancies (
          chat_id,
          title,
          profession,
          location,
          experience,
          conditions,
          shift,
          phone
        )
        VALUES (
          ${chatIdText},
          ${vacancyTitle},
          ${vacancyProfession},
          ${vacancyLocation},
          ${vacancyExperience},
          ${"Условия указаны работодателем"},
          ${vacancyShift},
          ${text}
        )
      `;

      await sql`
        DELETE FROM bot_sessions
        WHERE chat_id = ${chatIdText}
      `;

      reply =
        "✅ ВАКАНСИЯ ПРИНЯТА!\n\n" +
        "📋 Вакансия: " + vacancyTitle + "\n" +
        "👷 Профессия: " + vacancyProfession + "\n" +
        "📍 Город / объект: " + vacancyLocation + "\n" +
        "📅 Опыт: " + vacancyExperience + "\n" +
        "🚧 Вахта: " + vacancyShift + "\n" +
        "📱 Контакт: " + text + "\n\n" +
        "Вакансия сохранена.";

      keyboard = {
        keyboard: [
          [
            { text: "🏠 Главное меню" }
          ]
        ],
        resize_keyboard: true
      };

    // ALL VACANCIES
    } else if (text === "📋 Все вакансии") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const rows = await sql`
          SELECT
            id,
            title,
            profession,
            location,
            experience,
            conditions,
            shift,
            phone
          FROM vacancies
          ORDER BY created_at DESC
        `;

        if (rows.length === 0) {

          reply =
            "📋 ВСЕ ВАКАНСИИ\n\n" +
            "Вакансий пока нет.";

        } else {

          reply = "📋 ВСЕ ВАКАНСИИ\n\n";

          rows.forEach((vacancy, index) => {

            reply +=
              "━━━━━━━━━━━━━━\n" +
              "📋 №" + (index + 1) + "\n\n" +
              "📋 Вакансия: " + vacancy.title + "\n" +
              "👷 Профессия: " + vacancy.profession + "\n" +
              "📍 Объект: " + vacancy.location + "\n" +
              "📅 Опыт: " + vacancy.experience + "\n" +
              "🚧 Вахта: " + vacancy.shift + "\n" +
              "📱 Контакт: " + vacancy.phone + "\n";
          });

          reply +=
            "\n━━━━━━━━━━━━━━\n" +
            "Всего вакансий: " + rows.length;
        }
      }

      keyboard = {
        keyboard: [
          [
            { text: "📋 Все вакансии" },
            { text: "👷 Все анкеты" }
          ],
          [
            { text: "🔎 Найти специалиста" },
            { text: "📊 Статистика" }
          ],
          [
            { text: "🔐 Админ-панель" }
          ]
        ],
        resize_keyboard: true
      };

    // STATISTICS
    } else if (text === "📊 Статистика") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const totalCandidates = await sql`
          SELECT COUNT(*)::int AS count
          FROM candidates
        `;

        const totalVacancies = await sql`
          SELECT COUNT(*)::int AS count
          FROM vacancies
        `;

        const cities = await sql`
          SELECT COUNT(DISTINCT city)::int AS count
          FROM candidates
        `;

        const professions = await sql`
          SELECT COUNT(DISTINCT profession)::int AS count
          FROM candidates
        `;

        reply =
          "📊 СТАТИСТИКА\n\n" +
          "👷 Специалистов: " +
          totalCandidates[0].count +
          "\n" +
          "📋 Вакансий: " +
          totalVacancies[0].count +
          "\n" +
          "📍 Городов специалистов: " +
          cities[0].count +
          "\n" +
          "👷 Профессий специалистов: " +
          professions[0].count;
      }

      keyboard = {
        keyboard: [
          [
            { text: "👷 Все анкеты" },
            { text: "🔎 Найти специалиста" }
          ],
          [
            { text: "📋 Все вакансии" },
            { text: "📊 Статистика" }
          ],
          [
            { text: "🏠 Главное меню" }
          ]
        ],
        resize_keyboard: true
      };

    // ADMIN BUTTON
    } else if (text === "🔐 Админ-панель") {

      if (chatIdText !== String(process.env.ADMIN_ID)) {

        reply = "⛔ Доступ запрещён.";

      } else {

        const candidates = await sql`
          SELECT COUNT(*)::int AS count
          FROM candidates
        `;

        const vacancies = await sql`
          SELECT COUNT(*)::int AS count
          FROM vacancies
        `;

        reply =
          "🔐 АДМИН-ПАНЕЛЬ\n\n" +
          "👷 Сохранённых анкет: " +
          candidates[0].count +
          "\n" +
          "📋 Вакансий: " +
          vacancies[0].count;

        keyboard = {
          keyboard: [
            [
              { text: "👷 Все анкеты" },
              { text: "🔎 Найти специалиста" }
            ],
            [
              { text: "📋 Все вакансии" },
              { text: "📊 Статистика" }
            ],
            [
              { text: "🏠 Главное меню" }
            ]
          ],
          resize_keyboard: true
        };
      }

    // MAIN MENU
    } else if (text === "🏠 Главное меню") {

      reply =
        "👷 РАБОТА | ВАХТА\n\n" +
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

    // CANDIDATE START
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

    // CANDIDATE STEP 1
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

    // CANDIDATE STEP 2
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

    // CANDIDATE STEP 3
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

    // CANDIDATE STEP 4
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

    // CANDIDATE STEP 5
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

    // CANDIDATE STEP 6
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

    // EMPLOYER
    } else if (text === "🏢 Я работодатель") {

      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Для размещения вакансии нажмите:\n" +
        "📋 Разместить вакансию";

    // JOB SEARCH
    } else if (text === "🔎 Найти работу") {

      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.";

    // ADMIN CONTACT
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
