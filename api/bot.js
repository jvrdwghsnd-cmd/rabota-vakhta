const users = {};

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

    // START
    if (text === "/start") {
      users[chatId] = null;

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

      users[chatId] = {
        step: 1,
        name: "",
        phone: "",
        profession: "",
        experience: "",
        city: "",
        shift: ""
      };

      reply =
        "👷 АНКЕТА СПЕЦИАЛИСТА\n\n" +
        "Шаг 1 из 6\n\n" +
        "Напишите ваше имя.";

    // АНКЕТА
    } else if (users[chatId]?.step === 1) {

      users[chatId].name = text;
      users[chatId].step = 2;

      reply =
        "📱 Шаг 2 из 6\n\n" +
        "Напишите ваш номер телефона.";

    } else if (users[chatId]?.step === 2) {

      users[chatId].phone = text;
      users[chatId].step = 3;

      reply =
        "👷 Шаг 3 из 6\n\n" +
        "Какая у вас профессия?";

    } else if (users[chatId]?.step === 3) {

      users[chatId].profession = text;
      users[chatId].step = 4;

      reply =
        "📅 Шаг 4 из 6\n\n" +
        "Сколько лет опыта работы?";

    } else if (users[chatId]?.step === 4) {

      users[chatId].experience = text;
      users[chatId].step = 5;

      reply =
        "📍 Шаг 5 из 6\n\n" +
        "В каком городе вы находитесь?";

    } else if (users[chatId]?.step === 5) {

      users[chatId].city = text;
      users[chatId].step = 6;

      reply =
        "🚧 Шаг 6 из 6\n\n" +
        "Готовы работать вахтой?\n\n" +
        "Напишите: Да или Нет.";

    } else if (users[chatId]?.step === 6) {

      users[chatId].shift = text;

      const user = users[chatId];

      reply =
        "✅ АНКЕТА ПРИНЯТА!\n\n" +
        "👤 Имя: " + user.name + "\n" +
        "📱 Телефон: " + user.phone + "\n" +
        "👷 Профессия: " + user.profession + "\n" +
        "📅 Опыт: " + user.experience + "\n" +
        "📍 Город: " + user.city + "\n" +
        "🚧 Вахта: " + user.shift + "\n\n" +
        "Спасибо! Ваша анкета принята.";

      users[chatId] = null;

    } else if (text === "🏢 Я работодатель") {

      reply =
        "🏢 ДЛЯ РАБОТОДАТЕЛЕЙ\n\n" +
        "Для размещения вакансии нажмите:\n" +
        "📋 Разместить вакансию";

    } else if (text === "🔎 Найти работу") {

      reply =
        "🔎 ПОИСК РАБОТЫ\n\n" +
        "Напишите профессию, которая вас интересует.";

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
