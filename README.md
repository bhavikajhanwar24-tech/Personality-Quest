# Personality Quest

A real form backend for `Personality Quest.html`. Public visitors may submit a name and personality type; only the owner can view submissions or totals.

## Run locally

1. Copy `.env.example` to `.env`.
2. Replace `ADMIN_PASSWORD` with a password of at least 12 characters.
3. Install dependencies and start:

```powershell
npm install
npm start
```

4. Open `http://localhost:3000` for the public form.
5. Open `http://localhost:3000/owner` for the private dashboard.

Submissions are stored in `data/responses.db` on the server. Do not commit `.env` or `data/`.

For public internet hosting, set `COOKIE_SECURE=true` and serve the app through HTTPS. Hosting with persistent disk is required so responses are not deleted after redeployments.

## Deploy publicly on Render

1. Push this project to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Render reads `render.yaml`, creates a persistent SQLite disk, and generates `ADMIN_PASSWORD` automatically.
4. Open **Environment** in the service and copy the generated admin password if you need to sign in at `/owner`.
5. Wait for the deploy, then use the HTTPS `*.onrender.com` link Render provides.

The free service may sleep when idle. The public link and stored submissions remain available after it wakes; cold starts can take a few seconds.
