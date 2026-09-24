# AI360 Club — Professional Prototype

A polished AI360 classroom web app with:
- ChatGPT-style multi-turn conversation context
- Proper Markdown rendering for headings, lists, bold text, and code
- Responsive laptop/iPad/mobile layout
- Dedicated CSS and JavaScript files
- New Chat behavior that resets conversation context
- AI360 image-generation mode
- Local instructor/projector prototype controls
- Server-side OpenAI API key via Vercel environment variable

## Vercel
Set `OPENAI_API_KEY` in Vercel Environment Variables. Keep Output Directory override set to `.` for this project structure.

## Important
The instructor dashboard currently uses browser localStorage, so it is not yet a real multi-device monitoring dashboard. Add Supabase/realtime storage before classroom-wide deployment.
