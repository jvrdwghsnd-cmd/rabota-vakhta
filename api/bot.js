import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL);
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || '');
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@vakhtovyk';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function parseExperience(value) {
  const m = String(value || '')
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);

  return m ? Number(m[0]) : 0;
}

function normalizePhone(value) {
  const raw = clean(value, 50);
  const digits = raw.replace(/\D/g, '');

  if (digits.length < 7) return null;

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }

  return `+${digits}`;
}

function validPhone(value) {
  const normalized = normalizePhone(value);

  return normalized &&
    normalized.replace(/\D/g, '').length >= 7
    ? normalized
    : null;
}

async function telegram(method, body = {}) {
  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();

  if (!data.ok) {
    throw new Error(
      data.description || `Telegram ${method} failed`
    );
  }

  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function answerCallback(callbackQueryId, text = '') {
  try {
    await telegram('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  } catch (_) {}
}

async function editMessage(
  chatId,
  messageId,
  text,
  extra = {}
) {
  return telegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...extra,
  });
}

function mainKeyboard(isAdmin = false) {
  const rows = [
    [
      { text: '👷 Я ищу работу' },
      { text: '📋 Разместить вакансию' }
    ],
    [
      { text: '🏢 Я работодатель' },
      { text: '📞 Связаться с администратором' }
    ],
  ];

  if (isAdmin) {
    rows.push([
      { text: '🔐 АДМИН-ПАНЕЛЬ' }
    ]);
  }

  return {
    keyboard: rows,
    resize_keyboard: true
  };
}

function employerKeyboard() {
  return {
    keyboard: [
      [
        { text: '➕ Создать вакансию' },
        { text: '📋 Мои вакансии' }
      ],
      [
        { text: '📩 Отклики на мои вакансии' }
      ],
      [
        { text: '🏠 Главное меню' }
      ],
    ],
    resize_keyboard: true
  };
}

function adminKeyboard() {
  return {
    keyboard: [
      [
        { text: '👷 Все анкеты' },
        { text: '🔎 Найти специалиста' }
      ],
      [
        { text: '📋 Все вакансии' },
        { text: '📩 Все отклики' }
      ],
      [
        { text: '📢 Опубликовать вакансию' },
        { text: '📊 Статистика' }
      ],
      [
        { text: '🏠 Главное меню' }
      ],
    ],
    resize_keyboard: true
  };
}

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS bot_sessions (
      chat_id BIGINT PRIMARY KEY,
      step TEXT,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      payment TEXT,
      conditions TEXT,
      edit_field TEXT,
      draft_vacancy_id BIGINT,
      application_vacancy_id BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  const columns = [
    ['payment', 'TEXT'],
    ['conditions', 'TEXT'],
    ['edit_field', 'TEXT'],
    ['draft_vacancy_id', 'BIGINT'],
    ['application_vacancy_id', 'BIGINT'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()'],
  ];

  for (const [name, type] of columns) {
    await sql.query(
      `ALTER TABLE bot_sessions
       ADD COLUMN IF NOT EXISTS ${name} ${type}`
    );
  }

  await sql`
    CREATE TABLE IF NOT EXISTS candidates (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT,
      username TEXT,
      name TEXT,
      phone TEXT,
      profession TEXT,
      experience TEXT,
      city TEXT,
      shift TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS vacancies (
      id BIGSERIAL PRIMARY KEY,
      chat_id BIGINT,
      title TEXT,
      profession TEXT,
      city TEXT,
      experience TEXT,
      payment TEXT,
      conditions TEXT,
      shift TEXT,
      phone TEXT,
      published BOOLEAN DEFAULT FALSE,
      closed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id BIGSERIAL PRIMARY KEY,
      vacancy_id BIGINT,
      candidate_chat_id BIGINT,
      name TEXT,
      phone TEXT,
      experience TEXT,
      telegram_username TEXT,
      status TEXT DEFAULT 'new',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS telegram_username TEXT
  `);

  await sql.query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'
  `);

  await sql.query(`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE
  `);

  await sql.query(`
    ALTER TABLE vacancies
    ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT FALSE
  `);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_profession
    ON candidates(profession)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_city
    ON candidates(city)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vacancies_chat_id
    ON vacancies(chat_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vacancies_published
    ON vacancies(published, closed)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_vacancy
    ON applications(vacancy_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_candidate
    ON applications(candidate_chat_id)
  `;
}

async function getSession(chatId) {
  const rows = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${chatId}
    LIMIT 1
  `;

  return rows[0] || null;
}

async function setSession(chatId, values = {}) {
  const current = (await getSession(chatId)) || {};

  const data = {
    step:
      values.step !== undefined
        ? values.step
        : current.step || null,

    name:
      values.name !== undefined
        ? values.name
        : current.name || null,

    phone:
      values.phone !== undefined
        ? values.phone
        : current.phone || null,

    profession:
      values.profession !== undefined
        ? values.profession
        : current.profession || null,

    experience:
      values.experience !== undefined
        ? values.experience
        : current.experience || null,

    city:
      values.city !== undefined
        ? values.city
        : current.city || null,

    shift:
      values.shift !== undefined
        ? values.shift
        : current.shift || null,

    payment:
      values.payment !== undefined
        ? values.payment
        : current.payment || null,

    conditions:
      values.conditions !== undefined
        ? values.conditions
        : current.conditions || null,

    edit_field:
      values.edit_field !== undefined
        ? values.edit_field
        : current.edit_field || null,

    draft_vacancy_id:
      values.draft_vacancy_id !== undefined
        ? values.draft_vacancy_id
        : current.draft_vacancy_id || null,

    application_vacancy_id:
      values.application_vacancy_id !== undefined
        ? values.application_vacancy_id
        : current.application_vacancy_id || null,
  };

  await sql`
    INSERT INTO bot_sessions
    (
      chat_id,
      step,
      name,
      phone,
      profession,
      experience,
      city,
      shift,
      payment,
      conditions,
      edit_field,
      draft_vacancy_id,
      application_vacancy_id,
      updated_at
    )
    VALUES
    (
      ${chatId},
      ${data.step},
      ${data.name},
      ${data.phone},
      ${data.profession},
      ${data.experience},
      ${data.city},
      ${data.shift},
      ${data.payment},
      ${data.conditions},
      ${data.edit_field},
      ${data.draft_vacancy_id},
      ${data.application_vacancy_id},
      NOW()
    )
    ON CONFLICT (chat_id)
    DO UPDATE SET
      step = EXCLUDED.step,
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      profession = EXCLUDED.profession,
      experience = EXCLUDED.experience,
      city = EXCLUDED.city,
      shift = EXCLUDED.shift,
      payment = EXCLUDED.payment,
      conditions = EXCLUDED.conditions,
      edit_field = EXCLUDED.edit_field,
      draft_vacancy_id = EXCLUDED.draft_vacancy_id,
      application_vacancy_id = EXCLUDED.application_vacancy_id,
      updated_at = NOW()
  `;
}

async function clearSession(chatId) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${chatId}
  `;
}

function isAdmin(chatId) {
  return ADMIN_ID &&
    String(chatId) === ADMIN_ID;
}

async function sendMainMenu(
  chatId,
  text = 'Главное меню'
) {
  await sendMessage(chatId, text, {
    reply_markup: mainKeyboard(isAdmin(chatId))
  });
}

async function sendEmployerMenu(chatId) {
  await sendMessage(
    chatId,
    '🏢 Кабинет работодателя',
    {
      reply_markup: employerKeyboard()
    }
  );
}

async function sendAdminMenu(chatId) {
  if (!isAdmin(chatId)) {
    return sendMainMenu(chatId);
  }

  await sendMessage(
    chatId,
    '🔐 АДМИН-ПАНЕЛЬ\n\nВыберите действие:',
    {
      reply_markup: adminKeyboard()
    }
  );
}
