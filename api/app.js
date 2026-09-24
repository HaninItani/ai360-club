import crypto from 'node:crypto';
import { actor, db, fail, hashCode } from '../lib/server.js';

const ok = (res, data) => res.status(200).json(data);

export default async function handler(req, res) {
  try {
    const user = await actor(req);

    if (!user) {
      return fail(res, 'Sign in required', 401);
    }

    const client = db();
    const action = req.query.action || req.body?.action;
    const admin = user.role === 'admin';
    const owner = admin && user.instructorRole === 'owner';

    // =========================
    // GET REQUESTS
    // =========================

    if (req.method === 'GET') {

      // GROUPS
      if (action === 'groups') {
        if (!admin) return fail(res, 'Forbidden', 403);

        const { data, error } = await client
          .from('groups')
          .select('*')
          .order('name');

        if (error) throw error;

        return ok(res, { groups: data });
      }

      // STUDENTS
      if (action === 'students') {
        if (!admin) return fail(res, 'Forbidden', 403);

        const { data, error } = await client
          .from('students')
          .select(
            'id,name,group_id,active,created_at,groups(name,grade_level)'
          )
          .order('name');

        if (error) throw error;

        return ok(res, { students: data });
      }

      // INSTRUCTORS
      // Only the owner can view/manage instructor accounts.
      if (action === 'instructors') {
        if (!owner) return fail(res, 'Forbidden', 403);

        const { data, error } = await client
          .from('instructors')
          .select(
            'user_id,email,name,role,status,created_at,approved_at'
          )
          .order('created_at', { ascending: false });

        if (error) throw error;

        return ok(res, { instructors: data });
      }

      // CONVERSATIONS
      if (action === 'conversations') {
        let query = client
          .from('conversations')
          .select(
            'id,title,owner_id,owner_role,created_at,updated_at'
          )
          .order('updated_at', { ascending: false })
          .limit(100);

        if (!admin) {
          query = query
            .eq('owner_role', 'student')
            .eq('owner_id', user.id);
        }

        const { data, error } = await query;

        if (error) throw error;

        return ok(res, { conversations: data });
      }

      // MESSAGES
      if (action === 'messages') {
        const { conversationId } = req.query;

        const { data: conv } = await client
          .from('conversations')
          .select('owner_id,owner_role')
          .eq('id', conversationId)
          .single();

        if (!conv) {
          return fail(res, 'Conversation not found', 404);
        }

        if (
          !admin &&
          (conv.owner_id !== user.id ||
            conv.owner_role !== 'student')
        ) {
          return fail(res, 'Forbidden', 403);
        }

        const { data, error } = await client
          .from('messages')
          .select(
            'id,role,content,image_url,created_at'
          )
          .eq('conversation_id', conversationId)
          .order('created_at')
          .limit(200);

        if (error) throw error;

        return ok(res, { messages: data });
      }

      // CLASSROOM
      if (action === 'classroom') {
        const { data, error } = await client
          .from('classroom')
          .select('*')
          .eq('id', 1)
          .single();

        if (error) throw error;

        return ok(res, { classroom: data });
      }

      return fail(res, 'Unknown action', 400);
    }

    // =========================
    // POST REQUESTS
    // =========================

    if (req.method !== 'POST') {
      return fail(res, 'Method not allowed', 405);
    }

    if (!admin) {
      return fail(res, 'Forbidden', 403);
    }

    const body = req.body || {};

    // UPDATE INSTRUCTOR
    // Only Hanin / Owner can approve or reject instructors.
    if (action === 'updateInstructor') {
      if (!owner) {
        return fail(
          res,
          'Only the owner can manage instructors',
          403
        );
      }

      if (
        !body.userId ||
        !['approved', 'rejected'].includes(body.status)
      ) {
        return fail(res, 'Invalid instructor update', 400);
      }

      const { data: target, error: targetError } = await client
        .from('instructors')
        .select('user_id,role,status')
        .eq('user_id', body.userId)
        .single();

      if (targetError || !target) {
        return fail(res, 'Instructor not found', 404);
      }

      // Never allow the owner account to be rejected/changed here.
      if (target.role === 'owner') {
        return fail(
          res,
          'The owner account cannot be changed here',
          403
        );
      }

      const { data, error } = await client
        .from('instructors')
        .update({
          status: body.status,
          approved_at:
            body.status === 'approved'
              ? new Date().toISOString()
              : null
        })
        .eq('user_id', body.userId)
        .select(
          'user_id,name,email,role,status,approved_at'
        )
        .single();

      if (error) throw error;

      return ok(res, { instructor: data });
    }

    // ADD GROUP
    if (action === 'addGroup') {
      if (
        !body.name?.trim() ||
        !['grades12', 'grades35'].includes(body.gradeLevel)
      ) {
        return fail(
          res,
          'Name and grade level required',
          400
        );
      }

      const { data, error } = await client
        .from('groups')
        .insert({
          name: body.name.trim().slice(0, 80),
          grade_level: body.gradeLevel
        })
        .select()
        .single();

      if (error) throw error;

      return ok(res, { group: data });
    }

    // ADD STUDENT
    if (action === 'addStudent') {
      if (!body.name?.trim() || !body.groupId) {
        return fail(res, 'Name and group required', 400);
      }

      const { data: group } = await client
        .from('groups')
        .select('id')
        .eq('id', body.groupId)
        .single();

      if (!group) {
        return fail(res, 'Group not found', 400);
      }

      const code = crypto
        .randomBytes(6)
        .toString('base64url')
        .toUpperCase();

      const { data, error } = await client
        .from('students')
        .insert({
          name: body.name.trim().slice(0, 80),
          group_id: group.id,
          code_hash: hashCode(code)
        })
        .select('id,name,group_id,active')
        .single();

      if (error) throw error;

      return ok(res, {
        student: data,
        code
      });
    }

    // UPDATE STUDENT
    if (action === 'updateStudent') {
      const { data, error } = await client
        .from('students')
        .update({
          active: body.active === true,
          group_id: body.groupId
        })
        .eq('id', body.id)
        .select('id')
        .single();

      if (error) throw error;

      return ok(res, { student: data });
    }

    // UPDATE CLASSROOM
    if (action === 'classroom') {
      const { data, error } = await client
        .from('classroom')
        .update({
          title: String(body.title || '').slice(0, 120),
          prompt: String(body.prompt || '').slice(0, 2000),
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
        .select()
        .single();

      if (error) throw error;

      return ok(res, { classroom: data });
    }

    return fail(res, 'Unknown action', 400);

  } catch (e) {
    console.error(e);
    return fail(res, e);
  }
}
