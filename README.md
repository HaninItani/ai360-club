# AI360 Club — real OpenAI test build

This version connects the student chat to the OpenAI Responses API through a server-side Vercel function. The API key is never exposed in the browser.

## Deploy on Vercel
1. Put this folder in a GitHub repository.
2. Import the repository into Vercel.
3. In Vercel Project Settings > Environment Variables, add `OPENAI_API_KEY` with your OpenAI API key.
4. Deploy.
5. Open the Vercel URL and test with any explorer name/code.

## Important
- Real OpenAI requests cost API usage once the key is connected.
- The instructor dashboard is still browser-local in this build. It does NOT yet sync across 15 devices. Supabase/realtime is the next step.
- Image generation is connected in low quality for cheaper testing.
- Do not put the API key in index.html or any browser-side JavaScript.
