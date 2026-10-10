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

ZIPs must contain archive.json and optional referenced images. Missing images fall back to remote URLs when available. Videos show archived posters and a link to the original post. No credentials or hidden X API are used. Imported archives upload to your private Firestore data; image bytes upload to your Cloudinary environment after owner authorization.

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
