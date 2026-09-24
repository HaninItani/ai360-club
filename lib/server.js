import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const secret = () => process.env.SESSION_SECRET;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function isFutureJwtResponse(response) {
  if (!response || response.status !== 401) return false;

  try {
    const body = await response.clone().text();
    return (
      body.includes('PGRST303') ||
      body.toLowerCase().includes('jwt issued at future')
    );
  } catch {
    return false;
  }
}

async function supabaseFetchWithRetry(input, init) {
  const delays = [350, 900];

  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);

    if (!(await isFutureJwtResponse(response)) || attempt >= delays.length) {
      return response;
    }

    console.warn(
      `Supabase returned a transient future-JWT error; retrying request (${attempt + 1}/${delays.length}).`
    );
    await sleep(delays[attempt]);
  }
}

export const configured = () =>
  Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    secret()
  );

export function db() {
  if (!configured()) throw new Error('Supabase is not configured');

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        fetch: supabaseFetchWithRetry
      }
    }
  );
}

export function hashCode(code) {
  return crypto
    .scryptSync(code.trim().toUpperCase(), secret(), 32)
    .toString('hex');
}

export function sign(data) {
  const body = Buffer.from(
    JSON.stringify({
      ...data,
      exp: Date.now() + 7 * 86400000
    })
  ).toString('base64url');

  return (
    body +
    '.' +
    crypto
      .createHmac('sha256', secret())
      .update(body)
      .digest('base64url')
  );
}

export function verify(token) {
  if (!token || !secret()) return null;

  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expected = crypto
    .createHmac('sha256', secret())
    .update(body)
    .digest();

  let received;

  try {
    received = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }

  if (
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(body, 'base64url').toString()
    );

    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export function cookie(req) {
  return req.headers.cookie
    ?.split(';')
    .map(x => x.trim())
    .find(x => x.startsWith('ai360_session='))
    ?.split('=')[1];
}

export const setCookie = (res, value, maxAge = 604800) =>
  res.setHeader(
    'Set-Cookie',
    `ai360_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );

export async function actor(req) {
  const session = verify(cookie(req));
  if (!session) return null;

  const client = db();

  // INSTRUCTOR / OWNER
  if (session.role === 'admin') {
    const { data: authData, error: authError } =
      await client.auth.admin.getUserById(session.id);

    if (authError || !authData.user) return null;

    const { data: instructor, error: instructorError } =
      await client
        .from('instructors')
        .select('user_id,email,name,role,status')
        .eq('user_id', session.id)
        .single();

    if (
      instructorError ||
      !instructor ||
      instructor.status !== 'approved'
    ) {
      return null;
    }

    return {
      id: instructor.user_id,
      role: 'admin',
      instructorRole: instructor.role,
      name: instructor.name,
      email: instructor.email,
      group: 'general'
    };
  }

  // STUDENT
  if (session.role === 'student') {
    const { data } = await client
      .from('students')
      .select('id,name,group_id,groups(name,grade_level)')
      .eq('id', session.id)
      .eq('active', true)
      .single();

    return data
      ? {
          id: data.id,
          role: 'student',
          name: data.name,
          group: data.groups?.grade_level,
          groupId: data.group_id
        }
      : null;
  }

  return null;
}

export function fail(res, error, status = 500) {
  return res
    .status(status)
    .json({
      error:
        typeof error === 'string'
          ? error
          : error.message || 'Request failed'
    });
}
