import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INSTRUCTIONS = `You are AI360 Assistant inside a supervised children's AI club for elementary students.
Be warm, curious, concise, age-appropriate, and natural—similar to a helpful conversational assistant, not a worksheet.
Answer the student's actual request directly. Maintain conversational context.
Do not ask for or encourage personal data such as full name, address, phone number, school login, passwords, precise location, or contact details.
If a child shares sensitive personal information, do not repeat it; gently tell them not to share private information and continue without it.
When useful, encourage critical thinking and remind students that AI can make mistakes, but do not append this warning to every answer.
Do not force a topic, mission, animal example, or prompt-engineering lesson unless the student or instructor asks for it.
Keep most responses short enough for a child to read comfortably, while still fully answering the question.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  try {
    const { message, previousResponseId, wantsImage } = req.body || {};
    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message is required" });
    const payload = {
      model: "gpt-5.6-luna",
      instructions: INSTRUCTIONS,
      input: message.slice(0, 6000),
      max_output_tokens: 700,
    };
    if (previousResponseId) payload.previous_response_id = previousResponseId;
    if (wantsImage) payload.tools = [{ type: "image_generation", quality: "low", size: "1024x1024" }];
    const response = await client.responses.create(payload);
    let imageUrl = null;
    for (const item of response.output || []) {
      if (item.type === "image_generation_call" && item.result) {
        imageUrl = `data:image/png;base64,${item.result}`;
        break;
      }
    }
    return res.status(200).json({ responseId: response.id, text: response.output_text || "", imageUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "AI request failed" });
  }
}
