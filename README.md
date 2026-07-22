# Veenew

A calm & minimal microblogging website with Markdown support.

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

4. Export environment variables (or run through your preferred env loader) and start:

```bash
npm start
```

The app runs on `http://localhost:3000` by default.
You can also access it via `http://veenew.local:3000`.

## Custom domains

Every user is served at `username.veenew.com`. Users can also serve their blog
from their own domain:

1. In **Settings → Custom domain**, enter the domain (e.g. `blog.example.com`).
2. Create a `CNAME` DNS record for that domain pointing to `cname.veenew.com`.

Once DNS propagates, the blog is served on the custom domain, and canonical URLs
(RSS/JSON feeds, the directory, etc.) use it. Requests to the `www.` counterpart
of a configured apex domain resolve to the same blog. Clear the field in Settings
to revert to the default subdomain.

Notes:

- The reverse proxy / TLS terminator in front of the app must route the custom
  domain's traffic to this server and provision a certificate for it.
- To test locally, point a fake domain at `127.0.0.1` in `/etc/hosts`, set it as
  your custom domain in Settings, and browse to it with the app's port.

## Scripts

- `npm start`: start server
- `npm run api-dev`: start with CSRF disabled (local API testing only)
- `npm test`: lint project

### Contributions

Please refer <a href="https://github.com/vasanthv/veenew/blob/main/CONTRIBUTIONS.md">CONTRIBUTIONS.md</a> for more info.

### LICENSE

<a href="https://github.com/vasanthv/veenew/blob/main/LICENSE">MIT License</a>
