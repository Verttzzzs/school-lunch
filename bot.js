
import 'dotenv/config';
import fs from 'node:fs/promises';
import cron from 'node-cron';
import OpenAI from 'openai';
import { chromium } from 'playwright';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;
const TZ = 'Europe/Helsinki';

const dryRun = process.argv.includes('--dry-run');
const listGroups = process.argv.includes('--list-groups');

const restaurants = JSON.parse(
  await fs.readFile(
    new URL('./restaurants.json', import.meta.url),
    'utf8'
  )
);

const dateStr = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

const weekday = () =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short'
  }).format(new Date());

const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getPages() {
  console.log('Starting restaurant menu scraping...');

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const results = [];

    for (const restaurant of restaurants) {
      console.log(`Fetching: ${restaurant.name}`);

      const page = await browser.newPage({
        locale: 'fi-FI'
      });

      try {
        await page.goto(restaurant.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await page.waitForTimeout(2500);

        const content = (
          await page.locator('body').innerText({
            timeout: 10000
          })
        ).slice(0, 45000);

        results.push({
          ...restaurant,
          content
        });

        console.log(`Fetched: ${restaurant.name}`);

      } catch (e) {
        console.error(
          `Failed fetching ${restaurant.name}:`,
          e.message
        );

        results.push({
          ...restaurant,
          error: String(e.message)
        });

      } finally {
        await page.close();
      }
    }

    return results;

  } finally {
    await browser.close();
  }
}


