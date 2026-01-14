<p align="center">
  <img src="https://raw.githubusercontent.com/kittendevv/Invio/refs/heads/main/assets/banner-default.png" alt="Invio" width="100%" />
</p>
<p align="center"><b>Self-hosted invoicing without the bloat. Fast, transparent, and fully yours.</b></p>
<p align="center">
  <a href="https://demo.invio.dev">Live Demo</a> •
  <a href="https://github.com/kittendevv/Invio/wiki">Documentation</a> •
  <a href="https://ko-fi.com/codingkitten">Support</a>
</p>
<p align="center">
  <a href="https://www.producthunt.com/products/invio-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-invio&#0045;2" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1025437&theme=dark&t=1760267997318" alt="Invio - Self&#0045;Hosted&#0032;invoicing&#0032;without&#0032;the&#0032;bloat | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <a href="https://ko-fi.com/codingkitten" target="_blank"><img src="https://storage.ko-fi.com/cdn/brandasset/v2/support_me_on_kofi_dark.png" alt="Support Me" style="width: 250px; height: 54px;" width="250" height="54" /></a>
</p>
<p align="center">
  <img src="https://hackatime-badge.hackclub.com/U080TNHKK32/Invio" alt="Hacktime Badge" style="height: 30px;" height="30">
</p>

---

## Info

It has been a little while since my last commit, I have just been busy with life in general. This project is not of my radar and it is something I wish to keep on working on.

## 🌟 Why Invio?

- Built for doing, not configuring — create an invoice, send a link, get paid. No CRMs, projects, or bloat getting in your way.
- You really own it — self‑hosted by default. Your data lives where you put it, and exporting is always an option.
- Fast & dependable — Deno + Fresh on the frontend and Hono + SQLite on the backend keep things simple and quick.
- Client‑friendly — share a secure public link—no accounts or passwords required to view invoices.
- Secure by default — built-in security headers, JWT authentication, and rate limiting to protect your instance.

## 🔐 Security Features

Invio includes several security features out of the box:

- **Rate Limiting** — Protects the login endpoint against brute-force attacks (by IP, username, and combination)
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, CSP, and more
- **JWT Authentication** — Secure session management with configurable TTL
- **HSTS Support** — Optional Strict-Transport-Security headers for HTTPS deployments

### Rate Limiting Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_MAX_ATTEMPTS` | `5` | Max failed attempts before blocking |
| `RATE_LIMIT_WINDOW_SECONDS` | `900` | Time window (15 minutes) |
| `RATE_LIMIT_TRUST_PROXY` | `false` | Trust X-Forwarded-For header |

Rate limiting tracks failed attempts by:
- **IP address** — Blocks an IP after too many failed attempts on any account
- **Username** — Blocks a username after too many failed attempts from any IP (distributed attack protection)
- **IP + Username** — Blocks specific combinations

### Reverse Proxy Configuration

When running Invio behind a reverse proxy, set `RATE_LIMIT_TRUST_PROXY=true` and configure your proxy to forward the client IP:

<details>
<summary><b>nginx</b></summary>

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
</details>

<details>
<summary><b>Apache</b></summary>

```apache
<VirtualHost *:443>
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
    RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

Requires: `mod_proxy`, `mod_proxy_http`, `mod_headers`
</details>

<details>
<summary><b>Caddy</b></summary>

```caddyfile
invio.example.com {
    reverse_proxy localhost:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Note: Caddy automatically sets `X-Forwarded-For` by default.
</details>

See [`.env.example`](.env.example) for all configuration options.

## 💳 Payment Integrations

Invio supports payment integrations to accept payments directly on your invoices. Configure integrations in **Settings → Integrations**.

### PayPal Integration

Accept payments via PayPal on your published invoices. Supports both Sandbox (testing) and Live (production) modes.

**Setup:**
1. Create a PayPal Developer account at [developer.paypal.com](https://developer.paypal.com)
2. Create a REST API app to get your Client ID and Secret
3. Generate an encryption key: `openssl rand -base64 32`
4. Add the encryption key to your environment variables
5. Configure PayPal credentials in Settings → Integrations

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYPAL_ENCRYPTION_KEY` | Yes | 32-byte base64 key for encrypting PayPal credentials |

**Features:**
- **Encrypted Credentials** — PayPal Client ID and Secret are stored with AES-256-GCM encryption
- **Sandbox Mode** — Test payments without real transactions
- **Payment Links** — Generate PayPal checkout links for invoices
- **Webhook Support** — Automatic payment status updates via PayPal webhooks
- **Payment Tracking** — Full payment history on each invoice

**Webhook Configuration:**
To receive automatic payment updates, configure a webhook in your PayPal Developer Dashboard:
1. Go to your app's settings in the PayPal Developer Dashboard
2. Add a webhook URL: `https://your-domain.com/api/webhooks/paypal`
3. Subscribe to events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`

> **Note:** PayPal credentials are encrypted at rest. Never commit your `PAYPAL_ENCRYPTION_KEY` to version control.

## 🖼️ Screenshots
<details>
<summary>Dashboard</summary>
  
<img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/a6f7621a1f74b0de42507743c78da94c83e82c8a_screenshot_2025-10-26_092947.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Invoice Creation</summary>
  
<img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/e3ec9ac920db9f4606f9a46096b93acfa59de569_screenshot_2025-10-26_093746.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Settings</summary>
  
<img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/3e0acb92d7b807c3ca472d5d8f13907d12bee50e_screenshot_2025-10-26_094056.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Invoices</summary>
  
<img src="https://hc-cdn.hel1.your-objectstorage.com/s/v3/5ac9f89da2a86332583027f70630bb772f652836_invoices.png" alt="Invio Dashboard" width="100%" />
  
</details>

## 💖 Contributors

Invio is made possible by your contributions!

<a href="https://github.com/kittendevv/Invio/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=kittendevv/Invio" />
</a>

## 🤝 Contributing

- Found a bug or have an idea? Open an issue.
- Want to add a feature or fix something? Fork and submit a PR.
- All experience levels welcome — we’re excited to build with you.

## ☕ Support me

If you like Invio and want to support development:
- Buy me a coffee: https://ko-fi.com/codingkitten


---
Made with 💖 by <a href="https://github.com/kittendevv">kittendevv</a> and contributors — if you find this useful, please ⭐️ the repo!
