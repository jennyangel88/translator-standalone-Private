# Deploy Translator ke Cloudflare Workers (GRATIS 100%, tanpa kartu)

Worker murni = hanya slash `/translate` + context menu `Translate to ID`. Tidak perlu PC nyala, tidak perlu Render.

**Free limit:** 100k req/hari, tanpa kartu kredit.

## 1. Install wrangler
```powershell
cd "D:\REYDITZ\Games\BDM\Translator Standalone"
npm install
# atau pakai Node yang sudah ada: D:\REYDITZ\Games\BDM\node-v24.20.0-x64.msi (install dulu)
```

## 2. Login Cloudflare (Google SSO)
```powershell
npx wrangler login
# browser → login Google
```

## 3. Set Public Key (untuk verify Discord)
Buka https://discord.com/developers/applications → pilih `Translator` (1544557315318091940) → General Information → copy **Public Key**
```powershell
npx wrangler secret put DISCORD_PUBLIC_KEY
# paste public key
```

## 4. Deploy Worker
```powershell
npx wrangler deploy
# output: https://translator-standalone.<kamu>.workers.dev
```

## 5. Set Interactions Endpoint di Discord
Developer Portal → General Information → **Interactions Endpoint URL** =
```
https://translator-standalone.<kamu>.workers.dev/interactions
```
Save → harus `Verified` (Worker jawab type 1 PING).

## 6. Test
Di SILIWANGI99:
- `/translate text:Hello world` → 🇬🇧→🇮🇩
- Klik kanan pesan → Apps → Translate to ID

## Batasan Worker murni
- `@mention` (`@Translator hello`) **tidak bisa** tanpa gateway `bot.py` (butuh MESSAGE_CREATE). Worker hanya bisa slash + context menu.
- Jika butuh `@mention` true auto, tetap butuh `bot.py` di Render/Railway free. Tapi untuk slash saja, Worker sudah cukup dan 100% gratis selamanya.

**Mau full gratis tanpa gateway? Pakai Worker ini. Mau @mention? Tambah bot.py di Render free.**
