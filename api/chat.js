import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE = `You are AI360, a general-purpose AI assistant used in a supervised elementary AI club. Behave like a normal, capable conversational AI: natural, direct, useful, and never childish or patronizing. Do not constantly mention the club, learning, safety, or the user's age. Answer the actual request first and preserve conversational context. Do not ask for or encourage sensitive personal data such as passwords, home address, phone number, school login, precise location, or private contact details. If sensitive personal information is shared, do not repeat it. When useful, encourage checking important facts because AI can make mistakes.`;
function levelInstruction(group){if(group==='grades12')return `The user is in Grades 1–2. Quietly adapt vocabulary, sentence length, and explanation complexity when needed. Keep the tone normal and intelligent, not babyish.`;if(group==='grades35')return `The user is in Grades 3–5. Quietly adapt explanations to that level while preserving depth, reasoning, and a normal conversational tone.`;return `Use a normal general-audience conversational style.`}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY is not configured"});
  try{
    const {message,previousResponseId,wantsImage,gradeGroup}=req.body||{};
    if(!message||typeof message!=="string") return res.status(400).json({error:"Message is required"});
    const payload={model:"gpt-5.6-luna",instructions:`${BASE}\n\n${levelInstruction(gradeGroup)}`,input:message.slice(0,6000),max_output_tokens:900};
    if(previousResponseId) payload.previous_response_id=previousResponseId;
    // Image generation remains opt-in. If the configured model/tool is unavailable, text chat still works normally.
    if(wantsImage) payload.tools=[{type:"image_generation"}];
    const response=await client.responses.create(payload);
    let imageUrl=null;
    for(const item of response.output||[]){if(item.type==="image_generation_call"&&item.result){imageUrl=`data:image/png;base64,${item.result}`;break}}
    return res.status(200).json({responseId:response.id,text:response.output_text||"",imageUrl});
  }catch(err){console.error(err);return res.status(500).json({error:err?.message||"AI request failed"})}
}
