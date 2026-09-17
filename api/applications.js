import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    // =========================
    // POST — новая заявка с сайта
    // =========================
    if (req.method === "POST") {
      const data = req.body || {};

      const {
        type,
        name,
        phone,
        profession,
        city,
        shift,
        info,
        company,
        contact,
        specialists,
        objectCity,
        conditions
      } = data;

      if (!type) {
        return res.status(400).json({
          ok: false,
          error: "Не указан тип заявки"
        });
      }

      // Создаём необходимые дополнительные поля,
      // если их ещё нет.
      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS type TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS city TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS shift TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS info TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS company TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS contact TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS profession TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS specialists TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS object_city TEXT
      `;

      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS conditions TEXT
      `;

      // Старые поля делаем необязательными,
      // чтобы заявки с сайта могли сохраняться
      // без vacancy_id и Telegram chat_id.
      await sql`
        ALTER TABLE applications
        ALTER COLUMN vacancy_id DROP NOT NULL
      `;

      await sql`
        ALTER TABLE applications
        ALTER COLUMN candidate_chat_id DROP NOT NULL
      `;

      await sql`
        ALTER TABLE applications
        ALTER COLUMN experience DROP NOT NULL
      `;

      await sql`
        ALTER TABLE applications
        ALTER COLUMN telegram_username DROP NOT NULL
      `;

      // Сохраняем заявку.
      await sql`
        INSERT INTO applications (
          type,
          name,
          phone,
          profession,
          city,
          shift,
          info,
          company,
          contact,
          specialists,
          object_city,
          conditions,
          status
        )
        VALUES (
          ${type},
          ${name || null},
          ${phone || null},
          ${profession || null},
          ${city || null},
          ${shift || null},
          ${info || null},
          ${company || null},
          ${contact || null},
          ${specialists || null},
          ${objectCity || null},
          ${conditions || null},
          'new'
        )
      `;

      return res.status(200).json({
        ok: true,
        message: "Заявка успешно отправлена"
      });
    }

    // =========================
    // GET — получить заявки
    // =========================
    if (req.method === "GET") {
      const applications = await sql`
        SELECT *
        FROM applications
        ORDER BY created_at DESC
      `;

      return res.status(200).json({
        ok: true,
        applications
      });
    }

    // =========================
    // Остальные методы
    // =========================
    return res.status(405).json({
      ok: false,
      error: "Метод не поддерживается"
    });

  } catch (error) {
    console.error("APPLICATION ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Не удалось сохранить заявку"
    });
  }
}
