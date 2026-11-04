# Custom domains

Users can serve their blog from their own domain (for example `blog.example.com`). They enter it in Settings and add one DNS record:

```
CNAME  blog.example.com  ->  cname.veenew.com
```

A small [Caddy](https://caddyserver.com) web server on a separate machine handles these domains. It gets an HTTPS certificate for each domain on demand and forwards the traffic to the app.

```
visitor -> blog.example.com -> cname.veenew.com (Caddy server) -> Veenew app
```

Two things keep this safe:

- **Certificates only for registered domains.** Before requesting a certificate, Caddy asks the app (`GET /internal/domain-check?domain=...`). The app answers 200 only if a user saved that domain. Otherwise anyone could point random domains at the Caddy server and use up Let's Encrypt limits.
- **A shared secret.** The app only believes the visitor's domain (`X-Custom-Host`) and IP (`X-Client-IP`) when the request carries `X-Proxy-Secret` matching `PROXY_SECRET`. Without it, anyone calling the app's own hostname directly could pretend to be any blog.

## 1. Create the Caddy server

1. Create an Ubuntu 24.04 server (a small VPS is enough) with a public IP.
2. Open these inbound ports in its firewall. Sources: All IPv4 and All IPv6:

   | Protocol | Port | Why |
   | --- | --- | --- |
   | TCP | 22 | SSH |
   | TCP | 80 | Let's Encrypt validation and the HTTPS redirect |
   | TCP | 443 | HTTPS |

   Allow all outbound traffic, because Caddy has to reach Let's Encrypt and the app. You can limit SSH to your own IP.

## 2. DNS

In the DNS for `veenew.com`, add:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | `cname` | the Caddy server's IP | **DNS only** (Cloudflare grey cloud) |

The record must not be proxied. Caddy has to answer TLS itself.

## 3. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 4. Configure Caddy

Replace `/etc/caddy/Caddyfile` entirely, because the default `:80` block conflicts with the redirect below. Use the app's own hostname (the one your host gives the app, not `veenew.com`) in both places. That skips a trip through Cloudflare and its bot protection.

```
{
	email you@example.com
	on_demand_tls {
		ask https://YOUR-APP-HOST/internal/domain-check
	}
}

https:// {
	tls {
		on_demand
	}
	reverse_proxy https://YOUR-APP-HOST {
		header_up Host {upstream_hostport}
		header_up X-Custom-Host {host}
		header_up X-Client-IP {remote_host}
		header_up X-Proxy-Secret {env.PROXY_SECRET}
	}
}

http:// {
	redir https://{host}{uri} permanent
}
```

`Host` is rewritten because the app's host only answers hostnames it knows.

## 5. Set the shared secret

Generate a secret:

```bash
openssl rand -hex 32
```

Give it to Caddy through systemd:

```bash
sudo systemctl edit caddy
```

Put this in the empty space at the top of the editor:

```ini
[Service]
Environment=PROXY_SECRET=<the generated value>
```

Then set the **same value** as the `PROXY_SECRET` environment variable of the app and redeploy it. If the two differ, custom domain requests are treated as ordinary requests and will not find the blog.

## 6. Apply and verify

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl restart caddy
systemctl show caddy -p Environment
```

The last command should list `PROXY_SECRET=...`.

Save a custom domain on a test account, then check the app's domain check:

```bash
curl -i "https://YOUR-APP-HOST/internal/domain-check?domain=blog.example.com"
```

It returns 200 for a registered domain and 404 for anything else. With the test domain's CNAME pointing at `cname.veenew.com`:

```bash
curl -I https://blog.example.com
```

The first request takes a few seconds while the certificate is issued. Watch what Caddy is doing with:

```bash
sudo journalctl -u caddy -f
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Certificate is never issued; the log shows a timeout on the ask URL | The app with `/internal/domain-check` is not deployed, or the URL is wrong |
| Log says the ask endpoint returned 404 | The domain is not saved on any account, or is spelled differently |
| Let's Encrypt validation fails | Port 80 is blocked, or the domain's CNAME does not lead to the Caddy server yet |
| Site loads but shows a 404 page | `PROXY_SECRET` differs between Caddy and the app, or is missing on one side |
| Everyone is rate limited together | `X-Client-IP` is not trusted because of the same secret mismatch |
| `systemctl show caddy -p Environment` is empty | The override was not saved, run `sudo systemctl edit caddy` again |

## What users need to know

- Add a `CNAME` record from their domain to `cname.veenew.com`. HTTPS is automatic.
- Use a subdomain such as `blog.example.com`. A root domain (`example.com`) only works if their DNS provider supports CNAME flattening or ALIAS records.
- If their DNS is on Cloudflare, the record should be set to "DNS only".
- DNS changes can take a few hours to start working.

## Operations

- **One server is a single point of failure.** If it is down, custom domains are down. `*.veenew.com` blogs are unaffected.
- **Certificates live in `/var/lib/caddy`.** Snapshot or back up the Caddy server so a rebuild does not have to reissue everything. Let's Encrypt allows about 50 new certificates per week for a registered domain, which counts each customer domain separately.
- **Renewals are automatic.** Caddy renews certificates in the background, and falls back to ZeroSSL if Let's Encrypt fails.
- **Removing a domain** (the user clears it in Settings, or an admin deletes it) stops it from being served right away. The certificate is not requested again, because the domain check now returns 404.
