// Manual helper (§3.2): verify a member's Tekken ID against tknow. tknow has no
// name search, so members grab their Tekken ID from their profile URL
// (https://www.tknow.gg/player/<tekkenId>); this confirms it resolves and prints
// the display name + per-character ranks so the right id lands in players.json.
// Run:  npm run resolve-id -- "3fee-J699-M7An"
import { loadConfig } from '../shared/config';
import { getPlayerInfo } from './tknow';
import { characterDisplayName } from '@/data/characters';

async function main() {
  const tekkenId = process.argv.slice(2).join(' ').trim();
  if (!tekkenId) {
    console.error('usage: npm run resolve-id -- "<tekken_id>"');
    process.exit(2);
  }
  const config = loadConfig();
  const headers = {
    'User-Agent': config.tknow.userAgent,
    Origin: config.sources.tknowOrigin,
    Referer: `${config.sources.tknowOrigin}/`,
    Accept: 'application/json',
  };
  const info = await getPlayerInfo(tekkenId, config.sources.tknowBaseUrl, headers);
  if (!info.ok) {
    console.log(`Could not reach tknow for "${tekkenId}" — try again later.`);
    return;
  }
  if (!info.name && info.characters.length === 0) {
    console.log(`No player found for "${tekkenId}" — check the id.`);
    return;
  }
  console.log(`${tekkenId}\t${info.name ?? '(unknown)'}\t${info.characters.length} characters`);
  for (const c of info.characters) {
    console.log(
      `  ${characterDisplayName(c.character)} — ${c.rank ?? 'unranked'} (${c.rankedGames} ranked)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
