# Playlist Porter

### Move Spotify and TIDAL playlists privately—from a real desktop app.

Playlist Porter is a free, open-source playlist transfer app for macOS and Windows. It runs entirely on your computer, connects directly to Spotify and TIDAL through their official APIs, and gives you control over uncertain track matches before anything is created.

No subscription. No hosted account. No tracking. No audio copying.

> [!NOTE]
> Playlist Porter is independent community software and is not affiliated with, endorsed by, or sponsored by Spotify or TIDAL.

## Download

Open the [latest GitHub release](https://github.com/ReVG08/playlist-porter/releases/latest) and choose:

- **macOS Apple Silicon:** `Playlist-Porter-…-mac-arm64.dmg`
- **macOS Intel:** `Playlist-Porter-…-mac-x64.dmg`
- **Windows installer:** `Playlist-Porter-…-Windows-x64-Setup.exe`
- **Windows portable:** `Playlist-Porter-…-Windows-x64-Portable.exe`

On macOS, open the DMG and drag Playlist Porter into Applications. On Windows, run the installer or use the portable executable without installing.

Current community builds are unsigned unless the release notes say otherwise. macOS Gatekeeper or Windows SmartScreen may therefore show a warning. The source and reproducible release workflow are public so builds can be audited. Code-signing certificates can be added without changing the app.

## First-time setup

Spotify and TIDAL require every API client to identify itself. Playlist Porter includes a friendly one-time setup screen, but you still need free developer app registrations:

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Register `http://127.0.0.1:8787/auth/spotify/callback` as its redirect URL.
3. Create an app in the [TIDAL Developer Dashboard](https://developer.tidal.com/dashboard).
4. Register `http://127.0.0.1:8787/auth/tidal/callback` as its redirect URL and enable playlist, search, and user scopes.
5. Open Playlist Porter → **Settings**, paste both Client IDs, and connect your accounts.

No client secret is required. OAuth uses PKCE, the standard intended for installed applications.

> [!IMPORTANT]
> API access is controlled by the music services. Spotify development-mode apps currently require the app owner to have Premium and support up to five allowlisted users. TIDAL marks the required playlist/search permissions as third-party access. These upstream account and approval rules can change and are not bypassed by Playlist Porter.

## The experience

1. Connect Spotify and TIDAL in the desktop app.
2. Choose which service you are moving from.
3. Pick one of your playlists.
4. Playlist Porter searches the destination catalog and prepares a match review.
5. Accept, change, or skip uncertain matches.
6. Transfer. The destination playlist is created in the same order as the original.

Large playlists may take a little longer because Playlist Porter deliberately respects API limits.

## Step-by-step tutorial

### 1. Install and open the app

On macOS, open the downloaded DMG, drag **Playlist Porter** to **Applications**, and launch it there. On Windows, run the Setup executable and follow the prompts, or open the Portable executable directly.

Unsigned community builds can trigger an operating-system reputation warning. Confirm that the file came from this repository's Releases page and compare its filename with the release notes before opening it.

### 2. Create the two developer apps

Open **Settings** in Playlist Porter. Keep the callback URLs shown there handy while creating apps in the Spotify and TIDAL developer dashboards. A Client ID identifies the local app; it is not your password. Do not paste a client secret into Playlist Porter.

For Spotify, add this exact redirect URL:

```text
http://127.0.0.1:8787/auth/spotify/callback
```

For TIDAL, add this exact redirect URL and enable `playlists.read`, `playlists.write`, `search.read`, and `user.read`:

```text
http://127.0.0.1:8787/auth/tidal/callback
```

Paste each Client ID into Playlist Porter and select **Save on this computer**.

### 3. Connect Spotify and TIDAL

Select **Connect** beside Spotify. Your default browser opens Spotify's real authorization page; check the address before signing in. Approve the playlist permissions and return to Playlist Porter. Repeat for TIDAL. The cards in the app change to **Connected locally**.

Playlist Porter never receives your service passwords. The service gives it a limited OAuth token, which is encrypted locally and can be removed with **Disconnect**.

### 4. Choose the transfer direction

Select Spotify on the left to move Spotify → TIDAL, or select TIDAL and use the swap control to move TIDAL → Spotify. Then choose a playlist from the menu. The displayed track count comes from the source service.

### 5. Scan and review matches

Select **Scan & match tracks**. Each source track receives one of four labels:

- **Exact:** the services reported the same ISRC.
- **High:** metadata strongly agrees and the winner is safely ahead.
- **Review:** two or more plausible versions need your decision.
- **Missing:** no reliable catalog result was found.

Use the candidate menu on any row to choose a different recording. Select **Skip this track** for songs you do not want transferred. Pay particular attention to live, remastered, clean/explicit, radio-edit, and deluxe-edition variants.

### 6. Transfer and verify

Select **Transfer**. Playlist Porter creates one new private/unlisted destination playlist and appends the chosen tracks in their original order. The completion screen reports added and skipped totals and links to the finished playlist. Open it in the destination service and spot-check any manually reviewed versions.

### Troubleshooting

- **“Client ID needed”:** open Settings and paste the correct public Client ID.
- **OAuth redirect rejected:** the dashboard callback must match exactly, including `http`, `127.0.0.1`, port `8787`, service name, and path.
- **403 or permission error:** reconnect after enabling the documented scopes; for Spotify development mode, ensure the user is on the app allowlist and meets Spotify's current account requirements.
- **Rate-limit message:** wait briefly and retry. Playlist Porter already honors `Retry-After` and uses bounded backoff.
- **The app will not start:** another process may be using local port `8787`. Close other Playlist Porter instances and try again.
- **A match looks wrong:** choose another candidate or skip it. Catalog availability and editions differ by country and service.

The in-app **How to use** button provides a compact version of this tutorial at any time.

## Matching quality

Playlist Porter uses deterministic, explainable matching—never an opaque hosted model:

1. **ISRC first.** An identical International Standard Recording Code is treated as exact.
2. **Catalog fallback.** If ISRC produces no exact result, it searches title and primary artist.
3. **Metadata scoring.** Candidates are ranked by normalized title (46%), artist (34%), album (10%), and duration (10%).
4. **Human review.** Only a strong winner with a safe margin is preselected. Ambiguous or missing tracks stay visible for review.

The normalizer handles case, punctuation, diacritics, feature credits, and common edition terms such as “remastered” and “deluxe.” Duplicate tracks remain duplicates, and selected tracks are written in source order.

## Privacy and security

“Local-first” is an architectural property here, not a marketing label:

- The desktop UI and local API run on `127.0.0.1`; they are not exposed to the network.
- OAuth opens the real Spotify or TIDAL sign-in page in your default browser.
- Access and refresh tokens are encrypted with AES-256-GCM before being stored in the app data directory.
- The encryption key and token files use owner-only permissions where the operating system supports them.
- Transfer plans exist in memory only and disappear when the app closes.
- There is no Playlist Porter cloud service, user database, telemetry, advertising, or analytics.
- The app never downloads, streams, proxies, modifies, or caches audio.
- Music metadata is used only long enough to complete the transfer and is not used to train AI.
- The Electron renderer is sandboxed and isolated, has no Node.js access, denies permissions, and blocks navigation to unapproved hosts.

Someone already able to run software as your operating-system user may still access local application data. Playlist Porter does not claim to defend a compromised computer.

## Supported operations

- Spotify → TIDAL and TIDAL → Spotify
- Private/unlisted destination playlists
- Full pagination on playlist lists and playlist contents
- Automatic token refresh
- Batched writes (100 Spotify items, 50 TIDAL items)
- `Retry-After` handling and exponential backoff for transient failures
- TIDAL idempotency keys for safe write retries
- Clear authentication, permission, quota, and service errors

## Build from source

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/ReVG08/playlist-porter.git
cd playlist-porter
npm ci
npm run desktop:dev
```

The desktop window contains the complete setup and transfer experience. For browser-based development, use `npm run dev` and open `http://127.0.0.1:5173`.

### Package installers

```bash
# Current macOS machine
npm run desktop:mac

# Windows (best run on Windows)
npm run desktop:win
```

Outputs are written to `release/`. Tagged versions are built natively on macOS and Windows by [the release workflow](.github/workflows/release.yml), then attached to a GitHub Release:

```bash
npm version minor
git push origin main --follow-tags
```

Repository maintainers can optionally add `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, and `WIN_CSC_KEY_PASSWORD` secrets for trusted code signing. Never commit certificates or passwords.

## Development quality checks

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run desktop:package
```

Tests cover normalization, ISRC priority, metadata scoring, ambiguous results, ordered transfers, skips, and reviewed-selection validation.

## Architecture

```text
src/client/      React desktop interface
src/core/        service-neutral matching and transfer rules
src/server/      loopback API, OAuth, token vault, provider adapters
src/desktop/     hardened Electron shell and OS integration
tests/           deterministic core tests
```

The small `MusicService` interface isolates Spotify and TIDAL response formats from the transfer engine. The desktop shell starts the loopback server, displays only the bundled local UI, and hands approved OAuth links to the system browser.

## Official API references

- [Spotify authorization and PKCE](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Spotify playlists](https://developer.spotify.com/documentation/web-api/concepts/playlists)
- [Spotify rate limits](https://developer.spotify.com/documentation/web-api/concepts/rate-limits)
- [TIDAL OAuth 2.1 authorization](https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization)
- [TIDAL Web API reference](https://tidal-music.github.io/tidal-api-reference/)
- [TIDAL developer guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-developer-guidelines)

The adapters use Spotify's current `/me/playlists` and `/playlists/{id}/items` endpoints and TIDAL's official v2 JSON:API endpoints. Unofficial APIs, scraping, session-cookie extraction, and reverse-engineered playback endpoints are intentionally out of scope.

## Contributing

Bug reports and pull requests are welcome. Please preserve the privacy model and use only official, documented service APIs. Changes that add telemetry, audio downloading, scraping, or private endpoints will not be accepted.

## License

Playlist Porter is fully open source under the permissive [MIT License](LICENSE). You may use, study, modify, and redistribute it under the license terms.
