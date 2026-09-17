const { neon } = require('@neondatabase/serverless');

const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.POSTGRES_URL;
const ADMIN_ID = String(process.env.ADMIN_ID || '');
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@vakhtovyk';
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').replace(/^@/, '');

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
const TG = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

function text(v, max = 1000) {
  return String(v ?? '').trim().slice(0, max);
}

function esc(v) {
  return text(v, 4000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function expYears(v) {
  const m = text(v, 100)
    .replace(',', '.')
    .match(/\d+(?:\.\d+)?/);

  return m ? Number(m[0]) : 0;
}

function phone(v) {
  const raw = text(v, 50);
  const d = raw.replace(/\D/g, '');

  if (d.length < 7) return null;

  if (raw.startsWith('+')) {
    return '+' + d;
  }

  if (d.length === 11 && d.startsWith('8')) {
    return '+7' + d.slice(1);
  }

  if (d.length === 10 && d.startsWith('9')) {
    return '+7' + d;
  }

  return '+' + d;
}

function admin(chatId) {
  return ADMIN_ID && String(chatId) === ADMIN_ID;
}

async function tg(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not configured');
  }

  const r = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const d = await r.json();

  if (!d.ok) {
    throw new Error(
      d.description || `Telegram ${method} failed`
    );
  }

  return d.result;
}

async function send(chatId, message, extra = {}) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: message,
    ...extra
  });
}

async function cb(id, message = '') {
  try {
    await tg('answerCallbackQuery', {
      callback_query_id: id,
      text: message
    });
  } catch (_) {}
}

function mainKb(isAdmin = false) {
  const k = [
    [
      { text: '👷 Я ищу работу' },
      { text: '📋 Разместить вакансию' }
    ],
    [
      { text: '🏢 Кабинет работодателя' },
      { text: '📞 Администратор' }
    ]
  ];

  if (isAdmin) {
    k.push([
      { text: '🔐 Админ-панель' }
    ]);
  }

  return {
    keyboard: k,
    resize_keyboard: true
  };
}

function employerKb() {
  return {
    keyboard: [
      [
        { text: '➕ Создать вакансию' },
        { text: '📋 Мои вакансии' }
      ],
      [
        { text: '📩 Отклики' }
      ],
      [
        { text: '🏠 Главное меню' }
      ]
    ],
    resize_keyboard: true
  };
}

function adminKb() {
  return {
    keyboard: [
      [
        { text: '👷 Все специалисты' },
        { text: '🔎 Поиск специалиста' }
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
      ]
    ],
    resize_keyboard: true
  };
}

function inline(rows) {
  return {
    inline_keyboard: rows
  };
}

