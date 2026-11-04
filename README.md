# SUBBY SMS

Telegram bot that helps users browse **free shared/public temporary SMS numbers** on [ASMS.ai](https://asms.ai).

Hosted on **Vercel** (Next.js + TypeScript). Uses **Telegram webhooks** (no long-running polling).

## Honest about the free tier

| Available (free) | Not included |
| --- | --- |
| Links to ASMS.ai public number directory | Live invented phone numbers |
| Guidance + privacy warnings | Reading SMS via free API |
| Commands and inline menus | Private exclusive numbers |

ASMS.ai free inboxes are **public**. Automated API access is a **paid** ASMS feature. This bot does not pretend otherwise.

**Never** use public numbers for banking, primary accounts, password recovery, or sensitive data.

## Commands

| Command | Action |
| --- | --- |
| `/start` | Welcome + main menu |
| `/numbers` | Open public numbers flow + ASMS directory button |
| `/countries` | Browse-by-country guidance + ASMS links |
| `/help` | Instructions |
| `/privacy` | Privacy risks of shared inboxes |

## Stack

- Next.js App Router (TypeScript)
- Route handler webhook: `POST /api/telegram/webhook`
- Optional setup: `POST /api/telegram/setup` (registers webhook)
- Landing page at `/`

## Environment variables

Copy `.env.example` and set:

```bash
TELEGRAM_BOT_TOKEN=     # from @BotFather
TELEGRAM_WEBHOOK_SECRET= # long random string you generate
APP_URL=                # https://your-deployment.vercel.app
```

On Vercel, add the same variables in Project → Settings → Environment Variables.

## Local development

```bash
npm install
cp .env.example .env.local
# fill TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL
npm run dev
```

Telegram webhooks require **HTTPS**. For local testing use a tunnel (e.g. ngrok) and set `APP_URL` to the tunnel URL, then register the webhook.

## Deploy on Vercel

1. Import this GitHub repository in Vercel (project name `subby-sms`).
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `APP_URL`.
3. Deploy.
4. Register the webhook (once per environment):

```bash
curl -X POST "https://YOUR_APP_URL/api/telegram/setup" \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_WEBHOOK_SECRET"
```

Or check current webhook info (header auth only — no query secrets):

```bash
curl "https://YOUR_APP_URL/api/telegram/setup" \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_WEBHOOK_SECRET"
```

Webhook endpoint Telegram will call:

`https://YOUR_APP_URL/api/telegram/webhook`

Telegram sends header `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.

## Create the bot

1. Open [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copy the token into `TELEGRAM_BOT_TOKEN`
3. Optional: set bot description/commands via BotFather

Suggested BotFather command list:

```
start - Main menu
numbers - Public numbers directory
countries - Browse by country
help - How to use
privacy - Privacy risks
```

## Security

- Webhook requests without the correct secret token receive `401`
- Secrets only from environment variables
- No storage of SMS content (bot only sends guidance + links)

## License

Private / your project terms. Not affiliated with ASMS.ai.
