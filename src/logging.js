import { appendFileSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export function createLogging(directory) {
  mkdirSync(directory, { recursive: true });

  // Keep operational events and per-run artifacts outside the source tree's tracked files.
  function log(event, details = {}) {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...details });
    const key = process.env.OPENAI_API_KEY;
    const safeLine = key ? line.replaceAll(key, '[REDACTED]') : line;
    console.log(safeLine);
    appendFileSync(join(directory, 'bot.jsonl'), safeLine + '\n', 'utf8');
  }

  function artifacts(date, kind) {
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    const prefix = join(directory, `${date}-${kind}-${timestamp}-${randomUUID()}`);
    return {
      raw: data => writeFile(`${prefix}-raw.json`, JSON.stringify(data, null, 2), 'utf8'),
      message: body => writeFile(`${prefix}-message.txt`, body + '\n', 'utf8')
    };
  }
  return { log, artifacts };
}
