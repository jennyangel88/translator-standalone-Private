# Deploy Translator Standalone ke Render Free (750 jam/bulan, online 24/7)

Bot sudah jalan di PC kamu (PID live), tapi mati kalau PC mati. Deploy ke Render gratis biar online terus tanpa biaya.

## Opsi A: Via GitHub (paling gampang, 5 menit)

### 1. Buat GitHub repo
1. https://github.com/new → nama `translator-standalone` → Private → Create
2. Di PC:
```powershell
cd "D:\REYDITZ\Games\BDM\Translator Standalone"
git init
git add bot.py requirements.txt render.yaml Dockerfile .gitignore
git commit -m "translator standalone"
git branch -M main
git remote add origin https://github.com/USERNAME/translator-standalone.git
git push -u origin main
# login GitHub via browser saat diminta
```

### 2. Render
1. https://dashboard.render.com → New → **Background Worker** → Connect GitHub → pilih `translator-standalone`
2. Settings:
   - Name: `translator-standalone`
   - Region: `Singapore`
   - Branch: `main`
   - Build: `pip install -r requirements.txt`
   - Start: `python bot.py`
   - Plan: **Free**
3. Environment → Add:
   - `DISCORD_TOKEN` = token dari `.env` (`MTU0ND...`)
   - `GUILD_ID` = `1325784831870636114`
4. Create Worker → tunggu `Live`

Cek log Render: harus `Login JenTrans#2672` + `Synced 3 commands`

### 3. Matikan bot di PC (biar tidak dobel)
```powershell
Stop-Process -Name python -Force # yang di PC
```

## Opsi B: Via Render Blueprint (render.yaml)

1. Push `render.yaml` ke GitHub (sudah ada di folder ini)
2. Render → New → Blueprint → pilih repo → Apply → auto create worker free

## Opsi C: Tanpa GitHub (upload manual)

1. Render → New → Background Worker → **Public Git repo** → paste ZIP upload via `https://github.com` CLI
2. Atau pakai **Fly.io** alternatif free:
```powershell
winget install Flyctl.Flyctl
fly launch --name translator-standalone --region sin --no-deploy
fly secrets set DISCORD_TOKEN=xxx GUILD_ID=1325784831870636114
fly deploy
```

## Verifikasi
Di Discord SILIWANGI99:
- `/translate text:Hello` → harus balas 🇬🇧→🇮🇩
- `@JenTrans Bonjour` → auto translate

Jika `403 Forbidden` lagi: pastikan invite bot pakai `bot` + `applications.commands` scope.

## Catatan Free Tier
- Render Free: 750 jam/bulan (~31 hari), cukup untuk 1 worker 24/7. Tidak auto-sleep untuk **Background Worker** (beda dengan Web Service).
- Jika butuh 100% no-sleep gratis, alternatif: **Koyeb free** atau **Railway free** (sama: `python bot.py`).

Butuh aku bantu `git push` langsung? Bilang username GitHub kamu, aku siapin command-nya.
