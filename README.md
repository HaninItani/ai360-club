# AI360 Club

A Vercel-hosted AI workspace with an instructor dashboard and student accounts. The original AI360 logo is preserved. OpenAI calls, Supabase service-role access, code hashing and session signing happen only in server functions.

## Set up the existing deployment

1. In the Supabase SQL editor, apply `supabase/schema.sql` to the intended project.
2. In Supabase Authentication, create Hanin's email/password account. Only the email matching `ADMIN_EMAIL` may enter the instructor dashboard. Do not give students instructor credentials.
3. Set these Vercel environment variables for the existing project: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (a long random secret), `ADMIN_EMAIL`, and `OPENAI_API_KEY`. Optional: `OPENAI_MODEL` (defaults to `gpt-4.1-mini`). Keep all values server-side; none use a `VITE_` or `NEXT_PUBLIC_` prefix.
4. Deploy this directory through the existing GitHub/Vercel project. The static pages and `/api/*` serverless functions share the same origin.

Do not turn on public database policies. The API checks the signed session and conversation ownership on every request. Students only see their own chats. The instructor can review student chats and manage the roster. Private generated images are served through a checked endpoint. Newly created student codes appear once; give each code to its student. Pause an account to revoke access.

The projector refreshes every three seconds while signed in. Use the instructor dashboard to publish its title and prompt, then open the projector view in a second tab or display. This is polling, so Supabase Realtime is not required.

## Local verification

Run `npm ci && npm test`. For end-to-end verification, configure the environment variables and Supabase schema, start with `npx vercel dev`, then sign in as instructor, create a student, sign in with its code in a separate browser, exchange two messages, review the conversation as instructor, publish a classroom prompt, and test image creation. OpenAI and Supabase credentials are required for these live checks.
