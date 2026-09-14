export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Vakhtovyk bot is running");
  }

  try {
    const update = req.body;

    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || "";

      let reply = "";

      if (text === "/start") {
        reply =
          "👷 РАБОТА | ВАХТА\n\n" +
          "Добро пожаловать!\n\n" +
          "Выберите действие:\n\n" +
          "🔎 Найти работу\n" +
          "👷 Я ищу работу\n" +
          "🏢 Я работодатель\n" +
          "📋 Разместить вакансию\n" +
          "📞 Связаться с администратором";
      } else if (text === "🔎 Найти работу") {
        reply =
          "🔎 Поиск работы\n\n" +
          "Напишите профессию, которая вас интересует.\n\n" +
          "Например: монтажник, сварщик, маляр, изолировщик.";
      } else if (text === "👷 Я ищу работу") {
        reply =
          "👷 Анкета специалиста\n\n" +
          "Напишите вашу профессию и опыт работы.";
      } else if (text === "🏢 Я работодатель") {
        reply =
          "🏢 Для работодателей\n\n" +
          "Вы можете разместить вакансию и найти подходящих специалистов.";
      } else if (text === "📋 Разместить вакансию") {
        reply =
          "📋 Размещение вакансии\n\n" +
          "Напишите название вакансии и город/объект.";
      } else if (text === "📞 Связаться с администратором") {
        reply =
          "📞 Связь с администратором\n\n" +
          "Напишите ваше сообщение. Администратор свяжется с вами.";
      } else {
        reply =
          "Принял сообщение.\n\n" +
          "Используйте /start для открытия главного меню.";
      }

      const token = process.env.BOT_TOKEN;

      if (!token) {
        return res.status(500).json({
          error: "BOT_TOKEN is not configured"
        });
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
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
}
