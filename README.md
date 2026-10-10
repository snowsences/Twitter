# Twitter

A static, installable Twitter replay reader. Firebase syncs your account’s archives and playback state across devices; IndexedDB keeps a local cache. Cloudinary hosts imported image files through an authenticated Cloudflare Worker. Import X Profile Archive JSON exports or its image ZIPs, then choose Start replay. Posts and reposts from all imported accounts share the feed, with their original historical relationships preserved on one timeline.

## Playback rules

- Shared historical timeline is the default. Its origin is the earliest imported calendar day, or a later date selected before starting. Profiles appear and finish at their original offsets from that common date.
- Posts before a chosen later starting date are excluded from playback. Later imports use the existing fixed origin; they never shift an active timeline.
- The earliest post (including ties) appears when playback starts if starting at the beginning. All other posts, including other profiles’ first posts, preserve their original clock times.
- Optional Everyone starts together mode retains the previous per-profile relative schedule. Existing clocks stay unchanged until an explicitly confirmed Reset; new starts and Reset default to the historical mode.
- Other posts use their original clock time in the replay timezone (fixed when importing/starting).
- Original calendar-day offsets are mapped to replay days. Default 1x preserves day spacing. Speed compresses day spacing, not hours/minutes.
- Other posts mapped to day zero whose clock times have already passed wait for that time the following day.
- Speed changes take effect at the next midnight, preserving already-published posts. A change creates a new speed segment without restarting or rescheduling past segments.
- The clock continues while closed. Future posts stay hidden in the feed, search, bookmarks and profile counts.
- There is no Pause or Resume. Reset requires typing RESET TWITTER and explicitly confirming; it retains archives, images and bookmarks.
- Actual repost times are absent from extension exports. Repost playback uses the original post date and is labeled approximate in Settings and post details.
- At a DST clock gap, a post uses the next valid wall time. Repeated DST hours use one deterministic occurrence.

The app normalizes neither original gaps nor total archive duration. Do those edits in individual JSONs before importing if desired. Later imports keep the running replay origin fixed. In Everyone starts together mode, each existing account also keeps its original baseline.

## Muted terms

Settings → Muted terms lets you add, edit or remove words and phrases without changing archive files. Each rule applies to everyone or selected imported profiles. Matching is case-insensitive, uses whole words, and includes quoted text. Matching posts disappear immediately from Home, profile views, search and bookmarks, and future matching posts remain hidden. Repost rules apply to the importing/reposting profile. Removing a rule makes its posts eligible again; the original archive records are retained. Rules sync between devices and are included in backups.

## Imports, local images and backup

JSON and ZIP imports support multiple files in one action. Incoming data is validated before any writes. Posts are keyed by archive profile plus post ID, so the same original post reposted by different accounts remains attributed to each. Re-importing merges duplicate records and retains fuller text and saved media. ZIP assets use separate per-import namespaces. Avatars are collected only for imported primary profiles; unknown original authors use initials.

ZIPs must contain archive.json and optional referenced images, either at the top level or inside a wrapping folder. Image paths resolve relative to that JSON; macOS metadata files are ignored. ZIPs with multiple archive/backup manifests must be imported as separate profile ZIPs. Missing images fall back to remote URLs when available. Videos show archived posters and a link to the original post. No credentials or hidden X API are used. Imported archives upload to your private Firestore data; image bytes upload to your Cloudinary environment after owner authorization.

Export backup packages profiles, posts, bookmarks, muted terms, clock history, local image bytes and cloud links. It does not download the complete Cloudinary library. Keep original extension ZIPs as media backups. Restore replaces this device’s data after typing RESTORE TWITTER and queues cloud sync. Other cloud profiles are retained. See SETUP.md for the deployed cloud configuration.

## Development and hosting

The deployed static files are in docs/. This repository is ready for GitHub Pages: in Settings → Pages, choose Deploy from a branch, main, and /docs, then Save. The app URL will be https://snowsences.github.io/Twitter/. The static app can also be served from another HTTPS static host. No application server or build step is required. fflate is bundled locally for ZIP reading/writing. Its MIT license is included.

Run `npm test` for scheduler, import, ZIP, storage and sync checks. The managed environment had no supported browser-QA skill, so full Chrome install/offline rendering and visual device QA were not available. DOM-based checks cover the main UI and confirmation flows; they do not replace live browser validation.

## Moving from the original app

Browser storage belongs to each site address. Export a full backup from the original app, then restore it in the GitHub Pages app to carry over imports, images, replay progress, bookmarks and muted terms.

