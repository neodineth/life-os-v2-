# New backend for LifeOS V2

Status: database scripts are still being verified. Do not apply SQL yet.

## You can do this now
1. Create the new Supabase project in your own account.
2. Wait until its status is Healthy.
3. Keep the database password private. Do not send it in chat.
4. Keep the old project intact while V2 is being prepared.

## After the migration is verified
1. Open the new project SQL Editor and run the exact setup file supplied with V2. Stop if any error appears.
2. Enable email confirmation under Authentication.
3. Set the development Site URL to http://127.0.0.1:3001 and allow http://127.0.0.1:3001/auth/confirm as an authentication redirect.
4. Copy .env.example to .env.local in this folder. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the new project, and NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001. Never use a service-role key in a NEXT_PUBLIC variable.
5. Restart the app and create a test account, confirm its email, save a task and reload. Then verify account isolation with a second account.

The Gemini key is optional. Camera tracking and focus checkpoint uploads are excluded from V2.
