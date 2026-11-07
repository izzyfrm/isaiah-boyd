# /sauce blog: Cloudflare setup (Workers)

The blog lives at `/sauce`. Posts, comments and images are stored in a Cloudflare D1 database.
You write and manage posts from `/sauce/write` (hidden, password protected). No code needed.

## One-time setup

1. **Worker name**: open `wrangler.jsonc` and make sure `"name"` is exactly the name of your existing Worker
   (shown at the top of its page in Cloudflare: Workers & Pages → your Worker). A different name creates a second, separate Worker.
2. **Deploy command**: in the Worker's Settings → Builds, the deploy command should be `npx wrangler deploy`
   (remove any `--assets` flags). The config file now tells Cloudflare what to upload.
3. **Database**: the config asks for a D1 database named `sauce`. Wrangler creates it automatically on the first deploy.
   If the deploy log complains about the database, create one by hand (Storage & Databases → D1 → Create → `sauce`)
   and add its ID to `wrangler.jsonc`: `{ "binding": "DB", "database_name": "sauce", "database_id": "<id>" }`.
4. **Password**: Worker → Settings → Variables and Secrets → Add → type **Secret**, name `ADMIN_PASSWORD`, value = a long password only you know.
5. Push to the branch Cloudflare deploys from, and wait for the build to finish.

Tables are created automatically on the first visit, there is nothing to run.

## Using it

- Go to `isaiahboyd.xyz/sauce/write` and log in.
- **Update** = a short message in the feed. **Post** = a full article with its own page and title.
- Supports bold, italic, headings, links, quotes, lists, code, and images (drag, paste or use the image button).
- Visitors can comment on any post (name + message). You can delete comments and posts while logged in.

## Layout

- `src/worker.js`: entry point, routes `/api/sauce/*` and `/sauce/*`, everything else is the static site
- `functions/api/sauce/*`: the API handlers
- `functions/sauce/[[path]].js`: serves `/sauce` pages and sets link-preview tags per post
- `sauce-shell.html`, `sauce-assets/`: the page itself
- `.assetsignore`: keeps code and config files off the public site