## Cloud activation

The Worker and Firestore rules have been published through their dashboards; see [SETUP.md](SETUP.md) for the active configuration. The Firebase web configuration is public configuration; Cloudinary credentials are Worker secrets. The Worker and database rules restrict access to allenkevinc@gmail.com. Cloudinary media uses URL-accessible delivery. Uploaded local originals are released to save space, with a bounded cache for recently viewed cloud images.

## Likes

Tap a tweet’s heart to like it. The heart fills red, and the tweet appears in the Likes tab. Tap again to remove it. Likes sync across devices and are included in backups. Existing saved bookmarks appear as likes. Likes respect muted terms and replay timing. The existing bookmarks storage field is retained for compatibility; captured X like counts are unchanged.

## Share as image

Each tweet has a Share button. It generates a PNG preview containing the author, text, repost attribution, photos/video posters, quoted content, and original/replay dates. Tap Share image to open the operating system’s file-sharing sheet where supported; Save image downloads the PNG on other browsers. Preparing a preview before the final Share tap preserves the user gesture required by mobile browsers. Long posts are split into multiple images without truncating text. Unavailable or CORS-blocked images are clearly marked in the preview. Image generation happens on the device and does not require Worker or Firestore changes.

Profiles shows each archive’s original history length and date range, posts played / total, progress percentage, run number, and expected appearance/finish dates at the selected day speed. Upcoming profiles show “Appears in …”; archives entirely before a chosen starting date are marked finished. Progress excludes skipped records and states their count separately. Counts include muted posts. Finished profiles have a Restart button: that account begins again immediately, while other accounts retain their schedules. Posting clock times remain intact and all runs follow the global day speed. Restarting replaces that account’s current timeline; Likes stay saved and available. Restarts sync inside the playback clock and are included in backups. Global Reset clears all individual restarts.

## Align active periods

Start replay or Settings → Reset playback → Align active periods proposes account shifts from monthly activity. Choose a maximum shift of 1, 2, 3 (default), 5, or 10 years. A bounded coordinate search compares log-scaled posting counts in 30-day buckets, normalizes each account’s activity, keeps a median activity-center account fixed, and penalizes unnecessary movement. This is a heuristic suggestion, not a guarantee of a perfectly balanced feed. All imported records, including muted posts, are used.

The preview shows original/adjusted date ranges, every shift, history span, and average/peak active account counts. Shifts are whole multiples of 30 days; each account keeps its duration, gaps, post order, and posting clock times. Historical events across accounts may no longer coincide. You can choose a later date within the adjusted timeline, which excludes earlier adjusted records. Reset still requires typing RESET TWITTER. Archives remain unchanged. Applied shifts sync and survive backups; later imports keep the saved shift for existing accounts and use zero shift for new accounts until another reset/recalculation. Individual profile restarts play that archive from its beginning at the current day speed.

## Timeline overview

Before playback begins, Home shows the complete imported timeline with one bar per profile. Start replay and Reset playback include the same chart, updating for historical, aligned activity, and everyone-starts-together modes. A starting-date marker separates included time from faded skipped time. Historical charts use calendar dates; everyone-starts-together uses elapsed years. Bars cover each archive’s first-to-last dated post, including reposts and muted posts; they do not imply continuous posting. The chart only previews metadata and never starts or resets playback by itself.

Playback sync compares nested field values independently of object key order, because Firebase can reorder maps. A conflict message indicates a difference between local and cloud playback, not proof of a separate device. For actual conflicts, Settings → Use cloud playback discards only the pending playback edit and adopts the cloud clock; imports and other pending changes remain queued.

## Sync progress

Sync progress stays in Settings; reading screens never receive a layout-shifting sync banner. It distinguishes active sync, queued work, offline waiting, stopped errors, and completed uploads. It shows the current profile, profile position in the sync batch, image preparation/upload progress, tweet batches, and remaining profile/settings counts. Already uploaded images count as ready when resuming. An upload error exposes Retry sync; image requests time out after 60 seconds instead of waiting indefinitely. Status updates refresh the panel without rebuilding Settings inputs on every image.

## Captured repost event dates

New scraper exports can include reposted_at. When available, replay and timeline placement use that timestamp while created_at retains the original author’s posting date. Missing event dates retain approximate original-post timing. Settings reports both counts; post details identify the timing source. Reimporting merges by existing profile/post key, preserves images, and retains captured event timing if a later import lacks it. A running clock remains fixed; review Reset playback to recompute the timeline after correcting an existing archive. Existing bookmarks and source tweet dates remain intact.

