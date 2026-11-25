# VocaGPT

VocaGPT reads Kurnii’s university lunch menus, translates Finnish and Swedish dishes into English, and posts a mobile-friendly message to a WhatsApp group. It runs on weekdays at **07:00 Europe/Helsinki**. A missed delivery can catch up from 07:00 until 12:00 on the same weekday. The Monday 01:00 source check records scraper results.

## Run the bot

From the project directory, with Node.js 20 or newer:

1. Run `npm ci` and `npx playwright install chromium`.
2. For a new installation, copy `.env.example` to `.env`. Configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Keep existing installations’ credentials and session directories.
3. Run `npm run test:unit` for offline tests and `npm run test` for a live menu preview. The preview uses Kurnii and the configured OpenAI account on weekdays and does not connect to WhatsApp.
4. Run `npm run groups` (or `node bot.js --list-groups`) to list group IDs. If necessary, scan the QR in WhatsApp under Linked devices.
5. Set `WHATSAPP_GROUP_ID` to your production group ID. `WHATSAPP_PRODUCTION_GROUP_ID` is an explicit override. To use the playground, also set `WHATSAPP_PLAYGROUND_GROUP_ID` to a different group.
6. Choose a CLI mode.

| Command | Action |
|---|---|
| `node bot.js` | Start scheduled production delivery |
| `node bot.js --dry-run` | Preview without connecting to WhatsApp |
| `node bot.js --test-send` | Send today's menu once to `WHATSAPP_PLAYGROUND_GROUP_ID` and exit. A missing playground ID stops the command. |
| `node bot.js --send-production` | Send today's menu to production immediately and exit. Counts as the production delivery for that day. |
| `node bot.js --list-groups` | List WhatsApp groups |
| `node bot.js --playground` | Start scheduled playground delivery |

Both manual send modes run independently of the scheduler. Playground test sends can be repeated and leave delivery state untouched. Before sending, the bot verifies the configured group ID and account membership. The log records the group, outgoing message ID and acknowledgement. A send counts as successful after WhatsApp acknowledges it at the server. An unconfirmed send times out after 30 seconds and may still appear in the chat later.

WhatsApp uses the existing `.wwebjs_auth` session. Run from the same directory you previously used. Set `WHATSAPP_CHROME_PATH` if WhatsApp needs a specific Chrome installation. Keep the process running and the machine awake for scheduled delivery. `SEND_ON_START=true` explicitly allows one immediate weekday delivery at first connection, including outside the catch-up window.

## Logs and delivery records

- `logs/bot.jsonl` records UTC timestamps, job outcomes, WhatsApp lifecycle events and a five-minute heartbeat.
- `logs/` also stores timestamp-correlated per-run raw scrape JSON and generated text files for previews and deliveries. The Monday probe stores raw data only. Archive or prune old artifacts periodically.
- `delivery-state/` records claims and successful sends per Helsinki date and group. The prior `sent-state.json` still suppresses duplicates for the legacy production group. Run one bot process per WhatsApp session. If an attempt has a claim with no corresponding sent record, verify the group’s chat before manually clearing the claim to permit a retry.

## Source and translation limits

Kurnii publishes one Monday–Sunday set of panels. Its weekday buttons toggle local panels. Date-based retrieval checks the Monday date carried by the Fabriikki source link, and is limited to the verified current Helsinki week. Layout or link changes can require scraper maintenance. The date service is ready for future commands. There are currently no interactive WhatsApp handlers.

Kurnii’s combined closure or missing-menu notice is displayed as ambiguous. Automatic validation checks translation structure and meal coverage by ID. It cannot guarantee semantic accuracy for individual ingredients or translations. WhatsApp Web delivery depends on the existing unofficial client and a valid session. The heartbeat reports readiness after a disconnect. Recovery requires the client to emit readiness again or the process to be restarted.
