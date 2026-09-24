import { db, configured, sign, setCookie, actor, fail } from '../lib/server.js';

const normalizeName = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');

const cleanDisplayName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);

async function registrationOpen(client) {
  const { data, error } = await client
    .from('app_settings')
    .select('student_registration_open')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data?.student_registration_open === true;
}

async function publicGroups(client) {
  const { data, error } = await client
    .from('groups')
    .select('id,name,grade_level')
    .order('name');
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  if (!configured()) return fail(res, 'The app needs Supabase configuration before sign-in is available.', 503);

  try {
    if (req.method === 'GET') {
      const user = await actor(req);
      return res.status(200).json({ user });
    }

    if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

    const { action, email, password, name, fullName, groupId } = req.body || {};
    const client = db();

    if (action === 'logout') {
      setCookie(res, '', 0);
      return res.status(200).json({ user: null });
    }

    // STUDENT: full-name login. If the name is new, ask for a group and create the profile.
    if (action === 'student') {
      const displayName = cleanDisplayName(fullName);
      const normalizedName = normalizeName(fullName);

      if (displayName.length < 3 || !displayName.includes(' ')) {
        return fail(res, 'Please enter your full name (first and last name).', 400);
      }

      const { data: existing, error: existingError } = await client
        .from('students')
        .select('id,name,group_id,active,groups(grade_level)')
        .eq('normalized_name', normalizedName)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        if (!existing.active) return fail(res, 'This student account is currently paused. Please ask your instructor.', 403);

        const user = {
          id: existing.id,
          role: 'student',
          name: existing.name,
          group: existing.groups?.grade_level,
          groupId: existing.group_id
        };

        setCookie(res, sign({ id: user.id, role: user.role }));
        return res.status(200).json({ user });
      }

      const isOpen = await registrationOpen(client);
      if (!isOpen) return fail(res, 'New student registration is closed. Please ask your instructor to open it.', 403);

      if (!groupId) {
        return res.status(200).json({
          registrationRequired: true,
          fullName: displayName,
          groups: await publicGroups(client)
        });
      }

      const { data: group, error: groupError } = await client
        .from('groups')
        .select('id,grade_level')
        .eq('id', groupId)
        .single();

      if (groupError || !group) return fail(res, 'Please choose a valid group.', 400);

      const { data: created, error: createError } = await client
        .from('students')
        .insert({
          name: displayName,
          normalized_name: normalizedName,
          group_id: group.id,
          code_hash: null,
          active: true
        })
        .select('id,name,group_id')
        .single();

      if (createError) {
        if (createError.code === '23505') return fail(res, 'A student with this full name already exists. Please press Continue again.', 409);
        throw createError;
      }

      const user = {
        id: created.id,
        role: 'student',
        name: created.name,
        group: group.grade_level,
        groupId: created.group_id
      };

      setCookie(res, sign({ id: user.id, role: user.role }));
      return res.status(201).json({ user, created: true });
    }

    if (action === 'instructor-signup') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(name || '').trim();

      if (!cleanName || cleanName.length > 80) return fail(res, 'Please enter your name.', 400);
      if (!cleanEmail || !password || password.length < 8) {
        return fail(res, 'Please enter a valid email and a password of at least 8 characters.', 400);
      }

      const { data: existingInstructor } = await client
        .from('instructors')
        .select('user_id,status')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingInstructor) {
        return fail(
          res,
          existingInstructor.status === 'pending'
            ? 'Your instructor account is already waiting for approval.'
            : 'An instructor account already exists for this email.',
          409
        );
      }

      const { data: created, error: createError } = await client.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true
      });

      if (createError || !created.user) return fail(res, createError?.message || 'Could not create instructor account.', 400);

      const { error: profileError } = await client.from('instructors').insert({
        user_id: created.user.id,
        email: cleanEmail,
        name: cleanName,
        role: 'instructor',
        status: 'pending'
      });

      if (profileError) {
        await client.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return res.status(201).json({ pending: true, message: 'Your instructor account was created and is waiting for approval.' });
    }

    if (action === 'admin') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !password) return fail(res, 'Email and password are required.', 400);

      const { data: profile } = await client
        .from('instructors')
        .select('user_id,name,role,status,email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!profile) return fail(res, 'Invalid credentials', 401);
      if (profile.status === 'pending') return fail(res, 'Your instructor account is waiting for approval.', 403);
      if (profile.status === 'rejected') return fail(res, 'Instructor access has not been approved.', 403);
      if (profile.status !== 'approved') return fail(res, 'Instructor access is unavailable.', 403);

      const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (error || !data.user || data.user.id !== profile.user_id) return fail(res, 'Invalid credentials', 401);

      const user = {
        id: data.user.id,
        role: 'admin',
        instructorRole: profile.role,
        name: profile.name,
        group: 'general'
      };

      setCookie(res, sign({ id: user.id, role: 'admin' }));
      return res.status(200).json({ user });
    }

    return fail(res, 'Invalid action', 400);
  } catch (e) {
    console.error(e);
    return fail(res, e);
  }
}
