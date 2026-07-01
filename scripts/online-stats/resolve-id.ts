// Manual helper (§3.2): verify a member's Tekken ID against EWGF. The public API
// has no name search, so members grab their Tekken ID from their ewgf.gg profile
// URL (https://ewgf.gg/player/<tekkenId>); this confirms it resolves and prints
// the display name + characters seen so the right id lands in players.json. Run:
//   EWGF_API_KEY=… npm run resolve-id -- "3fee-J699-M7An"
import { loadConfig } from '../shared/config';
import { getPlayer } from './ewgf';
import { characterDisplayName } from '@/data/characters';

async function main() {
  const tekkenId = process.argv.slice(2).join(' ').trim();
  if (!tekkenId) {
    console.error('usage: npm run resolve-id -- "<tekken_id>"');
    process.exit(2);
  }
  const apiKey = process.env.EWGF_API_KEY ?? '';
  if (!apiKey) {
    console.error('EWGF_API_KEY is required (the EWGF API is gated).');
    process.exit(2);
  }
  const config = loadConfig();
  const { characters, battles } = await getPlayer(
    tekkenId,
    apiKey,
    config.sources.ewgfBaseUrl,
    config.sources.ewgfBattlesPath,
  );
  if (!battles.length) {
    console.log(`No battles found for "${tekkenId}" — check the id.`);
    return;
  }
  const undashed = tekkenId.replaceAll('-', '');
  const self = battles.find(
    (b) =>
      b.p1_tekken_id.replaceAll('-', '') === undashed ||
      b.p2_tekken_id.replaceAll('-', '') === undashed,
  );
  const name =
    self?.p1_tekken_id.replaceAll('-', '') === undashed
      ? self?.p1_name
      : self?.p2_name;
  console.log(`${tekkenId}\t${name ?? '(unknown)'}\t${battles.length} recent battles`);
  for (const c of characters) {
    console.log(
      `  ${characterDisplayName(c.character)} — ${c.rank ?? 'unranked'} (${c.rankedGames} ranked)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
