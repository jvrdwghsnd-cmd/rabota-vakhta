import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  // =========================
  // POST — сохранение заявки
  // =========================
  if (req.method === "POST") {
    try {
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
      } = req.body || {};

      if (!type) {
        return res.status(400).json({
          ok: false,
          error: "Не указан тип заявки"
        });
      }

      // Добавляем новые поля в существующую таблицу.
      // Старые анкеты при этом НЕ удаляются.
      await sql`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS type TEXT,
        ADD COLUMN IF NOT EXISTS city TEXT,
        ADD COLUMN IF NOT EXISTS shift TEXT,
        ADD COLUMN IF NOT EXISTS info TEXT,
        ADD COLUMN IF NOT EXISTS company TEXT,
        ADD COLUMN IF NOT EXISTS contact TEXT,
        ADD COLUMN IF NOT EXISTS profession TEXT,
        ADD COLUMN IF NOT EXISTS specialists TEXT,
        ADD COLUMN IF NOT EXISTS object_city TEXT,
        ADD COLUMN IF NOT EXISTS conditions TEXT
      `;

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
        message: "Заявка сохранена"
      });

    } catch (error) {
      console.error("APPLICATION ERROR:", error);

      return res.status(500).json({
        ok: false,
        error: "Ошибка сохранения заявки"
      });
    }
  }

  // =========================
  // GET — получение заявок
  // =========================
  if (req.method === "GET") {
    try {
      const applications = await sql`
        SELECT *
        FROM applications
        ORDER BY created_at DESC
      `;

      return res.status(200).json({
        ok: true,
        applications
      });

    } catch (error) {
      console.error("GET APPLICATIONS ERROR:", error);

      return res.status(500).json({
        ok: false,
        error: "Ошибка загрузки заявок"
      });
    }
  }

  return res.status(405).json({
    ok: false,
    error: "Метод не поддерживается"
  });
}
