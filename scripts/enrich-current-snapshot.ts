import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Actress,
  type CurrentSnapshot,
  validateSnapshot,
} from '../src/lib/actresses';
import {
  createMinnanoAvEnricher,
  parseMinnanoAvProfile,
  searchMinnanoAv,
} from '../src/server/jav-crawler/minnano-av';

async function main() {
  const currentRaw = await readFile(
    join(process.cwd(), 'public/actress-cache/current.json'),
    'utf8',
  );
  const current = JSON.parse(currentRaw) as CurrentSnapshot;
  const snapshotFile = join(process.cwd(), 'public', current.snapshotPath);
  console.log(`Reading snapshot from: ${snapshotFile}`);

  const snapshotRaw = await readFile(snapshotFile, 'utf8');
  const snapshot = JSON.parse(snapshotRaw);

  console.log(`Loaded ${snapshot.actresses.length} actresses.`);
  const enricher = createMinnanoAvEnricher();

  let matched = 0;
  let skipped = 0;

  for (let i = 0; i < snapshot.actresses.length; i++) {
    const a = snapshot.actresses[i] as Actress;
    const term = a.nativeName || a.name;
    process.stdout.write(`[${i + 1}/${snapshot.actresses.length}] ${term}... `);

    if (a.minnanoAvUrl && a.ratings) {
      console.log(`✓ (already enriched)`);
      matched++;
      continue;
    }

    const lookup = await enricher.lookup({
      name: a.name,
      nativeName: a.nativeName,
      nameReading: a.nameReading,
      aliases: a.aliases,
    });

    if (lookup.kind === 'matched') {
      matched++;
      a.minnanoAvUrl = lookup.url;
      if (lookup.profile.ratings) {
        a.ratings = lookup.profile.ratings;
      }
      if (lookup.profile.tags && lookup.profile.tags.length > 0) {
        a.tags = lookup.profile.tags;
      }
      if (lookup.profile.debutYear) {
        a.debutYear = lookup.profile.debutYear;
      }
      console.log(
        `✓ (debut: ${a.debutYear ?? 'N/A'}, tags: ${a.tags?.length ?? 0}, overall: ${a.ratings?.overall ?? 'N/A'})`,
      );
    } else {
      skipped++;
      console.log(`✗ not found`);
    }

    // Periodically save progress to disk
    if ((i + 1) % 5 === 0 || i === snapshot.actresses.length - 1) {
      const validated = validateSnapshot(snapshot);
      if (validated) {
        await writeFile(snapshotFile, JSON.stringify(validated, null, 2), 'utf8');
      }
    }
  }

  console.log(
    `\nEnrichment complete! Matched: ${matched}, Skipped: ${skipped}`,
  );

  // Validate modified snapshot
  const validated = validateSnapshot(snapshot);
  if (!validated) {
    throw new Error('Snapshot validation failed after Minnano-AV enrichment!');
  }

  // Write back to file
  await writeFile(snapshotFile, JSON.stringify(validated, null, 2), 'utf8');
  console.log(`Successfully updated snapshot at ${snapshotFile}`);
}

main().catch((err) => {
  console.error('Fatal error in enrichment:', err);
  process.exit(1);
});
