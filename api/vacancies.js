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

    const vacancies = await sql`
      SELECT
        id,
        title,
        profession,
        city AS location,
        experience,
        payment,
        conditions,
        shift,
        published_at
      FROM vacancies
      WHERE published = TRUE
        AND closed = FALSE
      ORDER BY
        published_at DESC NULLS LAST,
        id DESC
    `;

    return res.status(200).json({
      ok: true,
      vacancies,
    });
  } catch (error) {
    console.error("VACANCIES API ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Ошибка загрузки вакансий",
      details: error?.message || "Unknown error",
    });
  }
}