### Delete and replace an import

In Settings → Your archives, choose **Delete import** beside a profile and confirm. This removes the merged profile archive locally and publishes a deletion marker to signed-in devices. Connect and sign in first; wait for an active upload to finish. Import a replacement ZIP afterward. Other profiles, playback and saved likes are preserved. Original ZIP files and already-hosted Cloudinary images are not deleted.


Playable `media` entries with `type: "video"` and a direct HTTP(S) MP4 `url` use native inline video controls. Videos load on demand (`preload="none"`), never autoplay, and pause other players when started. Poster images retain existing import/cloud handling. Direct videos stream from their existing host without a Cloudinary upload and are not included in offline caching. Thumbnail-only entries retain the original-post fallback. Expired/unavailable links show a playback error.

The document uses a no-referrer policy: X’s video CDN can reject playback requests carrying the GitHub Pages origin. Direct MP4 playback uses anonymous requests without an X login.


Motion uses native Web Animations with no additional dependencies: tactile button presses, heart feedback, dialog/backdrop transitions, thumbnail-to-viewer photo motion, incremental feed entrances/removals, toast transitions, and sync details inside Settings. Tab switches do not translate the reading surface, and routine sync does not insert banners above the feed. Unchanged tweet/video elements are retained during feed refreshes; pending new tweets stay behind the new-post button. Virtual feed rows swap without entrance animations. Device Reduce Motion disables movement, and missing animation APIs fall back to immediate actions.

Feed bylines always show the original post date and time (for example, `Dec 4 2026 7:05pm`) in the replay timezone, including reposts. Replay dates remain in post details. Playback speed is available only in Settings.


## Reader improvements (v21)

- The feed mounts a measured window of cards with spacer heights, retains unchanged tweet/video nodes, and maintains scroll anchors when loading older posts. Media frames reserve their space before loading. Next-post timers replace per-second polling.
- Image asset reads start near the viewport. Feed images use small Cloudinary/X derivatives; opening the photo viewer requests the original. Videos retain native controls, on-demand loading, and no autoplay.
- Settings shows cached image bytes/count, local originals waiting for upload, and approximate total device storage. The device-specific image-cache limit offers Off, 25, 50, 100 (default), 250, or 500 MB. Clearing only the cloud image cache leaves posts, Likes, playback, and pending original uploads intact.
- Likes update immediately and sync in the background. Routine remote settings updates do not reload all archive posts or reschedule the feed.
- A catch-up divider marks posts older than the previous visit; a floating newest-post control appears when there are incoming posts or the reader scrolls away from the top. Visit and reading-position data stay local to each device.
- Profile pages have Posts, Photos, and Videos filters. They only include released, unmuted posts, including reposts and quoted media.
- Settings previews the next 30 days of scheduled activity, daily counts, active/arriving/finishing accounts, and the complete account timeline. Muted posts are excluded from the forecast. Forecasts use the current playback speed history.
- Multi-file imports process one archive at a time. ZIP extraction runs in a module worker. Settings shows file progress and per-profile new/merged/updated posts, changed scheduling dates, included images, and missing image references. One invalid file does not discard other valid selected files.
- Failed images remain queued with per-profile retry controls; already uploaded images are reused. Other profiles may finish even if one has failed images. The cloud manifest is published only when that profile's media and tweet batches are complete. Automatic periodic retries stop on error until manual retry or reconnect.
- Tab bars have transparent active, hover, and pressed backgrounds; icon/label colors and geometry remain intact.

### True original dates after normalization

`created_at` and `reposted_at` remain the archive scheduling timestamps. Optional `original_created_at` and `original_reposted_at` hold genuine source dates. Bylines, post details, shared images, sync payloads, and backups preserve these original dates. Details separately show a normalized archive date when it differs. Original metadata does not change `original_day`, `original_seconds`, or the running replay clock.

For previously normalized exports, import a metadata JSON through the normal Import archives button:

```json
{"schema":"twitter-original-dates","version":1,"posts":[{"key":"alice:123","original_created_at":"2007-02-20T18:00:00Z"}]}
```

Keys use the imported profile's lowercase handle and tweet ID, including for reposts. Metadata is applied to matching posts and retained on the current device for later imports. No reset or image reupload is required. Reimported profile exports can also carry the optional original-date fields directly. Retaining an older source date when an existing tweet's scheduling date changes provides compatibility with date-only normalized exports; explicit original-date metadata takes precedence.
