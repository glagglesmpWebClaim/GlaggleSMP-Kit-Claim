# GlaggleSMP Kit Claim

Static GitHub Pages front end for a five-minute-cooldown Netherite Crystal PvP kit claim.

## Publish on GitHub Pages

1. Create a public GitHub repository named `GlaggleSMP-Kit-Claim`.
2. Upload all files in this folder to the repository's root and commit them to `main`.
3. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
4. GitHub will show the public site URL in the Pages settings after it publishes.

GitHub Pages hosts the public static site. Item delivery uses the Cloudflare Worker + D1 service in `worker/` and the Paper bridge added to TrailEconomy 1.6.0. The form stays disconnected until the API is deployed and `config.js` has its HTTPS URL. Never put a server token in this repository.

## Claim flow to implement in the server bridge

1. A player runs `/kitlink` in game to receive an eight-character code that expires after ten minutes.
2. The player stays online and submits their Minecraft username and code here.
3. The Cloudflare API queues the request. TrailEconomy checks the code against the UUID that generated it, checks the five-minute cooldown, then gives the kit only if all items fit in the inventory.
4. The plugin records successful claims by UUID, so changing usernames or refreshing the site cannot bypass the cooldown.

The browser calls `POST <API URL>/api/claims` with JSON `{ "player": "name", "code": "one-time-code" }`; the page checks `GET /api/claims/<id>` until the server replies. The Worker restricts browser origins, rate-limits submissions, and only exposes queue/result endpoints to the Paper server token.

## Deploy the claim service

GitHub Pages and the Cloudflare API are separate deployments. Cloudflare D1 stores only short-lived pending codes and claim status. Follow Cloudflare's current Wrangler setup, then from this `worker` folder:

1. Install Node.js LTS, then run `npm install`.
2. Run `npx wrangler d1 create glagglesmp-kit-claims` and put the returned database ID in `wrangler.toml`.
3. Set `SITE_ORIGIN` in `wrangler.toml` to the origin shown for your GitHub Pages site (scheme and host only, no path).
4. Run `npx wrangler d1 migrations apply glagglesmp-kit-claims --remote`.
5. Generate a long random token. Run `npx wrangler secret put SERVER_TOKEN` and enter that token when prompted.
6. Run `npx wrangler deploy` and copy the Worker HTTPS URL.
7. Put that URL in `config.js` as `window.GLAGGLE_KIT_API` and publish the updated site.
8. In `plugins/TrailEconomy/config.yml`, set `kit-claims.api-url` to the Worker URL and `kit-claims.server-token` to the same token. Restart Paper.

Keep the token private; it belongs in Cloudflare's secret store and the server's private plugin config only. The kit bridge uses Paper's Bukkit inventory API and does not inspect protocol packets, so it is designed to work while ViaVersion/ViaBackwards handle client versions.

## Kit preview and proposed delivery

- Full Netherite armor with Blast Protection IV, Unbreaking III, Mending and Thorns III; helmet also Respiration III and Aqua Affinity, leggings Swift Sneak III, boots Feather Falling IV, Depth Strider III and Soul Speed III.
- Netherite sword, axe, pickaxe, and shield. The sword has Sharpness V, Unbreaking III, Mending, Fire Aspect II, Looting III, Sweeping Edge III; axe has Sharpness V and Efficiency V; pickaxe has Efficiency V and Fortune III.
- 64 End Crystals, 64 Obsidian, 32 Respawn Anchors, 64 Glowstone, 4 Totems, 32 Golden Apples, 16 Ender Pearls, 32 XP Bottles, and an Ender Chest.

The final item list should match the kit the server plugin gives. Keep the cooldown authoritative on the Paper server, not in browser storage.