async function schema() {
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

  const cols = [
    ['username', 'TEXT'],
    ['payment', 'TEXT'],
    ['conditions', 'TEXT'],
    ['edit_field', 'TEXT'],
    ['draft_vacancy_id', 'BIGINT'],
    ['application_vacancy_id', 'BIGINT'],
    ['updated_at', 'TIMESTAMPTZ DEFAULT NOW()']
  ];

  for (const [n, t] of cols) {
    try {
      await sql.query(
        `ALTER TABLE bot_sessions ADD COLUMN IF NOT EXISTS ${n} ${t}`
      );
    } catch (_) {}
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

  const alters = [
    `ALTER TABLE candidates ADD COLUMN IF NOT EXISTS username TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS telegram_username TEXT`,
    `ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new'`,
    `ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT FALSE`
  ];

  for (const q of alters) {
    try {
      await sql.query(q);
    } catch (_) {}
  }

  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_profession
    ON candidates(profession)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_candidates_city
    ON candidates(city)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vacancies_owner
    ON vacancies(chat_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_applications_vacancy
    ON applications(vacancy_id)
  `;
}

async function session(id) {
  const r = await sql`
    SELECT *
    FROM bot_sessions
    WHERE chat_id = ${id}
  `;

  return r[0] || {};
}

async function saveSession(id, v) {
  const s = await session(id);
  const x = { ...s, ...v };

  await sql`
    INSERT INTO bot_sessions (
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
    VALUES (
      ${id},
      ${x.step || null},
      ${x.name || null},
      ${x.phone || null},
      ${x.profession || null},
      ${x.experience || null},
      ${x.city || null},
      ${x.shift || null},
      ${x.payment || null},
      ${x.conditions || null},
      ${x.edit_field || null},
      ${x.draft_vacancy_id || null},
      ${x.application_vacancy_id || null},
      NOW()
    )
    ON CONFLICT(chat_id)
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

async function clear(id) {
  await sql`
    DELETE FROM bot_sessions
    WHERE chat_id = ${id}
  `;
}

async function menu(
  id,
  msg = 'Главное меню'
) {
  await send(id, msg, {
    reply_markup: mainKb(admin(id))
  });
}

async function employer(id) {
  await send(
    id,
    '🏢 <b>Кабинет работодателя</b>\n\nСоздавайте вакансии и получайте отклики специалистов.',
    {
      parse_mode: 'HTML',
      reply_markup: employerKb()
    }
  );
}

async function adminMenu(id) {
  if (!admin(id)) {
    return menu(id);
  }

  await send(
    id,
    '🔐 <b>Админ-панель</b>\n\nВыберите раздел:',
    {
      parse_mode: 'HTML',
      reply_markup: adminKb()
    }
  );
}

async function startCandidate(id) {
  await saveSession(id, {
    step: 'cand_name'
  });

  await send(
    id,
    '👷 <b>Анкета специалиста</b>\n\nНапишите ваше имя и фамилию:',
    {
      parse_mode: 'HTML'
    }
  );
}

async function startVacancy(id) {
  await saveSession(id, {
    step: 'vac_title',
    name: null,
    phone: null,
    profession: null,
    experience: null,
    city: null,
    shift: null,
    payment: null,
    conditions: null,
    draft_vacancy_id: null
  });

  await send(
    id,
    '📋 <b>Новая вакансия</b>\n\nВведите название вакансии:',
    {
      parse_mode: 'HTML'
    }
  );
}

async function startApplication(id, vacId) {
  const v = (
    await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vacId}
      AND closed = FALSE
      LIMIT 1
    `
  )[0];

  if (!v) {
    await send(
      id,
      '❌ Эта вакансия не найдена или уже закрыта.'
    );
    return;
  }

  await saveSession(id, {
    step: 'app_name',
    application_vacancy_id: vacId
  });

  await send(
    id,
    `📩 <b>Отклик на вакансию</b>\n\n<b>${esc(v.title)}</b>\n${esc(v.city)}\n\nВведите ваше имя и фамилию:`,
    {
      parse_mode: 'HTML'
    }
  );
}

function vacancyText(v) {
  return `📌 <b>${esc(v.title)}</b>

👷 Профессия: ${esc(v.profession)}
📍 Место: ${esc(v.city)}
🧰 Опыт: ${esc(v.experience)}
💰 Оплата: ${esc(v.payment)}
🏠 Условия: ${esc(v.conditions)}
🔄 Вахта: ${esc(v.shift)}

📞 Контакт: ${esc(v.phone)}`;
}

function candidateText(c) {
  return `👷 <b>${esc(c.name)}</b>

Профессия: ${esc(c.profession)}
Опыт: ${esc(c.experience)}
Город: ${esc(c.city)}
Вахта: ${esc(c.shift)}
Телефон: ${esc(c.phone)}${
    c.username
      ? `\nTelegram: @${esc(c.username)}`
      : ''
  }`;
}

function statusText(s) {
  return {
    new: '🆕 Новый',
    review: '👀 На рассмотрении',
    accepted: '✅ Принят',
    rejected: '❌ Отклонён'
  }[s] || s;
}

async function saveCandidate(m, s) {
  const existing = (
    await sql`
      SELECT id
      FROM candidates
      WHERE chat_id = ${m.chat.id}
      ORDER BY id DESC
      LIMIT 1
    `
  )[0];

  if (existing) {
    await sql`
      UPDATE candidates
      SET
        username = ${m.from?.username || null},
        name = ${s.name},
        phone = ${s.phone},
        profession = ${s.profession},
        experience = ${s.experience},
        city = ${s.city},
        shift = ${s.shift}
      WHERE id = ${existing.id}
    `;
  } else {
    await sql`
      INSERT INTO candidates (
        chat_id,
        username,
        name,
        phone,
        profession,
        experience,
        city,
        shift
      )
      VALUES (
        ${m.chat.id},
        ${m.from?.username || null},
        ${s.name},
        ${s.phone},
        ${s.profession},
        ${s.experience},
        ${s.city},
        ${s.shift}
      )
    `;
  }
}

async function notifyAdmin(msg) {
  if (!ADMIN_ID) return;

  try {
    await send(ADMIN_ID, msg);
  } catch (e) {
    console.error(
      'ADMIN_NOTIFY',
      e.message
    );
  }
}

async function candidateStep(m, s) {
  const id = m.chat.id;
  const v = text(m.text);

  if (s.step === 'cand_name') {
    if (v.length < 2) {
      return send(
        id,
        'Введите имя и фамилию текстом.'
      );
    }

    await saveSession(id, {
      step: 'cand_profession',
      name: v
    });

    return send(
      id,
      '🧰 Какая у вас профессия?\n\nНапример: сварщик, монтажник ЖБК, изолировщик.'
    );
  }

  if (s.step === 'cand_profession') {
    if (v.length < 2) {
      return send(
        id,
        'Укажите профессию.'
      );
    }

    await saveSession(id, {
      step: 'cand_experience',
      profession: v
    });

    return send(
      id,
      '⏱️ Сколько у вас опыта?\n\nНапример: 5 лет.'
    );
  }

  if (s.step === 'cand_experience') {
    if (!expYears(v)) {
      return send(
        id,
        'Укажите опыт, например: 5 лет.'
      );
    }

    await saveSession(id, {
      step: 'cand_city',
      experience: v
    });

    return send(
      id,
      '📍 В каком городе вы сейчас находитесь?'
    );
  }

  if (s.step === 'cand_city') {
    await saveSession(id, {
      step: 'cand_shift',
      city: v
    });

    return send(
      id,
      '🔄 Готовы работать вахтой?\n\nНапишите: Да или Нет.'
    );
  }

  if (s.step === 'cand_shift') {
    await saveSession(id, {
      step: 'cand_phone',
      shift: v
    });

    return send(
      id,
      '📞 Отправьте номер телефона.'
    );
  }

  if (s.step === 'cand_phone') {
    const p = phone(v);

    if (!p) {
      return send(
        id,
        'Не удалось распознать номер. Отправьте номер ещё раз.'
      );
    }

    await saveSession(id, {
      step: 'cand_done',
      phone: p
    });

    const x = await session(id);

    await saveCandidate(m, x);
    await clear(id);

    await send(
      id,
      '✅ <b>Анкета сохранена!</b>\n\nМы сохранили ваши данные и сможем связаться с вами по подходящим вакансиям.',
      {
        parse_mode: 'HTML'
      }
    );

    await notifyAdmin(
      `🆕 Новая анкета специалиста\n\n${candidateText({
        ...x,
        username: m.from?.username,
        phone: p
      })}`
    );

    return menu(id);
  }
}

async function vacancyStep(m, s) {
  const id = m.chat.id;
  const v = text(m.text);

  if (s.step === 'vac_title') {
    if (v.length < 3) {
      return send(
        id,
        'Введите название вакансии.'
      );
    }

    await saveSession(id, {
      step: 'vac_profession',
      name: v
    });

    return send(
      id,
      '🧰 Какая профессия требуется?'
    );
  }

  if (s.step === 'vac_profession') {
    await saveSession(id, {
      step: 'vac_city',
      profession: v
    });

    return send(
      id,
      '📍 Где находится объект / завод?'
    );
  }

  if (s.step === 'vac_city') {
    await saveSession(id, {
      step: 'vac_experience',
      city: v
    });

    return send(
      id,
      '⏱️ Какой требуется опыт?'
    );
  }

  if (s.step === 'vac_experience') {
    await saveSession(id, {
      step: 'vac_payment',
      experience: v
    });

    return send(
      id,
      '💰 Укажите оплату.\n\nНапример: от 120 000 ₽ в месяц.'
    );
  }

  if (s.step === 'vac_payment') {
    await saveSession(id, {
      step: 'vac_conditions',
      payment: v
    });

    return send(
      id,
      '🏠 Условия: проживание, питание, проезд и т.д.'
    );
  }

  if (s.step === 'vac_conditions') {
    await saveSession(id, {
      step: 'vac_shift',
      conditions: v
    });

    return send(
      id,
      '🔄 Какой график / вахта?\n\nНапример: 60/30, 30/30.'
    );
  }

  if (s.step === 'vac_shift') {
    await saveSession(id, {
      step: 'vac_phone',
      shift: v
    });

    return send(
      id,
      '📞 Телефон работодателя / отдела кадров:'
    );
  }

  if (s.step === 'vac_phone') {
    const p = phone(v);

    if (!p) {
      return send(
        id,
        'Проверьте номер телефона и отправьте ещё раз.'
      );
    }

    await saveSession(id, {
      step: 'vac_confirm',
      phone: p
    });

    const x = await session(id);

    const preview = {
      title: x.name,
      profession: x.profession,
      city: x.city,
      experience: x.experience,
      payment: x.payment,
      conditions: x.conditions,
      shift: x.shift,
      phone: p
    };

    return send(
      id,
      `Проверьте вакансию:\n\n${vacancyText(preview)}`,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: '✅ Сохранить',
              callback_data: 'vac_save'
            },
            {
              text: '❌ Отмена',
              callback_data: 'cancel'
            }
          ]
        ])
      }
    );
  }
}

async function applicationStep(m, s) {
  const id = m.chat.id;
  const v = text(m.text);

  if (s.step === 'app_name') {
    if (v.length < 2) {
      return send(id, 'Введите имя.');
    }

    await saveSession(id, {
      step: 'app_phone',
      name: v
    });

    return send(
      id,
      '📞 Ваш номер телефона:'
    );
  }

  if (s.step === 'app_phone') {
    const p = phone(v);

    if (!p) {
      return send(
        id,
        'Введите корректный номер.'
      );
    }

    await saveSession(id, {
      step: 'app_experience',
      phone: p
    });

    return send(
      id,
      '⏱️ Укажите ваш опыт работы.'
    );
  }

  if (s.step === 'app_experience') {
    if (!v) {
      return send(
        id,
        'Укажите опыт.'
      );
    }

    const x = await session(id);

    const vac = (
      await sql`
        SELECT *
        FROM vacancies
        WHERE id = ${x.application_vacancy_id}
        AND closed = FALSE
      `
    )[0];

    if (!vac) {
      await clear(id);

      return send(
        id,
        '❌ Вакансия уже закрыта.'
      );
    }

    const duplicate = (
      await sql`
        SELECT id
        FROM applications
        WHERE vacancy_id = ${vac.id}
        AND candidate_chat_id = ${id}
        LIMIT 1
      `
    )[0];

    if (duplicate) {
      await clear(id);

      return send(
        id,
        'ℹ️ Вы уже отправляли отклик на эту вакансию.'
      );
    }

    const r = await sql`
      INSERT INTO applications (
        vacancy_id,
        candidate_chat_id,
        name,
        phone,
        experience,
        telegram_username,
        status
      )
      VALUES (
        ${vac.id},
        ${id},
        ${x.name},
        ${x.phone},
        ${v},
        ${m.from?.username || null},
        'new'
      )
      RETURNING id
    `;

    await clear(id);

    await send(
      id,
      '✅ <b>Отклик отправлен!</b>\n\nРаботодатель получит ваши данные.',
      {
        parse_mode: 'HTML'
      }
    );

    const appId = r[0].id;

    const note =
      `📩 <b>Новый отклик #${appId}</b>\n\n` +
      `Вакансия: ${esc(vac.title)}\n` +
      `Специалист: ${esc(x.name)}\n` +
      `Телефон: ${esc(x.phone)}\n` +
      `Опыт: ${esc(v)}` +
      (
        m.from?.username
          ? `\nTelegram: @${esc(m.from.username)}`
          : ''
      );

    await send(
      vac.chat_id,
      note,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: '👀 Открыть отклики',
              callback_data: 'emp_apps'
            }
          ]
        ])
      }
    );

    await notifyAdmin(note);

    return menu(id);
  }
}

