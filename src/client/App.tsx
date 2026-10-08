import { useEffect, useMemo, useState } from 'react';
import type { PlaylistSummary, Service, TransferPlan } from '../core/types';
import { api, type Status } from './api';

const serviceName = (service: Service) => service === 'spotify' ? 'Spotify' : 'TIDAL';

export function App() {
  const [status, setStatus] = useState<Status>();
  const [source, setSource] = useState<Service>('spotify');
  const target: Service = source === 'spotify' ? 'tidal' : 'spotify';
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [playlistId, setPlaylistId] = useState('');
  const [plan, setPlan] = useState<TransferPlan>();
  const [selections, setSelections] = useState<Record<number, string | null>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ playlist: PlaylistSummary; added: number; skipped: number }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [tidalClientId, setTidalClientId] = useState('');
  const sourceConnected = status?.[source].connected;

  const refreshStatus = () => api.status().then(setStatus).catch((e) => setError(e.message));
  useEffect(() => {
    void refreshStatus();
    const onFocus = () => void refreshStatus();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(refreshStatus, 3000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, []);
  useEffect(() => { if (status && !status.spotify.configured && !status.tidal.configured) setSettingsOpen(true); }, [status]);
  useEffect(() => {
    setPlan(undefined); setDone(undefined); setPlaylistId(''); setPlaylists([]);
    if (!sourceConnected) return;
    setBusy('Loading your playlists…'); setError('');
    api.playlists(source).then(setPlaylists).catch((e) => setError(e.message)).finally(() => setBusy(''));
  }, [source, sourceConnected]);

  const chosen = useMemo(() => plan?.matches.filter((match, index) => (selections[index] === undefined ? match.selectedId : selections[index])).length ?? 0, [plan, selections]);

  async function scan() {
    if (!playlistId) return;
    setBusy('Matching every track…'); setError(''); setDone(undefined);
    try {
      const next = await api.plan(source, target, playlistId);
      setPlan(next); setSelections({});
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }

  async function transfer() {
    if (!plan) return;
    setBusy(`Creating your playlist on ${serviceName(target)}…`); setError('');
    try { setDone(await api.execute(plan.id, selections)); setPlan(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }

  async function openSettings() {
    try {
      const values = await api.getSettings();
      setSpotifyClientId(values.spotifyClientId); setTidalClientId(values.tidalClientId); setSettingsOpen(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function saveSettings() {
    setBusy('Saving API setup…'); setError('');
    try { await api.settings(spotifyClientId, tidalClientId); setSettingsOpen(false); await refreshStatus(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }

  return <main>
    <nav><div className="mark">P</div><strong>Playlist Porter</strong><span>Local-first · Source available</span><button className="settings-button" onClick={() => setHelpOpen(true)}>How to use</button><button className="settings-button" onClick={openSettings} aria-label="API settings">Settings</button></nav>
    <header>
      <p className="eyebrow">YOUR MUSIC, YOUR MOVE</p>
      <h1>Carry every song.<br/><em>Leave nothing behind.</em></h1>
      <p className="lede">Transfer playlists between Spotify and TIDAL from your own computer. No account, no cloud database, no audio access.</p>
    </header>

    <section className="connections">
      {(['spotify', 'tidal'] as Service[]).map((service) => <div className="connection" key={service}>
        <div className={`service-icon ${service}`}>{service === 'spotify' ? '●' : 'T'}</div>
        <div><strong>{serviceName(service)}</strong><small>{status?.[service].connected ? 'Connected locally' : status?.[service].configured ? 'Ready to connect' : 'Client ID needed'}</small></div>
        {status?.[service].connected
          ? <button className="text-button" onClick={async () => { await api.disconnect(service); refreshStatus(); }}>Disconnect</button>
          : status?.[service].configured
            ? <a className="button small" href={`/auth/${service}/start`}>Connect</a>
            : <button className="button small" onClick={openSettings}>Set up</button>}
      </div>)}
    </section>

    <section className="workspace">
      <div className="steps"><span className="active">1 <b>Choose</b></span><i/><span className={plan ? 'active' : ''}>2 <b>Review</b></span><i/><span className={done ? 'active' : ''}>3 <b>Transfer</b></span></div>
      {!plan && !done && <div className="chooser">
        <label>Moving from</label>
        <div className="direction">
          <button className={source === 'spotify' ? 'selected' : ''} onClick={() => setSource('spotify')}>Spotify</button>
          <button className="swap" aria-label="Swap direction" onClick={() => setSource(target)}>⇄</button>
          <button className={source === 'tidal' ? 'selected' : ''} onClick={() => setSource('tidal')}>TIDAL</button>
        </div>
        <label htmlFor="playlist">Playlist</label>
        <select id="playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} disabled={!status?.[source].connected}>
          <option value="">{status?.[source].connected ? 'Choose one of your playlists…' : `Connect ${serviceName(source)} first`}</option>
          {playlists.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trackCount} tracks</option>)}
        </select>
        <button className="button primary" disabled={!playlistId || !status?.[target].connected || Boolean(busy)} onClick={scan}>Scan & match tracks <span>→</span></button>
        {!status?.[target].connected && <p className="hint">Connect {serviceName(target)} to search its catalog.</p>}
      </div>}

      {plan && <div className="review">
        <div className="review-head"><div><p className="eyebrow">MATCH REVIEW</p><h2>{plan.sourcePlaylist.name}</h2><p>{chosen} of {plan.matches.length} tracks ready</p></div><button className="text-button" onClick={() => setPlan(undefined)}>Start over</button></div>
        <div className="match-list">{plan.matches.map((match, index) => {
          const value = selections[index] === undefined ? match.selectedId ?? '' : selections[index] ?? '';
          return <div className="match" key={`${match.source.id}-${index}`}>
            <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="source-track"><strong>{match.source.title}</strong><small>{match.source.artists.join(', ')} · {match.source.album}</small></div>
            <span className={`badge ${match.confidence}`}>{match.confidence}</span>
            <select aria-label={`Match for ${match.source.title}`} value={value} onChange={(e) => setSelections((old) => ({ ...old, [index]: e.target.value || null }))}>
              <option value="">Skip this track</option>
              {match.candidates.map((c) => <option key={c.track.id} value={c.track.id}>{Math.round(c.score * 100)}% · {c.track.title} — {c.track.artists.join(', ')}</option>)}
            </select>
          </div>;
        })}</div>
        <div className="review-footer"><p>Order will be preserved. Skipped tracks are reported.</p><button className="button primary" disabled={!chosen || Boolean(busy)} onClick={transfer}>Transfer {chosen} tracks <span>→</span></button></div>
      </div>}

      {done && <div className="success"><div className="success-icon">✓</div><p className="eyebrow">TRANSFER COMPLETE</p><h2>{done.playlist.name}</h2><p>{done.added} tracks added{done.skipped ? ` · ${done.skipped} skipped` : ''}.</p>{done.playlist.url && <a className="button primary" href={done.playlist.url} target="_blank" rel="noreferrer">Open in {serviceName(done.playlist.service)} ↗</a>}<button className="text-button" onClick={() => setDone(undefined)}>Move another playlist</button></div>}
      {busy && <div className="busy"><span/><p>{busy}</p><small>Large playlists can take a few minutes because API limits are respected.</small></div>}
      {error && <div className="error"><strong>Something needs attention</strong><p>{error}</p><button onClick={() => setError('')}>Dismiss</button></div>}
    </section>

    <section id="setup" className="privacy"><div><p className="eyebrow">PRIVACY BY ARCHITECTURE</p><h2>Your playlists never pass through our servers.</h2></div><p>Credentials and OAuth tokens stay on this machine. Playlist metadata is held only while you review a transfer. Playlist Porter never downloads, stores, or proxies audio.</p></section>
    <footer><span>Playlist Porter</span><span>Built for listeners, not data collection.</span></footer>
    {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-close" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
        <p className="eyebrow">ONE-TIME SETUP</p><h2 id="settings-title">Connect your developer apps</h2>
        <p className="modal-copy">Paste the public Client ID from each developer dashboard. No client secret is needed. These values stay on this computer.</p>
        <label htmlFor="spotify-id">Spotify Client ID</label><input id="spotify-id" value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} placeholder="From developer.spotify.com/dashboard" autoComplete="off" />
        <label htmlFor="tidal-id">TIDAL Client ID</label><input id="tidal-id" value={tidalClientId} onChange={(e) => setTidalClientId(e.target.value)} placeholder="From developer.tidal.com/dashboard" autoComplete="off" />
        <details><summary>Callback URLs to register</summary><code>http://127.0.0.1:8787/auth/spotify/callback</code><code>http://127.0.0.1:8787/auth/tidal/callback</code></details>
        <button className="button primary" disabled={!spotifyClientId.trim() && !tidalClientId.trim()} onClick={saveSettings}>Save on this computer</button>
      </section>
    </div>}
    {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
      <section className="modal tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <button className="modal-close" aria-label="Close tutorial" onClick={() => setHelpOpen(false)}>×</button>
        <p className="eyebrow">QUICK TUTORIAL</p><h2 id="tutorial-title">Move a playlist in four steps</h2>
        <ol className="tutorial-steps">
          <li><b>Set up once</b><span>Open Settings, paste the public Client IDs from your Spotify and TIDAL developer apps, then save.</span></li>
          <li><b>Connect both accounts</b><span>Select Connect for each service. Sign in only on the official service page that opens in your browser.</span></li>
          <li><b>Choose and review</b><span>Pick the source service and playlist. Check amber or red matches; choose another candidate or skip anything uncertain.</span></li>
          <li><b>Transfer</b><span>A new private or unlisted playlist is created in the destination service, in the original order.</span></li>
        </ol>
        <div className="tutorial-note"><b>Good to know</b><span>No audio is copied. Closing the app clears unfinished transfer plans, while encrypted sign-in tokens remain local until you disconnect.</span></div>
        <button className="button primary" onClick={() => setHelpOpen(false)}>Got it—let’s move music</button>
      </section>
    </div>}
  </main>;
}
