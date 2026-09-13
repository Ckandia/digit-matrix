# Digit Matrix - Fix for the new Deriv API system

## What was wrong

Your site still used Deriv's old test ID `1089`. Deriv now rejects it on live
websites, so no market data ever loaded and the app looked like it was stuck
on "login".

## The fix (3 file changes, all copy-paste)

### STEP 1 - Backend repo (digit-matrix-backend)

1. Open the file `main.py` in your GitHub repo (click it, then click the pencil icon).
2. Delete everything in it.
3. Paste the entire contents of the new `main.py` file.
4. Scroll down, click "Commit changes".

This adds the NEW Deriv OAuth 2.0 login endpoints. Render will redeploy
automatically in ~2 minutes.

### STEP 2 - Frontend repo (digit-matrix)

1. Create a new file `public/login.html`:

- Click "Add file" -> "Create new file".
- Name it exactly: `public/login.html`
- Paste the entire contents of `login.html`.
- Click "Commit changes".

2. Update the file `.env.production`:

- Click it, then the pencil icon.
- Change the line `NEXT_PUBLIC_DERIV_LEGACY_APP_ID=1089` to
`NEXT_PUBLIC_DERIV_LEGACY_APP_ID=33W9dWUpOglEIjhAHXXag`
- Click "Commit changes".

3. Vercel will redeploy automatically in ~2 minutes.

### STEP 3 - Deriv dashboard (developers.deriv.com)

1. Open your app "digitmatrix".
2. Change the Redirect URL to exactly:
https://digit-matrix-carlos-githaes-projects.vercel.app/login.html
3. Save.

### STEP 4 - Test

1. Wait ~3 minutes for both redeploys.
2. Open your site in an Incognito/Private window (or press Ctrl+Shift+R).
3. Go to: https://digit-matrix-carlos-githaes-projects.vercel.app/login.html
4. Click "Login with Deriv", approve, and you should see a green
"Login successful!" message with your accounts listed.

## Important warnings

- Your BACKEND_API_KEY is visible publicly on GitHub and inside your website's
JavaScript. After everything works, change it in Render's Environment
Variables AND in `.env.production`.
- New Deriv login tokens expire (about 1 hour). The login page saves the token
in your browser so the app can use it right away.
- If the main app still shows an empty market list after this fix, it means
Deriv's new system no longer feeds the old bot screen - use Deriv's official
free bot builder at app.deriv.com instead.
