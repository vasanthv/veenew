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

## Scripts

- `npm start`: start server
- `npm run api-dev`: start with CSRF disabled (local API testing only)
- `npm test`: lint project

### Contributions

Please refer <a href="https://github.com/vasanthv/veenew/blob/main/CONTRIBUTIONS.md">CONTRIBUTIONS.md</a> for more info.

### LICENSE

<a href="https://github.com/vasanthv/veenew/blob/main/LICENSE">MIT License</a>
