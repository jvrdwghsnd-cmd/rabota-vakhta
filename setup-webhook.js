export default async function handler(req, res) {
  try {
    const token = process.env.BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        ok: false,
        error: "BOT_TOKEN is not configured"
      });
    }

    const webhookUrl =
      "https://rabota-vakhta-bot.vercel.app/api/bot";

    const response = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
    );

    const result = await response.json();

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Webhook setup failed"
    });
  }
}
