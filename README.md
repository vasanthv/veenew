# Veenew

A calm & minimal website for blogging, microblogging and more, written in Markdown. Every account gets pages, posts, microblogs, bookmarks, photos, a guestbook, email subscriptions and RSS feeds, on its own subdomain or custom domain.

## Tech stack

- Node.js + Express
- EJS templates + Vue (browser-side)
- MongoDB + Mongoose

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill values:

```bash
cp .env.example .env
```

3. Add local host mappings (required for development domain):

```bash
sudo nano /etc/hosts
```

Add:

```text
127.0.0.1 veenew.local
127.0.0.1 www.veenew.local
127.0.0.1 vasanth.veenew.local
```

Notes:

- `veenew.local` matches the local `DOMAIN` in `config.js`.
- You can replace `vasanth` with any username subdomain you want to test.
- On Windows, edit `C:\Windows\System32\drivers\etc\hosts` with the same entries.

4. Start the dev server (loads `.env` automatically, requires Node 20.6+):

```bash
npm run dev
```

`npm start` does not read `.env`; it expects the variables to already be set (as in Docker).

The app runs on `http://localhost:3000` by default.
You can also access it via `http://veenew.local:3000`.

## Custom domains

Every user is served at `username.veenew.com`. Users can also serve their blog
from their own domain:

1. In **Settings → Custom domain**, enter the domain (e.g. `blog.example.com`).
2. Create a `CNAME` DNS record for that domain pointing to `cname.veenew.com`.

Once DNS propagates, the blog is served on the custom domain, and canonical URLs
(RSS/JSON feeds, etc.) use it. Requests to the `www.` counterpart
of a configured apex domain resolve to the same blog. Clear the field in Settings
to revert to the default subdomain.

Notes:

- On DigitalOcean App Platform, add the custom domain to the app under
  **Settings → Domains** so traffic is routed to this server and a certificate is
  provisioned for it.
- To test locally, point a fake domain at `127.0.0.1` in `/etc/hosts`, set it as
  your custom domain in Settings, and browse to it with the app's port.

## Scripts

- `npm run dev`: start server with variables from `.env`
- `npm start`: start server (environment must already be set)
- `npm run api-dev`: start with CSRF disabled (local API testing only)
- `npm test`: lint project

### Contributions

Please refer <a href="https://github.com/vasanthv/veenew/blob/main/CONTRIBUTIONS.md">CONTRIBUTIONS.md</a> for more info.

### LICENSE

<a href="https://github.com/vasanthv/veenew/blob/main/LICENSE">MIT License</a>
