import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
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
      } = req.body;

      if (!type) {
        return res.status(400).json({
          ok: false,
          error: "Не указан тип заявки"
        });
      }

      await sql`
        CREATE TABLE IF NOT EXISTS applications (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT,
          phone TEXT,
          profession TEXT,
          city TEXT,
          shift TEXT,
          info TEXT,
          company TEXT,
          contact TEXT,
          specialists TEXT,
          object_city TEXT,
          conditions TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
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
          conditions
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
          ${conditions || null}
        )
      `;

      return res.status(200).json({
        ok: true,
        message: "Заявка сохранена"
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        ok: false,
        error: "Ошибка сохранения заявки"
      });
    }
  }

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
      console.error(error);

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
