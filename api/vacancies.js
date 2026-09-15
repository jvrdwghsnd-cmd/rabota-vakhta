import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    const vacancies = await sql`
      SELECT
        id,
        title,
        profession,
        location,
        experience,
        payment,
        conditions,
        shift,
        published_at
      FROM vacancies
      WHERE published = true
        AND closed = false
      ORDER BY
        published_at DESC NULLS LAST,
        id DESC
    `;

    return res.status(200).json({
      ok: true,
      vacancies
    });

  } catch (error) {
    console.error("VACANCIES API ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "Ошибка загрузки вакансий"
    });
  }
}
