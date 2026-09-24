import {
  db,
  configured,
  hashCode,
  sign,
  setCookie,
  actor,
  fail
} from '../lib/server.js';

export default async function handler(req, res) {
  if (!configured()) {
    return fail(
      res,
      'The app needs Supabase configuration before sign-in is available.',
      503
    );
  }

  try {
    if (req.method === 'GET') {
      const user = await actor(req);
      return res.status(200).json({ user });
    }

    if (req.method !== 'POST') {
      return fail(res, 'Method not allowed', 405);
    }

    const { action, email, password, code, name } = req.body || {};
    const client = db();

    // SIGN OUT
    if (action === 'logout') {
      setCookie(res, '', 0);
      return res.status(200).json({ user: null });
    }

    // STUDENT LOGIN
    if (action === 'student') {
      if (typeof code !== 'string' || code.length < 4 || code.length > 32) {
        return fail(res, 'Invalid student code', 401);
      }

      const { data } = await client
        .from('students')
        .select('id,name,group_id,groups(grade_level)')
        .eq('code_hash', hashCode(code))
        .eq('active', true)
        .single();

      if (!data) return fail(res, 'Invalid student code', 401);

      const user = {
        id: data.id,
        role: 'student',
        name: data.name,
        group: data.groups?.grade_level,
        groupId: data.group_id
      };

      setCookie(res, sign({ id: user.id, role: user.role }));
      return res.status(200).json({ user });
    }

    // INSTRUCTOR SIGNUP
    if (action === 'instructor-signup') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = String(name || '').trim();

      if (!cleanName || cleanName.length > 80) {
        return fail(res, 'Please enter your name.', 400);
      }

      if (!cleanEmail || !password || password.length < 8) {
        return fail(
          res,
          'Please enter a valid email and a password of at least 8 characters.',
          400
        );
      }

      // Prevent duplicate instructor profiles.
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

      // Create the Supabase Auth account server-side.
      const { data: created, error: createError } =
        await client.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true
        });

      if (createError || !created.user) {
        return fail(
          res,
          createError?.message || 'Could not create instructor account.',
          400
        );
      }

      const { error: profileError } = await client
        .from('instructors')
        .insert({
          user_id: created.user.id,
          email: cleanEmail,
          name: cleanName,
          role: 'instructor',
          status: 'pending'
        });

      if (profileError) {
        // Avoid leaving an orphan Auth account if profile creation fails.
        await client.auth.admin.deleteUser(created.user.id);
        throw profileError;
      }

      return res.status(201).json({
        pending: true,
        message:
          'Your instructor account was created and is waiting for approval.'
      });
    }

    // INSTRUCTOR LOGIN
    if (action === 'admin') {
      const cleanEmail = String(email || '').trim().toLowerCase();

      if (!cleanEmail || !password) {
        return fail(res, 'Email and password are required.', 400);
      }

      const { data: profile } = await client
        .from('instructors')
        .select('user_id,name,role,status,email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!profile) {
        return fail(res, 'Invalid credentials', 401);
      }

      if (profile.status === 'pending') {
        return fail(
          res,
          'Your instructor account is waiting for approval.',
          403
        );
      }

      if (profile.status === 'rejected') {
        return fail(res, 'Instructor access has not been approved.', 403);
      }

      if (profile.status !== 'approved') {
        return fail(res, 'Instructor access is unavailable.', 403);
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error || !data.user || data.user.id !== profile.user_id) {
        return fail(res, 'Invalid credentials', 401);
      }

      const user = {
        id: data.user.id,
        role: 'admin',
        instructorRole: profile.role,
        name: profile.name,
        group: 'general'
      };

      setCookie(
        res,
        sign({
          id: user.id,
          role: 'admin'
        })
      );

      return res.status(200).json({ user });
    }

    return fail(res, 'Invalid action', 400);
  } catch (e) {
    console.error(e);
    return fail(res, e);
  }
}