async function createVacancy(id) {
  const s = await session(id);

  const r = await sql`
    INSERT INTO vacancies (
      chat_id,
      title,
      profession,
      city,
      experience,
      payment,
      conditions,
      shift,
      phone
    )
    VALUES (
      ${id},
      ${s.name},
      ${s.profession},
      ${s.city},
      ${s.experience},
      ${s.payment},
      ${s.conditions},
      ${s.shift},
      ${s.phone}
    )
    RETURNING id
  `;

  await clear(id);

  const vid = r[0].id;

  await send(
    id,
    `✅ <b>Вакансия #${vid} сохранена.</b>\n\nОна отправлена администратору на проверку.`,
    {
      parse_mode: 'HTML',
      reply_markup: employerKb()
    }
  );

  await notifyAdmin(
    `📋 <b>Новая вакансия #${vid}</b>\n\n${vacancyText({
      ...s,
      id: vid
    })}`
  );

  if (ADMIN_ID) {
    await send(
      ADMIN_ID,
      `📢 Опубликовать вакансию #${vid}?`,
      {
        reply_markup: inline([
          [
            {
              text: '📢 Опубликовать',
              callback_data: `pub:${vid}`
            }
          ],
          [
            {
              text: '📋 Открыть',
              callback_data: `vac:${vid}`
            }
          ]
        ])
      }
    );
  }
}

