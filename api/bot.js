export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "BOT_TOKEN is not configured"
    });
  }

  // Установка webhook
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

  // Проверка работы
  if (req.method !== "POST") {
    return res.status(200).send("РАБОТА | ВАХТА — бот работает");
  }

  try {
    const update = req.body;

    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    let reply = "";
    let keyboard = null;

    // Главное меню
    if (text === "/start") {
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

    } else if (text === "👷 Я ищу работу") {
      reply =
        "👷 АНКЕТА СПЕЦИАЛИСТА\n\n" +
        "Напишите вашу профессию и опыт работы.\n\n" +
        "Например:\n" +
        "Монтажник ЖБК, опыт 5 лет.";

    } else if (text === "🏢 Я работодатель") {
      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Здесь вы сможете разместить вакансию " +
        "и найти подходящих специалистов.\n\n" +
        "Нажмите «📋 Разместить вакансию».";

    } else if (text === "🔎 Найти работу") {
      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.\n\n" +
        "Например:\n" +
        "монтажник, сварщик, маляр, изолировщик.";

    } else if (text === "📋 Разместить вакансию") {
      reply =
        "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\n" +
        "Напишите:\n\n" +
        "1. Название вакансии\n" +
        "2. Город / объект\n" +
        "3. Условия работы\n" +
        "4. График\n" +
        "5. Контактное лицо\n\n" +
        "Мы свяжемся с вами для размещения.";

    } else if (text === "📞 Связаться с администратором") {
      reply =
        "📞 СВЯЗЬ С АДМИНИСТРАТОРОМ\n\n" +
        "Напишите ваше сообщение.\n" +
        "Администратор свяжется с вами.";

    } else {
      reply =
        "Сообщение получено. 👷\n\n" +
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
