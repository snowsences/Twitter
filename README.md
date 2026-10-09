# Twitter

A static, installable Twitter replay reader. Firebase syncs your account’s archives and playback state across devices; IndexedDB keeps a local cache. Cloudinary hosts imported image files through an authenticated Cloudflare Worker. Import X Profile Archive JSON exports or its image ZIPs, then choose Start replay. Posts and reposts from all imported accounts share the feed, with each account's history measured relative to its own first record.

## Playback rules

- Every profile's first post appears exactly when playback starts, regardless of its original clock time.
- Other posts use their original clock time in the replay timezone (fixed when importing/starting).
- Original calendar-day offsets are mapped to replay days. Default 1x preserves day spacing. Speed compresses day spacing, not hours/minutes.
- Other posts mapped to day zero whose clock times have already passed wait for that time the following day.
- Speed changes take effect at the next midnight, preserving already-published posts. A change creates a new speed segment without restarting or rescheduling past segments.
- The clock continues while closed. Future posts stay hidden in the feed, search, bookmarks and profile counts.
- There is no Pause or Resume. Reset requires typing RESET TWITTER and explicitly confirming; it retains archives, images and bookmarks.
- Actual repost times are absent from extension exports. Repost playback uses the original post date and is labeled approximate in Settings and post details.
- At a DST clock gap, a post uses the next valid wall time. Repeated DST hours use one deterministic occurrence.

The app normalizes neither original gaps nor total archive duration. Do those edits in individual JSONs before importing if desired. When later importing older posts into a running account, its existing replay baseline stays fixed, to avoid hiding already-visible posts.

## Muted terms

Settings → Muted terms lets you add, edit or remove words and phrases without changing archive files. Each rule applies to everyone or selected imported profiles. Matching is case-insensitive, uses whole words, and includes quoted text. Matching posts disappear immediately from Home, profile views, search and bookmarks, and future matching posts remain hidden. Repost rules apply to the importing/reposting profile. Removing a rule makes its posts eligible again; the original archive records are retained. Rules sync between devices and are included in backups.

## Imports, local images and backup

JSON and ZIP imports support multiple files in one action. Incoming data is validated before any writes. Posts are keyed by archive profile plus post ID, so the same original post reposted by different accounts remains attributed to each. Re-importing merges duplicate records and retains fuller text and saved media. ZIP assets use separate per-import namespaces. Avatars are collected only for imported primary profiles; unknown original authors use initials.

ZIPs must contain archive.json and optional referenced images. Missing images fall back to remote URLs when available. Videos show archived posters and a link to the original post. No credentials or hidden X API are used. Imported archives upload to your private Firestore data; image bytes upload to your Cloudinary environment after owner authorization.

Export backup packages profiles, posts, bookmarks, muted terms, clock history, local image bytes and cloud links. It does not download the complete Cloudinary library. Keep original extension ZIPs as media backups. Restore replaces this device’s data after typing RESTORE TWITTER and queues cloud sync. Other cloud profiles are retained. See SETUP.md for Firebase rules and Worker activation.

## Development and hosting

The deployed static files are in docs/. This repository is ready for GitHub Pages: in Settings → Pages, choose Deploy from a branch, main, and /docs, then Save. The app URL will be https://snowsences.github.io/Twitter/. The static app can also be served from another HTTPS static host. No application server or build step is required. fflate is bundled locally for ZIP reading/writing. Its MIT license is included.

Run `npm test` for scheduler, import, ZIP, storage, sync and Worker checks. The managed environment had no supported browser-QA skill, so full Chrome install/offline rendering and visual device QA were not available. DOM-based checks cover the main UI and confirmation flows; they do not replace live browser validation.

## Moving from the original app

Browser storage belongs to each site address. Export a full backup from the original app, then restore it in the GitHub Pages app to carry over imports, images, replay progress, bookmarks and muted terms.

## Cloud activation

Follow [SETUP.md](SETUP.md). The Firebase web configuration is public configuration; Cloudinary credentials are Worker secrets. The Worker and database rules restrict access to allenkevinc@gmail.com. Cloudinary media uses URL-accessible delivery. Uploaded local originals are released to save space, with a bounded cache for recently viewed cloud images.