async function listMyVac(id) {
  const rows = await sql`
    SELECT *
    FROM vacancies
    WHERE chat_id = ${id}
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return send(
      id,
      '📋 У вас пока нет вакансий.',
      {
        reply_markup: employerKb()
      }
    );
  }

  await send(
    id,
    `📋 Ваши вакансии: ${rows.length}`
  );

  for (const v of rows) {
    await send(
      id,
      `${vacancyText(v)}

Статус: ${
        v.closed
          ? '🔒 Закрыта'
          : v.published
            ? '📢 Опубликована'
            : '🕓 На проверке'
      }`,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: '📩 Отклики',
              callback_data: `apps:${v.id}`
            },
            {
              text: v.closed
                ? '🔓 Открыть'
                : '🔒 Закрыть',
              callback_data: `toggle:${v.id}`
            }
          ]
        ])
      }
    );
  }
}

async function listEmpApps(id) {
  const rows = await sql`
    SELECT
      a.*,
      v.title
    FROM applications a
    JOIN vacancies v
      ON v.id = a.vacancy_id
    WHERE v.chat_id = ${id}
    ORDER BY a.id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return send(
      id,
      '📩 Откликов пока нет.',
      {
        reply_markup: employerKb()
      }
    );
  }

  for (const a of rows) {
    await send(
      id,
      `📩 <b>Отклик #${a.id}</b>

Вакансия: ${esc(a.title)}
Специалист: ${esc(a.name)}
Телефон: ${esc(a.phone)}
Опыт: ${esc(a.experience)}
Статус: ${statusText(a.status)}`,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: '👀 Рассмотреть',
              callback_data: `review:${a.id}`
            }
          ],
          [
            {
              text: '✅ Принять',
              callback_data: `status:${a.id}:accepted`
            },
            {
              text: '❌ Отклонить',
              callback_data: `status:${a.id}:rejected`
            }
          ]
        ])
      }
    );
  }
}

