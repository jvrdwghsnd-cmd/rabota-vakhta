export default async function handler(req, res) {
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
        "Здесь вы можете найти работу, разместить вакансию или оставить заявку.\n\n" +
        "🔎 Найти работу\n" +
        "👷 Я ищу работу\n" +
        "🏢 Я работодатель\n" +
        "📋 Разместить вакансию\n" +
        "📞 Связаться с администратором";
    } else if (text === "🔎 Найти работу") {
      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.\n\n" +
        "Например:\n" +
        "• монтажник\n" +
        "• сварщик\n" +
        "• моляр\n" +
        "• изолировщик";
    } else if (text === "👷 Я ищу работу") {
      reply =
        "👷 АНКЕТА СПЕЦИАЛИСТА\n\n" +
        "Напишите:\n" +
        "1. Профессию\n" +
        "2. Опыт работы\n" +
        "3. Город проживания\n" +
        "4. Готовность к вахте\n\n" +
        "После этого с вами свяжется специалист.";
    } else if (text === "🏢 Я работодатель") {
      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Мы помогаем находить рабочих специалистов для объектов.\n\n" +
        "Вы можете разместить свою вакансию и получить отклики кандидатов.";
    } else if (text === "📋 Разместить вакансию") {
      reply =
        "📋 РАЗМЕЩЕНИЕ ВАКАНСИИ\n\n" +
        "Напишите информацию:\n\n" +
        "• Название вакансии\n" +
        "• Город / объект\n" +
        "• Требования\n" +
        "• Количество специалистов\n\n" +
        "Мы свяжемся с вами для уточнения деталей.";
    } else if (text === "📞 Связаться с администратором") {
      reply =
        "📞 СВЯЗЬ С АДМИНИСТРАТОРОМ\n\n" +
        "Напишите ваше сообщение.\n\n" +
        "Администратор свяжется с вами.";
    } else {
      reply =
        "Сообщение получено. 👷\n\n" +
        "Используйте /start, чтобы открыть главное меню.";
    }

    const token = process.env.BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "BOT_TOKEN is not configured"
      });
    }

    const telegramResponse = await fetch(
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

    const telegramResult = await telegramResponse.json();

    if (!telegramResult.ok) {
      console.error("Telegram error:", telegramResult);
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
