import crypto from 'node:crypto';
import { actor, db, fail } from '../lib/server.js';

const ok = (res, data) => res.status(200).json(data);
const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const cleanName = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);

export default async function handler(req, res) {
  try {
    const user = await actor(req);
    if (!user) return fail(res, 'Sign in required', 401);

    const client = db();
    const action = req.query.action || req.body?.action;
    const admin = user.role === 'admin';
    const owner = admin && user.instructorRole === 'owner';

    if (req.method === 'GET') {
      if (action === 'groups') {
        if (!admin) return fail(res, 'Forbidden', 403);
        const { data, error } = await client.from('groups').select('*').order('name');
        if (error) throw error;
        return ok(res, { groups: data });
      }

      if (action === 'students') {
        if (!admin) return fail(res, 'Forbidden', 403);
        const { data, error } = await client
          .from('students')
          .select('id,name,group_id,active,created_at,groups(name,grade_level)')
          .order('name');
        if (error) throw error;
        return ok(res, { students: data });
      }

      if (action === 'registrationSettings') {
        if (!admin) return fail(res, 'Forbidden', 403);
        const { data, error } = await client
          .from('app_settings')
          .select('student_registration_open')
          .eq('id', 1)
          .single();
        if (error) throw error;
        return ok(res, { studentRegistrationOpen: data.student_registration_open === true });
      }

      if (action === 'instructors') {
        if (!owner) return fail(res, 'Forbidden', 403);
        const { data, error } = await client
          .from('instructors')
          .select('user_id,email,name,role,status,created_at,approved_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return ok(res, { instructors: data });
      }

      if (action === 'conversations') {
        let query = client
          .from('conversations')
          .select('id,title,owner_id,owner_role,created_at,updated_at')
          .order('updated_at', { ascending: false })
          .limit(100);
        if (!admin) query = query.eq('owner_role', 'student').eq('owner_id', user.id);
        const { data, error } = await query;
        if (error) throw error;
        return ok(res, { conversations: data });
      }

      if (action === 'messages') {
        const { conversationId } = req.query;
        const { data: conv } = await client
          .from('conversations')
          .select('owner_id,owner_role')
          .eq('id', conversationId)
          .single();
        if (!conv) return fail(res, 'Conversation not found', 404);
        if (!admin && (conv.owner_id !== user.id || conv.owner_role !== 'student')) return fail(res, 'Forbidden', 403);

        const { data, error } = await client
          .from('messages')
          .select('id,role,content,image_url,created_at')
          .eq('conversation_id', conversationId)
          .order('created_at')
          .limit(200);
        if (error) throw error;
        return ok(res, { messages: data });
      }

      if (action === 'classroom') {
        const { data, error } = await client.from('classroom').select('*').eq('id', 1).single();
        if (error) throw error;
        return ok(res, { classroom: data });
      }

      if (action === 'presentations') {
        if (!admin) return fail(res, 'Forbidden', 403);
        const { data, error } = await client
          .from('presentations')
          .select('id,title,file_name,storage_path,file_size,created_at,updated_at')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return ok(res, { presentations: data || [] });
      }

      if (action === 'presentation') {
        if (!admin) return fail(res, 'Forbidden', 403);
        const { data, error } = await client
          .from('presentations')
          .select('id,title,file_name,storage_path,file_size,created_at,updated_at')
          .eq('id', req.query.id)
          .single();
        if (error || !data) return fail(res, 'Presentation not found', 404);
        const { data: publicData } = client.storage.from('ai360-presentations').getPublicUrl(data.storage_path);
        return ok(res, { presentation: { ...data, publicUrl: publicData.publicUrl } });
      }

      return fail(res, 'Unknown action', 400);
    }

    if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);
    if (!admin) return fail(res, 'Forbidden', 403);

    const body = req.body || {};

    if (action === 'updateInstructor') {
      if (!owner) return fail(res, 'Only the owner can manage instructors', 403);
      if (!body.userId || !['approved', 'rejected'].includes(body.status)) return fail(res, 'Invalid instructor update', 400);

      const { data: target, error: targetError } = await client
        .from('instructors')
        .select('user_id,role,status')
        .eq('user_id', body.userId)
        .single();
      if (targetError || !target) return fail(res, 'Instructor not found', 404);
      if (target.role === 'owner') return fail(res, 'The owner account cannot be changed here', 403);

      const { data, error } = await client
        .from('instructors')
        .update({
          status: body.status,
          approved_at: body.status === 'approved' ? new Date().toISOString() : null
        })
        .eq('user_id', body.userId)
        .select('user_id,name,email,role,status,approved_at')
        .single();
      if (error) throw error;
      return ok(res, { instructor: data });
    }

    if (action === 'setStudentRegistration') {
      const { data, error } = await client
        .from('app_settings')
        .update({ student_registration_open: body.open === true, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select('student_registration_open')
        .single();
      if (error) throw error;
      return ok(res, { studentRegistrationOpen: data.student_registration_open });
    }

    if (action === 'addGroup') {
      if (!body.name?.trim() || !['grades12', 'grades35'].includes(body.gradeLevel)) return fail(res, 'Name and grade level required', 400);
      const { data, error } = await client
        .from('groups')
        .insert({ name: body.name.trim().slice(0, 80), grade_level: body.gradeLevel })
        .select()
        .single();
      if (error) throw error;
      return ok(res, { group: data });
    }

    if (action === 'addStudent') {
      const displayName = cleanName(body.name);
      if (!displayName || !displayName.includes(' ') || !body.groupId) return fail(res, 'Full name and group required', 400);

      const { data: group } = await client.from('groups').select('id').eq('id', body.groupId).single();
      if (!group) return fail(res, 'Group not found', 400);

      const { data, error } = await client
        .from('students')
        .insert({
          name: displayName,
          normalized_name: normalizeName(displayName),
          group_id: group.id,
          code_hash: null
        })
        .select('id,name,group_id,active')
        .single();

      if (error) {
        if (error.code === '23505') return fail(res, 'A student with this full name already exists.', 409);
        throw error;
      }
      return ok(res, { student: data });
    }

    if (action === 'updateStudent') {
      const { data, error } = await client
        .from('students')
        .update({ active: body.active === true, group_id: body.groupId })
        .eq('id', body.id)
        .select('id')
        .single();
      if (error) throw error;
      return ok(res, { student: data });
    }

    if (action === 'createPresentationUpload') {
      const title = String(body.title || '').trim().slice(0, 120);
      const fileName = String(body.fileName || '').trim().slice(0, 180);
      const fileSize = Number(body.fileSize || 0);
      if (!title || !fileName) return fail(res, 'A title and file are required', 400);
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 100 * 1024 * 1024) return fail(res, 'File must be 100 MB or smaller', 400);

      const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'classroom-file';
      const storagePath = `${crypto.randomUUID()}-${safeName}`;
      const { data: signed, error: signedError } = await client.storage
        .from('ai360-presentations')
        .createSignedUploadUrl(storagePath);
      if (signedError) throw signedError;
      return ok(res, { upload: { path: storagePath, token: signed.token, signedUrl: signed.signedUrl } });
    }

    if (action === 'finishPresentationUpload') {
      const title = String(body.title || '').trim().slice(0, 120);
      const fileName = String(body.fileName || '').trim().slice(0, 180);
      const storagePath = String(body.storagePath || '').trim();
      const fileSize = Number(body.fileSize || 0);
      if (!title || !storagePath || !fileName) return fail(res, 'Invalid classroom resource', 400);

      const { data: listed, error: listError } = await client.storage
        .from('ai360-presentations')
        .list('', { search: storagePath, limit: 10 });
      if (listError) throw listError;
      if (!(listed || []).some(x => x.name === storagePath)) return fail(res, 'Upload was not found. Please try again.', 400);

      const { data, error } = await client.from('presentations').insert({
        title, file_name: fileName, storage_path: storagePath, file_size: fileSize,
        uploaded_by: user.id
      }).select('id,title,file_name,storage_path,file_size,created_at,updated_at').single();
      if (error) throw error;
      return ok(res, { presentation: data });
    }

    if (action === 'deletePresentation') {
      const id = String(body.id || '');
      const { data: pres, error: findError } = await client.from('presentations').select('id,storage_path').eq('id', id).single();
      if (findError || !pres) return fail(res, 'Presentation not found', 404);
      const { error: storageError } = await client.storage.from('ai360-presentations').remove([pres.storage_path]);
      if (storageError) throw storageError;
      const { error } = await client.from('presentations').delete().eq('id', id);
      if (error) throw error;
      return ok(res, { deleted: true });
    }

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