async function adminCandidates(id) {
  if (!admin(id)) return;

  const rows = await sql`
    SELECT *
    FROM candidates
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return send(id, 'Анкет пока нет.');
  }

  await send(
    id,
    `👷 Последние специалисты: ${rows.length}`
  );

  for (const c of rows) {
    await send(
      id,
      candidateText(c),
      {
        parse_mode: 'HTML'
      }
    );
  }
}

async function adminVacancies(id) {
  if (!admin(id)) return;

  const rows = await sql`
    SELECT *
    FROM vacancies
    ORDER BY id DESC
    LIMIT 30
  `;

  if (!rows.length) {
    return send(
      id,
      'Вакансий нет.'
    );
  }

  for (const v of rows) {
    await send(
      id,
      `#${v.id}

${vacancyText(v)}

${
        v.closed
          ? '🔒 Закрыта'
          : v.published
            ? '📢 Опубликована'
            : '🕓 Не опубликована'
      }`,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: v.published
                ? '🔁 Опубликовать снова'
                : '📢 Опубликовать',
              callback_data: `pub:${v.id}`
            }
          ],
          [
            {
              text: '📩 Отклики',
              callback_data: `apps:${v.id}`
            }
          ]
        ])
      }
    );
  }
}

async function adminApps(id) {
  if (!admin(id)) return;

  const rows = await sql`
    SELECT
      a.*,
      v.title
    FROM applications a
    JOIN vacancies v
      ON v.id = a.vacancy_id
    ORDER BY a.id DESC
    LIMIT 40
  `;

  if (!rows.length) {
    return send(
      id,
      'Откликов нет.'
    );
  }

  for (const a of rows) {
    await send(
      id,
      `📩 <b>#${a.id}</b>

Вакансия: ${esc(a.title)}
Специалист: ${esc(a.name)}
Телефон: ${esc(a.phone)}
Опыт: ${esc(a.experience)}
Статус: ${statusText(a.status)}`,
      {
        parse_mode: 'HTML',
        reply_markup: inline([
          [
            {
              text: '👀 Рассмотреть',
              callback_data: `review:${a.id}`
            }
          ],
          [
            {
              text: '✅ Принять',
              callback_data: `status:${a.id}:accepted`
            },
            {
              text: '❌ Отклонить',
              callback_data: `status:${a.id}:rejected`
            }
          ]
        ])
      }
    );
  }
}

async function stats(id) {
  if (!admin(id)) return;

  const [
    c,
    v,
    a,
    n,
    p
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int n FROM candidates`,
    sql`SELECT COUNT(*)::int n FROM vacancies`,
    sql`SELECT COUNT(*)::int n FROM applications`,
    sql`SELECT COUNT(*)::int n FROM applications WHERE status = 'new'`,
    sql`SELECT COUNT(*)::int n FROM vacancies WHERE published = true AND closed = false`
  ]);

  await send(
    id,
    `📊 <b>Статистика</b>

👷 Специалистов: ${c[0].n}
📋 Вакансий: ${v[0].n}
📢 Активных вакансий: ${p[0].n}
📩 Откликов: ${a[0].n}
🆕 Новых откликов: ${n[0].n}`,
    {
      parse_mode: 'HTML'
    }
  );
}

