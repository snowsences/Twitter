# Activate Twitter cloud sync

The app is configured for Firebase project `twitter-9a8b3`, Cloudinary environment `myranker`, owner `allenkevinc@gmail.com`, and Worker `https://twitter.allenkevinc.workers.dev`.

## 1. Deploy the Worker module

Cloudflare → Workers & Pages → twitter → Edit code. Replace the entire starter with `cloudflare/twitter-worker.mjs`, then Deploy. Keep these settings:

| Variable | Type | Value |
| --- | --- | --- |
| CLOUDINARY_API_KEY | Secret | Your Cloudinary API key |
| CLOUDINARY_API_SECRET | Secret | Your Cloudinary API secret |
| CLOUDINARY_CLOUD_NAME | Text | myranker |
| FIREBASE_PROJECT_ID | Text | twitter-9a8b3 |
| OWNER_EMAIL | Text | allenkevinc@gmail.com |
| ALLOWED_ORIGIN | Text | https://snowsences.github.io |

No service-account JSON, Firebase admin credential, Cloudinary unsigned preset, Cloudflare storage binding, or custom domain is required. Secrets must never be committed to this repository.

Open https://twitter.allenkevinc.workers.dev/health. It should report `configured: true`. This checks configuration presence only; the real upload verifies credentials. The Worker permits only valid, unexpired Firebase tokens for your verified Google account. It proxies image uploads, verifies image signatures, accepts files up to 8 MB, and uses deterministic content hashes with overwriting disabled. Credentials remain on the Worker.

Cloudinary images use ordinary URL-accessible delivery. Firebase database access and upload authorization are restricted to you; media URLs themselves are not sign-in protected.

## 2. Publish Firestore rules

Firebase Console → twitter-9a8b3 → Firestore Database → Rules. Replace the rules with `firestore.rules`, then Publish. Do not enable test mode.

Google sign-in must be enabled. Authentication → Settings → Authorized domains must include `snowsences.github.io` (domain only).

Optional storage optimization: Firestore → Indexes → Single field → Add exemption. Exempt collection `chunks`, field `payload`, from all index modes; exempt collection `profiles`, field `chunks`, from all index modes. The app reads these records by document ID, so it does not need those indexes. `firestore.indexes.json` contains the equivalent CLI configuration.

## 3. Open the app

Enable GitHub Pages for main /docs if needed, then open https://snowsences.github.io/Twitter/. Reload once after updating so the new service worker activates. Sign in with allenkevinc@gmail.com.

Import JSONs or image ZIPs in Settings. If this browser already has archives from the local version, choose Settings → Upload existing local archives once. If moving from the original Sites URL, export its backup and restore it in the GitHub Pages app first.

Keep the app open during uploads. Settings shows image/batch progress and any error. A completed cloud profile is published only after its media and batches are uploaded. Sync now retries pending work; completed uploads are remembered on this device. Other devices load the same profiles and replay clock after signing in. Muted-term and bookmark changes merge across devices; conflicting playback edits ask you to use the cloud playback rather than silently resetting its start.

## Size and free-plan behavior

- Import one archive at a time. Each ZIP/file and its extracted contents must be at most 600 MB; split larger exports before importing. Several imports can total multiple gigabytes.
- Each image must be at most 8 MB and be JPEG, PNG, GIF, WebP or AVIF. A failed image leaves the upload queued and reports the error.
- Successful cloud uploads release original image blobs on this device. Cloudinary images are loaded on demand; the service worker maintains an approximate 100 MB / 200-image offline cache.
- Tweets are packed into immutable JSON batch documents below 650 KB, reducing Firestore writes and reads. An archive manifest points to complete batches. Cached unchanged batches are not downloaded again.
- Old superseded batches are retained to avoid deleting records another in-flight import may reference. Frequent replacements can increase Firestore storage; there is no automatic cloud garbage collection.
- Free account limits still apply. If Cloudinary rejects an upload or Firestore hits quota, the app reports the failure and keeps pending work. Retry after resolving the quota; no paid Firebase Storage is used.
- Export backup saves tweets/settings, local image bytes still present, and cloud image links. It is not a full offline copy of all Cloudinary images. Keep the extension's original image ZIPs as media backups.
- Restore replaces device data and merges archives into the cloud; it does not delete other cloud profiles. The clock/settings from the backup are queued for sync.

## Validation

Run `npm ci` then `npm test`. Automated tests cover replay dates, mutes, ZIP/backup validation, IndexedDB outbox atomicity, interrupted uploads, merge behavior, token signature verification, CORS and signed image requests. Cloud tests use mocked Firebase/Cloudinary endpoints. Actual Google sign-in and two-device uploads still require validation after deploying the Worker and Firestore rules. The managed environment did not have the supported browser-QA skill.
