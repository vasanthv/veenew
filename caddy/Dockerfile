# Caddy with the Cloudflare DNS plugin, so the wildcard certificate for
# *.veenew.com can be issued over DNS-01 while the zone stays proxied.
FROM caddy:2-builder AS builder

RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