async function publish(id, vid) {
  if (!admin(id)) return;

  const v = (
    await sql`
      SELECT *
      FROM vacancies
      WHERE id = ${vid}
    `
  )[0];

  if (!v) {
    return send(
      id,
      'Вакансия не найдена.'
    );
  }

  if (v.closed) {
    return send(
      id,
      '❌ Вакансия закрыта.'
    );
  }

  const channel = String(
    CHANNEL_USERNAME
  ).replace(/^@/, '');

  const post =
    `💼 <b>${esc(v.title)}</b>\n\n` +
    `${vacancyText(v)}\n\n` +
    `🔹 Чтобы откликнуться, нажмите кнопку ниже.`;

  await tg(
    'sendMessage',
    {
      chat_id: CHANNEL_USERNAME,
      text: post,
      parse_mode: 'HTML',
      reply_markup: inline([
        [
          {
            text: '📩 Откликнуться',
            url:
              `https://t.me/VakhtovykHelperBot?start=vacancy_${v.id}`
          }
        ],
        [
          {
            text: '📲 Наш канал',
            url:
              `https://t.me/${channel}`
          }
        ]
      ])
    }
  );

  await sql`
    UPDATE vacancies
    SET published = true
    WHERE id = ${vid}
  `;

  await send(
    id,
    `✅ Вакансия #${vid} опубликована в ${CHANNEL_USERNAME}.`
  );

  await send(
    v.chat_id,
    `📢 Ваша вакансия #${vid} опубликована в канале.`
  );
}

async function searchStart(id) {
  await saveSession(id, {
    step: 'search_profession'
  });

  await send(
    id,
    '🔎 <b>Поиск специалиста</b>\n\nВведите профессию:',
    {
      parse_mode: 'HTML'
    }
  );
}

async function searchStep(m, s) {
  const id = m.chat.id;
  const v = text(m.text);

  if (!admin(id)) return;

  if (s.step === 'search_profession') {
    await saveSession(id, {
      step: 'search_city',
      profession: v
    });

    return send(
      id,
      '📍 Город (или напишите: любой):'
    );
  }

  if (s.step === 'search_city') {
    await saveSession(id, {
      step: 'search_exp',
      city: v
    });

    return send(
      id,
      '⏱️ Минимальный опыт в годах.\n\nНапример: 3'
    );
  }

  if (s.step === 'search_exp') {
    const min = expYears(v);
    const x = await session(id);

    const city = text(x.city).toLowerCase();

    const rows = await sql`
      SELECT *
      FROM candidates
      WHERE LOWER(profession)
        LIKE ${'%' + x.profession.toLowerCase() + '%'}
      ORDER BY id DESC
      LIMIT 100
    `;

    const filtered = rows.filter(c => {
      const cityOk =
        city === 'любой' ||
        city === 'any' ||
        text(c.city).toLowerCase().includes(city);

      return cityOk &&
        expYears(c.experience) >= min;
    });

    await clear(id);

    if (!filtered.length) {
      return send(
        id,
        'Ничего подходящего не найдено.',
        {
          reply_markup: adminKb()
        }
      );
    }

    await send(
      id,
      `🔎 Найдено специалистов: ${filtered.length}`
    );

    for (const c of filtered) {
      await send(
        id,
        candidateText(c),
        {
          parse_mode: 'HTML'
        }
      );
    }

    return adminMenu(id);
  }
}

