# VAMK Lunch Bot

Node.js bot for a WhatsApp group. Uses Playwright to read restaurant pages, OpenAI to extract/translate English lunch menus, and unofficial whatsapp-web.js to deliver them. Scheduled Monday–Friday at 09:00 Europe/Helsinki (handles DST). The initial list contains Serveri, Alere, and Mathilda/Café Oskar. Add verified restaurant menu URLs to `restaurants.json` for broader coverage.

## Setup (Windows PowerShell or terminal)

1. Install Node.js 20+.
2. Unzip and open a terminal in this folder.
3. Run `npm install`.
4. Run `npx playwright install chromium`.
5. Copy `.env.example` to `.env`, enter your OpenAI API key (paid API usage).
6. Run `npm run test` to preview extracted and translated menu without WhatsApp.
7. Run `npm run groups`, scan the WhatsApp QR using WhatsApp > Linked devices, and copy your target group's ID ending `@g.us`.
8. Paste the ID into `.env` as `WHATSAPP_GROUP_ID=...`.
9. Run `npm start`. Keep the process running (PC awake, internet connected). It will send weekdays at 09:00 Finland time. For immediate sending after startup, temporarily set `SEND_ON_START=true`.

## Notes

- The source pages change over time; preview the output before enabling delivery. The AI is instructed not to invent missing dishes and to flag unverified dates, but automated extraction is not a guarantee of accuracy.
- WhatsApp Web automation is unofficial, may break or trigger account restrictions. Obtain group permission; preferably use a dedicated account.
- Never commit `.env`, `.wwebjs_auth`, `.wwebjs_cache`, or `sent-state.json` to a repository. Protect the machine where session credentials are stored.
- `sent-state.json` prevents duplicate daily sends after a successful delivery. It does not guarantee exactly-once delivery in the event of crashes.
- If the computer is asleep at 09:00, the bot won't send retroactively. For reliable scheduling, run on an always-on server.
- If menu source is unavailable, the bot includes a warning rather than making up dishes.
