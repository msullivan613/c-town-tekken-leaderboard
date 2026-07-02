import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { config } from '@/config';
import { DataProvider } from '@/data/DataProvider';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { PlayerProfilePage } from '@/pages/PlayerProfilePage';
import { HeadToHeadPage } from '@/pages/HeadToHeadPage';
import { MatchesPage } from '@/pages/MatchesPage';
import { NotFound } from '@/pages/NotFound';

const NAV = [
  { to: '/', label: 'Leaderboard', end: true },
  { to: '/h2h', label: 'Head-to-head', end: false },
  { to: '/matches', label: 'Matches', end: false },
];

// Stylize the group name into logo parts: split on the first hyphen/space and
// render the pieces around a colored dot (e.g. "C-Town" -> C · TOWN).
const BRAND_PARTS = config.site.name.toUpperCase().split(/[-\s]+/);

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-6">
          <NavLink
            to="/"
            className="group flex items-baseline gap-1 !text-fg hover:!text-fg"
          >
            {BRAND_PARTS.map((part, i) => (
              <span key={i} className="flex items-baseline gap-1">
                {i > 0 && (
                  <span
                    className="font-display text-xl font-bold tracking-[0.15em] sm:text-2xl sm:tracking-widest"
                    style={{ color: 'rgb(var(--p1))' }}
                  >
                    ·
                  </span>
                )}
                <span className="font-display text-xl font-bold tracking-[0.15em] sm:text-2xl sm:tracking-widest">
                  {part}
                </span>
              </span>
            ))}
          </NavLink>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:gap-5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `eyebrow whitespace-nowrap pb-0.5 tracking-[0.14em] sm:tracking-[0.22em] ${
                    isActive
                      ? '!text-fg [box-shadow:inset_0_-2px_0_rgb(var(--p2))]'
                      : 'hover:!text-fg'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-muted">
        <span className="eyebrow">{config.site.name}</span> · self-updating · $0 · reads
        committed JSON only.
      </footer>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <DataProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<LeaderboardPage />} />
            <Route path="/player/:id" element={<PlayerProfilePage />} />
            <Route path="/h2h" element={<HeadToHeadPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </DataProvider>
    </HashRouter>
  );
}
