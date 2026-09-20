# Cookies

Netscape-format cookies.txt files, one per platform. Export from a browser where
you are logged in (e.g. the "Get cookies.txt LOCALLY" extension), then drop here:

- `instagram.txt` — required for any instagram.com URL
- `tiktok.txt`    — required when TikTok responds "requiring login" (currently the
                    case for all TikTok URLs from this machine)
- `youtube.txt`   — optional, only for age-gated / member-only videos

These files are gitignored. The ingest script never downloads or creates them.
