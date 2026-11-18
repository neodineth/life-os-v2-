# Gemini chatbot

AI chat uses the existing Supabase login and a server-side Next.js API route. No additional Supabase migration is needed. The model is `gemini-3.5-flash-lite`, listed with free input/output tokens on Google's pricing page when integrated on 3 November 2026. Quotas and availability depend on the Google project and region. A paid Google project can incur charges for the same model; keep the project on the Free tier if you only want free usage. The app never upgrades billing or switches to a paid fallback.

## Connect Google

1. Open https://aistudio.google.com/apikey and create a Gemini API key in your own Google project. Check its plan is Free; billing is not required for this integration's free usage.
2. Open `.env.local` in this project's root directory. Keep the existing Supabase entries and add:

```dotenv
GEMINI_API_KEY=your_actual_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

3. Do not use a `NEXT_PUBLIC_` prefix for the Gemini key. Do not commit it or paste it into chat. `.env.local` is ignored by Git.
4. Restart the development server with `npm run dev`. Open AI chat in the app's navigation. Send a short question; the setup message should disappear and a Gemini reply should appear.
5. For a deployment, add the same two server environment variables in the hosting dashboard and redeploy. The local `.env.local` file is not deployed.

## What is sent

Messages are sent to Google only when Send is pressed. Task sharing is off by default. Enabling it includes up to 80 unfinished tasks fetched by the server through the signed-in user's Supabase client: task titles, workspaces, deadlines, priorities, and numeric progress. Other accounts' tasks are never fetched. Changing sharing clears the current chat so previous task data is not resent. No camera data, focus history, task-level notes, API keys, or account email are included in task context. Google's free-tier terms allow content to be used to improve its products.

Conversation state lives in the current page's memory, survives navigation between app views, and clears on reload, New chat, or account change. It is not synced to Supabase. Responses are rendered as plain text. The assistant can suggest changes but cannot modify tasks or calendar records.

## Limits and errors

The route requires a valid Supabase session, matching account header, same-origin JSON requests, alternating message roles, at most 4,000 characters per user message and 24,000 total conversation characters. It retains the latest conversation pairs and limits replies to 1,024 output tokens. A per-account, per-server-process limiter permits five requests a minute. That limiter resets on process restart and is not shared between hosting instances; Google's project quota is the final provider limit. There are no automatic paid fallbacks or automatic retry loops. Missing keys, quota exhaustion, timeouts, blocked/empty responses, and invalid model access show retry/setup messages while retaining the user's draft.

## Verification

Run `node --test tests/chat-api.test.mjs`, targeted ESLint, and `npm run build`. The route tests use mocked Gemini responses and isolated authentication/task fixtures; they do not send private data or require a real key. A live reply still needs the user's configured key.

Official references:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/api/generate-content