async function callback(q) {
  const id = q.from.id;
  const data = q.data || '';

  await cb(q.id);

  if (data === 'cancel') {
    await clear(id);

    return menu(
      id,
      'Операция отменена.'
    );
  }

  if (data === 'vac_save') {
    return createVacancy(id);
  }

  if (data === 'emp_apps') {
    return listEmpApps(id);
  }

  if (data.startsWith('vac:')) {
    if (!admin(id)) return;

    const vid = Number(
      data.split(':')[1]
    );

    const v = (
      await sql`
        SELECT *
        FROM vacancies
        WHERE id = ${vid}
      `
    )[0];

    if (v) {
      await send(
        id,
        vacancyText(v),
        {
          parse_mode: 'HTML'
        }
      );
    }

    return;
  }

  if (data.startsWith('pub:')) {
    return publish(
      id,
      Number(data.split(':')[1])
    );
  }

  if (data.startsWith('apps:')) {
    const vid = Number(
      data.split(':')[1]
    );

    const owner = (
      await sql`
        SELECT chat_id
        FROM vacancies
        WHERE id = ${vid}
      `
    )[0];

    if (
      !owner ||
      (
        String(owner.chat_id) !== String(id) &&
        !admin(id)
      )
    ) {
      return;
    }

    const rows = await sql`
      SELECT *
      FROM applications
      WHERE vacancy_id = ${vid}
      ORDER BY id DESC
      LIMIT 30
    `;

    if (!rows.length) {
      return send(
        id,
        '📩 По этой вакансии откликов пока нет.'
      );
    }

    for (const a of rows) {
      await send(
        id,
        `📩 <b>Отклик #${a.id}</b>

Специалист: ${esc(a.name)}
Телефон: ${esc(a.phone)}
Опыт: ${esc(a.experience)}
Статус: ${statusText(a.status)}`,
        {
          parse_mode: 'HTML',
          reply_markup: inline([
            [
              {
                text: '👀 Рассмотреть',
                callback_data: `review:${a.id}`
              }
            ],
            [
              {
                text: '✅ Принять',
                callback_data: `status:${a.id}:accepted`
              },
              {
                text: '❌ Отклонить',
                callback_data: `status:${a.id}:rejected`
              }
            ]
          ])
        }
      );
    }

    return;
  }

  if (data.startsWith('status:')) {
    const [, aid, status] =
      data.split(':');

    const a = (
      await sql`
        SELECT
          a.*,
          v.chat_id AS owner_id,
          v.title
        FROM applications a
        JOIN vacancies v
          ON v.id = a.vacancy_id
        WHERE a.id = ${Number(aid)}
      `
    )[0];

    if (
      !a ||
      (
        !admin(id) &&
        String(a.owner_id) !== String(id)
      )
    ) {
      return;
    }

    await sql`
      UPDATE applications
      SET status = ${status}
      WHERE id = ${Number(aid)}
    `;

    await send(
      a.candidate_chat_id,
      `📩 <b>Статус вашего отклика</b>

Вакансия: ${esc(a.title)}
Новый статус: ${statusText(status)}`,
      {
        parse_mode: 'HTML'
      }
    );

    return send(
      id,
      `Статус отклика #${aid}: ${statusText(status)}`
    );
  }

  if (data.startsWith('review:')) {
    const aid = Number(
      data.split(':')[1]
    );

    const a = (
      await sql`
        SELECT
          a.*,
          v.chat_id AS owner_id,
          v.title
        FROM applications a
        JOIN vacancies v
          ON v.id = a.vacancy_id
        WHERE a.id = ${aid}
      `
    )[0];

    if (
      !a ||
      (
        !admin(id) &&
        String(a.owner_id) !== String(id)
      )
    ) {
      return;
    }

    return send(
      id,
      `📩 <b>Отклик #${aid}</b>

Вакансия: ${esc(a.title)}
Специалист: ${esc(a.name)}
Телефон: ${esc(a.phone)}
Опыт: ${esc(a.experience)}
Статус: ${statusText(a.status)}`,
      {
        parse_mode: 'HTML'
      }
    );
  }

  if (data.startsWith('toggle:')) {
    const vid = Number(
      data.split(':')[1]
    );

    const v = (
      await sql`
        SELECT *
        FROM vacancies
        WHERE id = ${vid}
      `
    )[0];

    if (
      !v ||
      (
        !admin(id) &&
        String(v.chat_id) !== String(id)
      )
    ) {
      return;
    }

    await sql`
      UPDATE vacancies
      SET closed = NOT closed
      WHERE id = ${vid}
    `;

    return send(
      id,
      `Вакансия #${vid}: ${
        v.closed
          ? '🔓 открыта'
          : '🔒 закрыта'
      }`
    );
  }
}

