import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// An exclusive, permanent claim prevents duplicate sends even across processes.
// Keep the claim if WhatsApp's acknowledgement or the sent record is lost.
export function deliveryState(directory, legacyPath, productionGroup) {
  const prefix = (date, group) => join(directory,
    `${date}-${createHash('sha256').update(group).digest('hex')}`);

  return {
    async status(date, group) {
      const base = prefix(date, group);
      if (await readState(`${base}.sent.json`)) return 'sent';
      if (group === productionGroup && (await readState(legacyPath))?.lastSent === date) return 'sent';
      if (await readState(`${base}.claim.json`)) return 'pending';
      return null;
    },
    async claim(date, group) {
      await mkdir(directory, { recursive: true });
      try {
        await writeFile(`${prefix(date, group)}.claim.json`,
          JSON.stringify({ date, at: new Date().toISOString() }), { flag: 'wx' });
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
      }
    },
    async sent(date, group) {
      await writeFile(`${prefix(date, group)}.sent.json`,
        JSON.stringify({ date, at: new Date().toISOString() }), { flag: 'wx' });
    }
  };
}
