import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS web_applications (
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
        status TEXT DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    if (req.method === "POST") {
      const body = req.body || {};

      if (!body.type) {
        return res.status(400).json({
          ok: false,
          error: "Не указан тип заявки"
        });
      }

      await sql`
        INSERT INTO web_applications (
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
          ${String(body.type)},
          ${body.name ? String(body.name) : null},
          ${body.phone ? String(body.phone) : null},
          ${body.profession ? String(body.profession) : null},
          ${body.city ? String(body.city) : null},
          ${body.shift ? String(body.shift) : null},
          ${body.info ? String(body.info) : null},
          ${body.company ? String(body.company) : null},
          ${body.contact ? String(body.contact) : null},
          ${body.specialists ? String(body.specialists) : null},
          ${body.objectCity ? String(body.objectCity) : null},
          ${body.conditions ? String(body.conditions) : null},
          'new'
        )
      `;

      return res.status(200).json({
        ok: true,
        message: "Анкета успешно отправлена"
      });
    }

    if (req.method === "GET") {
      const applications = await sql`
        SELECT *
        FROM web_applications
        ORDER BY created_at DESC
      `;

      return res.status(200).json({
        ok: true,
        applications
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Метод не поддерживается"
    });

  } catch (error) {
    console.error("APPLICATION ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Не удалось отправить заявку"
    });
  }
}