async function message(m) {
  const id = m.chat.id;
  const v = text(m.text);

  if (v.startsWith('/start')) {
    const p = v.split(/\s+/)[1];

    if (
      p &&
      p.startsWith('vacancy_')
    ) {
      return startApplication(
        id,
        Number(
          p.replace('vacancy_', '')
        )
      );
    }

    await clear(id);

    return menu(
      id,
      '👋 Добро пожаловать в <b>Работа | Вахта</b>\n\nВакансии, специалисты и подбор персонала в одном месте.',
      {
        parse_mode: 'HTML'
      }
    );
  }

  if (v === '/id') {
    return send(
      id,
      `Ваш Telegram ID: ${id}`
    );
  }

  if (
    v === '/admin' ||
    v === '🔐 Админ-панель'
  ) {
    return adminMenu(id);
  }

  if (v === '🏠 Главное меню') {
    await clear(id);
    return menu(id);
  }

  if (v === '👷 Я ищу работу') {
    return startCandidate(id);
  }

  if (
    v === '📋 Разместить вакансию' ||
    v === '➕ Создать вакансию'
  ) {
    return startVacancy(id);
  }

  if (
    v === '🏢 Кабинет работодателя' ||
    v === '🏢 Я работодатель'
  ) {
    return employer(id);
  }

  if (v === '📞 Администратор') {
    if (ADMIN_USERNAME) {
      return send(
        id,
        '📞 Свяжитесь с администратором:',
        {
          reply_markup: inline([
            [
              {
                text: '💬 Написать администратору',
                url: `https://t.me/${ADMIN_USERNAME}`
              }
            ]
          ])
        }
      );
    }

    return send(
      id,
      ADMIN_ID
        ? `📞 ID администратора: ${ADMIN_ID}`
        : 'Связь с администратором временно недоступна.'
    );
  }

  if (v === '📋 Мои вакансии') {
    return listMyVac(id);
  }

  if (v === '📩 Отклики') {
    return listEmpApps(id);
  }

  if (v === '👷 Все специалисты') {
    return adminCandidates(id);
  }

  if (v === '📋 Все вакансии') {
    return adminVacancies(id);
  }

  if (v === '📩 Все отклики') {
    return adminApps(id);
  }

  if (v === '📊 Статистика') {
    return stats(id);
  }

  if (v === '📢 Опубликовать вакансию') {
    if (!admin(id)) {
      return menu(id);
    }

    const rows = await sql`
      SELECT id, title
      FROM vacancies
      WHERE closed = false
      AND published = false
      ORDER BY id DESC
      LIMIT 20
    `;

    if (!rows.length) {
      return send(
        id,
        'Нет вакансий для публикации.'
      );
    }

    return send(
      id,
      '📢 Выберите вакансию:',
      {
        reply_markup: inline(
          rows.map(x => [
            {
              text:
                `#${x.id} ${x.title}`
                  .slice(0, 60),
              callback_data:
                `pub:${x.id}`
            }
          ])
        )
      }
    );
  }

  if (v === '🔎 Поиск специалиста') {
    return searchStart(id);
  }

  const s = await session(id);

  if (
    s.step &&
    s.step.startsWith('cand_')
  ) {
    return candidateStep(m, s);
  }

  if (
    s.step &&
    s.step.startsWith('vac_')
  ) {
    return vacancyStep(m, s);
  }

  if (
    s.step &&
    s.step.startsWith('app_')
  ) {
    return applicationStep(m, s);
  }

  if (
    s.step &&
    s.step.startsWith('search_')
  ) {
    return searchStep(m, s);
  }

  return menu(
    id,
    'Выберите действие из меню ниже.'
  );
}

async function handler(req, res) {
  try {
    if (!BOT_TOKEN || !DATABASE_URL) {
      return res.status(500).json({
        ok: false,
        error:
          'BOT_TOKEN or POSTGRES_URL is not configured'
      });
    }

    if (req.method === 'GET') {
      if (
        req.query &&
        req.query.setup === '1'
      ) {
        const host = req.headers.host;

        const proto =
          req.headers['x-forwarded-proto'] ||
          'https';

        const webhook =
          `${proto}://${host}/api/bot`;

        const result = await tg(
          'setWebhook',
          {
            url: webhook,
            allowed_updates: [
              'message',
              'callback_query'
            ]
          }
        );

        return res.status(200).json({
          ok: true,
          webhook,
          result
        });
      }

      return res.status(200).json({
        ok: true,
        service: 'Работа | Вахта',
        message: 'Bot API is running'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        error: 'Method not allowed'
      });
    }

    await schema();

    const u = req.body || {};

    if (u.callback_query) {
      await callback(
        u.callback_query
      );
    } else if (u.message) {
      await message(
        u.message
      );
    }

    return res.status(200).json({
      ok: true
    });

  } catch (e) {
    console.error(
      'BOT ERROR',
      e
    );

    return res.status(200).json({
      ok: false,
      error: e.message
    });
  }
}

module.exports = handler;
