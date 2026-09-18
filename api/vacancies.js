import { neon } from "@neondatabase/serverless";

const POSTGRES_URL = process.env.POSTGRES_URL;

const sql = POSTGRES_URL ? neon(POSTGRES_URL) : null;

export default async function handler(req, res) {
  try {
    if (!POSTGRES_URL) {
      return res.status(500).json({
        ok: false,
        error: "POSTGRES_URL is not configured",
      });
    }

    const columns = await sql`
      SELECT
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'vacancies'
      ORDER BY ordinal_position
    `;

    return res.status(200).json({
      ok: true,
      table: "vacancies",
      columns,
    });
  } catch (error) {
    console.error("VACANCIES STRUCTURE ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Ошибка проверки таблицы vacancies",
      details: error?.message || "Unknown error",
    });
  }
}
