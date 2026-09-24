import crypto from 'node:crypto';
import OpenAI from 'openai';
import { actor, db, fail } from '../lib/server.js';

const BASE = `You are AI360, a natural, capable general-purpose AI assistant used inside a supervised elementary AI club. Respond like a polished modern AI assistant: conversational, direct, helpful, context-aware, and flexible. Do not force lessons, missions, quizzes, or classroom language unless the user asks for them. Answer the actual request first. Use clear Markdown when it improves readability. Keep simple questions concise and give fuller explanations when useful. Preserve context from the conversation. Never be childish or patronizing. Do not ask for private details such as passwords, home addresses, phone numbers, school logins, or other sensitive personal information. If such information is shared, do not repeat it. Acknowledge uncertainty when appropriate.`;

const level = g =>
  g === 'grades12'
    ? 'Quietly keep vocabulary accessible for Grades 1–2 when needed, without sounding babyish.'
    : g === 'grades35'
      ? 'Quietly adapt explanation complexity for Grades 3–5 when needed, while still sounding natural.'
      : 'Use a normal general-audience style.';

const write = (res, value) => res.write(JSON.stringify(value) + '\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  try {
    const user = await actor(req);
    if (!user) return fail(res, 'Sign in required', 401);
    if (!process.env.OPENAI_API_KEY) return fail(res, 'OpenAI is not configured', 503);

    const { message, conversationId, wantsImage } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > 6000) {
      return fail(res, 'Message must be 1–6000 characters', 400);
    }

    const client = db();
    let conv;

    if (conversationId) {
      const { data } = await client.from('conversations').select('*').eq('id', conversationId).single();
      if (!data || data.owner_id !== user.id || data.owner_role !== user.role) {
        return fail(res, 'Conversation not found', 404);
      }
      conv = data;
    } else {
      const { data, error } = await client
        .from('conversations')
        .insert({ owner_id: user.id, owner_role: user.role, title: message.trim().slice(0, 54) })
        .select()
        .single();
      if (error) throw error;
      conv = data;
    }

    const { data: prior, error: priorError } = await client
      .from('messages')
      .select('role,content')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (priorError) throw priorError;

    const input = [
      ...prior.reverse().map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() }
    ];

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    const common = {
      model,
      instructions: BASE + '\n' + level(user.group),
      input,
      max_output_tokens: 1400
    };

    // Image generation remains a normal request because the image arrives as one completed asset.
    if (wantsImage) {
      const response = await ai.responses.create({
        ...common,
        tools: [{ type: 'image_generation', size: '1024x1024', quality: 'low' }]
      });

      let imagePath = null;
      for (const item of response.output || []) {
        if (item.type === 'image_generation_call' && item.result) {
          imagePath = `${conv.id}/${crypto.randomUUID()}.png`;
          const { error } = await client.storage
            .from('ai360-images')
            .upload(imagePath, Buffer.from(item.result, 'base64'), { contentType: 'image/png' });
          if (error) throw error;
          break;
        }
      }

      const text = response.output_text || (imagePath ? 'Here is the image.' : 'I could not generate a reply. Please try again.');
      const { error: saveError } = await client.from('messages').insert([
        { conversation_id: conv.id, role: 'user', content: message.trim() },
        { conversation_id: conv.id, role: 'assistant', content: text, image_url: imagePath }
      ]);
      if (saveError) throw saveError;
      await client.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conv.id);
      return res.status(200).json({ conversationId: conv.id, text, imagePath });
    }

    // Text replies stream immediately so the app feels responsive like ChatGPT.
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders?.();

    write(res, { type: 'start', conversationId: conv.id });

    const stream = await ai.responses.create({ ...common, stream: true });
    let text = '';

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta' && event.delta) {
        text += event.delta;
        write(res, { type: 'delta', delta: event.delta });
      }
    }

    if (!text.trim()) text = 'I could not generate a reply. Please try again.';

    const { error: saveError } = await client.from('messages').insert([
      { conversation_id: conv.id, role: 'user', content: message.trim() },
      { conversation_id: conv.id, role: 'assistant', content: text }
    ]);
    if (saveError) throw saveError;

    await client.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conv.id);
    write(res, { type: 'done', conversationId: conv.id });
    res.end();
  } catch (e) {
    console.error(e);
    if (res.headersSent) {
      write(res, { type: 'error', error: 'The assistant could not complete that request. Please try again.' });
      return res.end();
    }
    return fail(res, 'The assistant could not complete that request. Please try again.', 500);
  }
}
