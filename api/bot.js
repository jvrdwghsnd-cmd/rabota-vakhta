export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "BOT_TOKEN is not configured"
    });
  }

  // Установка webhookif (req.method === "GET" && req.query?.setup === "1") {
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

    if (text === "/start") {
      reply =
        "👷 РАБОТА | ВАХТА\n\n" +
        "Добро пожаловать!\n\n" +
        "🔎 Найти работу\n" +
        "👷 Я ищу работу\n" +
        "🏢 Я работодатель\n" +
        "📋 Разместить вакансию\n" +
        "📞 Связаться с администратором";
    } else if (text === "🔎 Найти работу") {
      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.\n\n" +
        "Например: монтажник, сварщик, маляр, изолировщик.";
    } else if (text === "👷 Я ищу работу") {
      reply =
        "👷 АНКЕТА СПЕЦИАЛИСТА\n\n" +
        "Напишите вашу профессию и опыт работы.";
    } else if (text === "🏢 Я работодатель") {
      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Вы можете разместить вакансию и найти подходящих специалистов.";
    } else if (text === "📋 Разместить вакансию") {
      reply =
        "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\n" +
        "Напишите название вакансии и город/объект.";
    } else if (text === "📞 Связаться с администратором") {
      reply =
        "📞 СВЯЗЬ С АДМИНИСТРАТОРОМ\n\n" +
        "Напишите ваше сообщение.";
    } else {
      reply =
        "Сообщение получено. 👷\n\n" +
        "Используйте /start для открытия главного меню.";
    }

    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply
        })
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