async function makeMessage(pages) {
  const date = dateStr();

  console.log('Translating menus with OpenAI...');

  const response = await ai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You create a simple, mobile-friendly English WhatsApp lunch menu.

Today in Finland: ${date} (${weekday()}).

SOURCE:
The input contains the daily lunch menu from Kurnii, including multiple restaurants.

TASK:
Translate the COMPLETE menu for today's date into English.
Your job is to translate and organize the menu, NOT summarize it.

IMPORTANT:
Completeness is more important than brevity.
Do not remove any lunch options to make the output shorter.

RESTAURANT ORDER:
Output restaurants in exactly this order:
1. MATHILDA
2. SERVERI
3. ALERE
4. FABRIIKKI
5. W33
6. COTTON CLUB

Always include all six restaurants, even when closed or without a menu.

MENU EXTRACTION AND GROUPING:

The source is a Finnish lunch menu organized into restaurant
sections and meal categories.

FINNISH MENU CATEGORIES:
- Kasvislounas = Vegetarian lunch
- Kotiruokalounas = Home-style lunch
- Lounas = Lunch
- Erikoisannos = Special lunch
- Salaattilounas = Salad lunch
- Jälkiruoka = Dessert
- Päivän keitto = Soup of the day
- Leipätarjonta = Bread selection

IMPORTANT RULES:
- Identify each restaurant and its menu categories.
- Every category containing food must be represented.
- Include ALL dishes, sides and sauces within each category.
- Combine items belonging to one complete meal on ONE line.
- Never split one meal into multiple lines.
- Never omit salad lunches or desserts.
- Do not combine unrelated meal categories.
- Do not invent dishes or ingredients.
- Translate all Finnish dish names into English.

EXAMPLES:

Mathilda - Kasvislounas:
🌱 Beetroot falafel patties + roasted potatoes + lime-chili yoghurt

Fabriikki - Salaattilounas:
🥗 Mozzarella + egg + marinated tofu

Fabriikki - Jälkiruoka:
🍰 Pancake + strawberry jam

Only output these example dishes if they are present
in today's actual source menu.

SPECIAL LUNCH:
- For Mathilda, label dishes listed under the Special Dish category as:
  ⭐ SPECIAL LUNCH: Dish + side + sauce
- Do not label ordinary dishes as special.

ALLERGEN AND DIETARY LABELS:
- Never include allergen codes or dietary abbreviations.
- Remove labels such as (G), (L), (M), (VEG), (MU), (V).
- Remove parenthetical dietary notes such as (includes organic).
- Keep actual food ingredients and dish names unchanged.
- Do not remove food names or ingredients.

LANGUAGE:
- Translate ALL Finnish and Swedish food names into natural English.
- Never leave Finnish dish names untranslated.
- Preserve the original meaning of every dish.
- Do not change ingredients or preparation methods.

RESTAURANT AVAILABILITY:

- Always include all six restaurants in the specified order.
- If a restaurant has a menu for today, translate all its available dishes.
- If a restaurant is explicitly marked as closed, output:
  🔴 CLOSED
- If the source says "Suljettu tai ei listaa saatavilla",
  output:
  ❔ CLOSED OR MENU NOT AVAILABLE
- If no menu is published for today, output:
  ❔ MENU NOT AVAILABLE
- Never assume a restaurant is closed just because its menu is missing.
- Never copy dishes from another day.
- Never invent missing lunch options.
- If a category such as dessert, soup or salad is absent,
  simply omit that category.
- Do not output placeholder dishes for missing categories.

OUTPUT FORMAT:
- Plain text only.
- No Markdown, bold formatting or asterisks.
- Use restaurant headings in uppercase, prefixed with 🏫.
- Start each meal line with an appropriate food emoji.
- One meal per line.
- Use + between the main dish, sides and sauces.
- Keep each line concise and mobile-friendly.
- Use one blank line between restaurants.
- No prices, allergen codes or dietary abbreviations.
- Do not repeat the date or title.
- No explanations or closing remarks.

FINAL CHECK BEFORE RESPONDING:
1. Check that every restaurant with today's menu is included.
2. Check that every main dish from the source is represented.
3. Check that vegetarian meals are included.
4. Check that soup, salad and dessert options are included when listed.
5. Check that all dish names are translated into English.
6. Check that the restaurant order is correct.

Return ONLY the complete formatted lunch menu.

Example:
🏫 SERVERI
🌱 Vegan nuggets + potatoes + yoghurt sauce
🍖 Frikadelles + rosemary sauce + potatoes
🥣 Pea soup + pancakes + jam

Return ONLY the formatted menu.`
      },
      {
        role: 'user',
        content: JSON.stringify(pages)
      }
    ]
  });

  console.log('Translation completed.');

  return `🍽️ SCHOOL LUNCH — ${date}\n\n${
    response.choices[0]?.message?.content?.trim()
    || 'No verified menu available.'
  }`;
}


async function run(client) {
  console.log('Starting menu job...');

  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday())) {
    console.log('Weekend detected. Skipping.');
    return;
  }

  const date = dateStr();
  const stateFile = new URL('./sent-state.json', import.meta.url);

  let state = {};

  try {
    state = JSON.parse(
      await fs.readFile(stateFile, 'utf8')
    );
  } catch {}

  if (!dryRun && state.lastSent === date) {
    console.log('Already sent today.');
    return;
  }

  const pages = await getPages();
  const msg = await makeMessage(pages);

  if (dryRun) {
    console.log('\n--- MENU PREVIEW ---\n');
    console.log(msg);
    return;
  }

  const id = process.env.WHATSAPP_GROUP_ID;

  if (!id || !id.endsWith('@g.us')) {
    throw new Error(
      'Configure WHATSAPP_GROUP_ID in .env first'
    );
  }

  console.log('Sending menu to WhatsApp...');

  await client.sendMessage(id, msg);

  await fs.writeFile(
    stateFile,
    JSON.stringify({
      lastSent: date,
      at: new Date().toISOString()
    }, null, 2)
  );

  console.log('Successfully sent menu:', date);
}

if (dryRun) {
  await run(null);

} else {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'vamk-lunch'
    }),

    puppeteer: {
      headless: false,
      executablePath:
        'C:\\Users\\Verttzzz\\.cache\\puppeteer\\chrome\\win64-154.0.8037.57\\chrome-win64\\chrome.exe',
      args: ['--no-sandbox'],
      timeout: 120000
    }
  });

  client.on('qr', qr => {
    console.log('Scan WhatsApp QR code:');
    qrcode.generate(qr, { small: true });
  });

  client.on('auth_failure', e => {
    console.error('WhatsApp auth failure:', e);
  });

  client.on('ready', async () => {
    console.log('WhatsApp connected.');

    if (listGroups) {
      const chats = await client.getChats();

      for (const c of chats.filter(c => c.isGroup)) {
        console.log(`${c.name} | ${c.id._serialized}`);
      }

      await client.destroy();
      process.exit(0);
    }

    
const sendOnStart = (process.env.SEND_ON_START || '')
  .trim()
  .toLowerCase() === 'true';

console.log('SEND_ON_START raw:', JSON.stringify(process.env.SEND_ON_START));
console.log('Immediate sending enabled:', sendOnStart);

if (sendOnStart) {
  console.log('Starting immediate send...');

  try {
    await run(client);
    console.log('Immediate send finished.');
  } catch (error) {
    console.error('Immediate send failed:', error);
  }
} else {
  console.log('Immediate send disabled. Waiting for 09:00.');
}

    cron.schedule(
      '0 9 * * 1-5',
      () => run(client).catch(console.error),
      { timezone: TZ }
    );

    console.log(
      'Scheduled weekdays 09:00 Europe/Helsinki. Keep process running.'
    );
  });

  await client.initialize();
}
