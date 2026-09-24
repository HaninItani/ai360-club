import crypto from 'node:crypto';
import OpenAI, { toFile } from 'openai';
import { actor, db, fail } from '../lib/server.js';

const BASE = `You are AI360, a natural, capable AI assistant for a supervised educational club for children in Grades 1–5. Give students the same kind of useful, flexible conversational experience they would expect from a modern general-purpose AI assistant. Answer the student's actual request first and do not force every conversation into an AI lesson, activity, mission, quiz, or classroom exercise.

Accuracy matters because this is an educational setting. Prefer well-established facts, explain clearly, and never invent a fact just to sound confident. If you are uncertain, say so briefly. When a question has an age-appropriate explanation, make the reasoning understandable rather than giving only an unexplained answer. For schoolwork, help the student understand and think through the problem instead of unnecessarily doing all of the thinking for them.

Be conversational, warm, direct, and context-aware without sounding childish, patronizing, overly enthusiastic, or scripted. Match the student's language when practical. Keep simple questions concise; give fuller explanations when useful. Use clean Markdown for headings, bullets, numbered lists, emphasis, and code when it improves readability. Do not unnecessarily escape ordinary Markdown punctuation such as periods in numbered lists. Preserve relevant context from the current conversation.

Protect children’s privacy. Do not ask for passwords, home addresses, phone numbers, school logins, or other sensitive personal information. If such information is shared, do not repeat it. Follow applicable safety rules for minors. When generating or editing images, follow the user's visual request while keeping the result age-appropriate.`;

const level = g =>
  g === 'grades12'
    ? `Adapt your responses for a student in Grades 1–2 (approximately ages 6–8).
Use short, clear sentences and familiar everyday words. Explain one idea at a time and focus on the most important 2–4 points before adding extra detail. Keep simple questions fairly short.

You may introduce real educational vocabulary, but explain a new or difficult word immediately in simple language. Prefer concrete examples children can picture over abstract explanations. Do not remove important facts just to make an answer easier.

Sound natural and respectful, not babyish. Do not use excessive emojis, exaggerated excitement, pretend characters, or unnecessary games unless the student asks for them.

For questions that involve reasoning, guide the student in an age-appropriate way rather than making the reasoning too advanced.`
    : g === 'grades35'
      ? `Adapt your responses for a student in Grades 3–5 (approximately ages 8–11).
Use clear, natural language while allowing more detail and subject-specific vocabulary. Explain important vocabulary when it may be unfamiliar. Students at this level can receive multi-step explanations, causes and effects, comparisons, and more detailed reasoning when useful.

Keep explanations understandable and engaging without oversimplifying them or sounding childish. Encourage understanding and reasoning rather than only giving an answer.`
      : 'Use a normal general-audience style.';

const write = (res, value) => res.write(JSON.stringify(value) + '\n');

// Natural image requests should work without requiring the student to press a special button.
const asksForImage = value => {
  const text = String(value || '').toLowerCase();
  return /\b(generate|create|make|draw|design|illustrate|show me|picture of|image of|photo of|poster of|logo of)\b/.test(text) &&
    /\b(image|picture|photo|drawing|illustration|poster|logo|art|artwork|character|scene|wallpaper|sticker|icon)\b/.test(text);
};

// Follow-up edits often do not repeat the word "image" (for example: "remove the heart and put a star").
// If this conversation already contains an image, treat clear visual-change language as an image edit.
const asksToEditPreviousImage = value => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  if (/\b(same|previous|last|that|this)\s+(image|picture|photo|drawing|poster|logo)\b/.test(text)) return true;
  if (/\b(edit|modify|redesign|restyle|recolor)\b/.test(text)) return true;
  return /\b(remove|delete|erase|replace|swap|add|put|change|turn|make)\b/.test(text) &&
    /\b(background|color|colour|heart|star|robot|alien|object|character|clothes|outfit|hat|hair|eyes|face|sky|planet|text|word|logo|shirt|dress|backpack|scene|lighting)\b/.test(text);
};

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
      .select('role,content,image_url')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (priorError) throw priorError;

    const history = prior.reverse();
    const input = [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() }
    ];
    const previousImage = [...history].reverse().find(m => m.image_url)?.image_url || null;

    const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    const common = {
      model,
      instructions: BASE + '\n' + level(user.group),
      input,
      max_output_tokens: 1400
    };

    // Image requests behave conversationally: create a new image, or actually edit the latest image.
    // Never claim an edit is complete unless a new image asset was successfully produced.
    const shouldEditImage = Boolean(previousImage) && asksToEditPreviousImage(message);
    const shouldGenerateImage = !shouldEditImage && (Boolean(wantsImage) || asksForImage(message));

    if (shouldEditImage || shouldGenerateImage) {
      const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
      let imageResponse;

      if (shouldEditImage) {
        const { data: previousBlob, error: downloadError } = await client.storage
          .from('ai360-images')
          .download(previousImage);
        if (downloadError || !previousBlob) throw downloadError || new Error('Previous image could not be loaded');

        const previousBytes = Buffer.from(await previousBlob.arrayBuffer());
        const previousFile = await toFile(previousBytes, 'previous-image.png', { type: 'image/png' });
        imageResponse = await ai.images.edit({
          model: imageModel,
          image: previousFile,
          prompt: `Edit the provided image according to this request: ${message.trim()} Preserve everything else from the original image as closely as possible unless the request requires changing it.`,
          size: '1024x1024',
          quality: 'low'
        });
      } else {
        imageResponse = await ai.images.generate({
          model: imageModel,
          prompt: message.trim(),
          size: '1024x1024',
          quality: 'low'
        });
      }

      const base64 = imageResponse.data?.[0]?.b64_json;
      if (!base64) throw new Error('Image model returned no image data');

      const imagePath = `${conv.id}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await client.storage
        .from('ai360-images')
        .upload(imagePath, Buffer.from(base64, 'base64'), { contentType: 'image/png' });
      if (uploadError) throw uploadError;

      const text = shouldEditImage
        ? 'Done — here is the updated image.'
        : 'Here is the image I created for you.';
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
