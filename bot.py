"""
translator_bot.py - Discord Translator Bot standalone (GRATIS, tanpa Cloudflare)
Fitur: auto-detect bahasa apapun → translate ke Indonesia

Cara jalan:
  pip install discord.py aiohttp langdetect googletrans==4.0.0rc1 python-dotenv
  # atau tanpa lib tambahan: pakai Google gtx endpoint (sudah ada di bawah, no key)
  python translator_bot.py

Env (.env):
  DISCORD_TOKEN=...
  WORKER_URL=https://bdm-agent.xxx.workers.dev  # optional, jika mau pakai Worker /translate
  TRANSLATOR_TARGET=id
"""
import discord
from discord import app_commands
from discord.ext import commands
import aiohttp
import os
from dotenv import load_dotenv
import re

load_dotenv()
TOKEN = os.getenv("DISCORD_TOKEN")
WORKER_URL = os.getenv("WORKER_URL", "").rstrip("/")
GUILD_ID = os.getenv("GUILD_ID")

intents = discord.Intents.default()
intents.message_content = True
intents.messages = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

# -------- Translator core (gratis, no key) --------
async def google_translate(text: str, target="id", source="auto"):
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source}&tl={target}&dt=t&dj=1&q={aiohttp.helpers.quote(text)}" if hasattr(aiohttp.helpers, 'quote') else f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source}&tl={target}&dt=t&dj=1&q={text}"
    # manual quote
    import urllib.parse
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source}&tl={target}&dt=t&dj=1&q={urllib.parse.quote(text)}"
    async with aiohttp.ClientSession() as s:
        async with s.get(url, headers={"User-Agent":"Mozilla/5.0"}) as r:
            j = await r.json()
            if "sentences" in j:
                trans = "".join(x["trans"] for x in j["sentences"])
                detected = j.get("src","auto")
                return trans, detected
            # fallback array
            trans = "".join(x[0] for x in j[0])
            detected = j[2] if len(j)>2 else "auto"
            return trans, detected

async def translate_via_worker(text, target="id"):
    if not WORKER_URL:
        return None
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{WORKER_URL}/translate", json={"text": text, "target": target}, timeout=aiohttp.ClientTimeout(total=8)) as r:
                if r.status==200:
                    j = await r.json()
                    return j.get("translated"), j.get("detected")
    except Exception as e:
        print(f"[worker translate fail] {e}")
    return None

def lang_flag(code):
    m={"en":"🇬🇧","ko":"🇰🇷","ja":"🇯🇵","zh":"🇹🇼","zh-TW":"🇹🇼","zh-CN":"🇨🇳","ru":"🇷🇺","ar":"🇸🇦","th":"🇹🇭","vi":"🇻🇳","tr":"🇹🇷","fr":"🇫🇷","de":"🇩🇪","es":"🇪🇸","pt":"🇵🇹","id":"🇮🇩"}
    return m.get(code,"🌐")
def lang_name(code):
    m={"en":"Inggris","ko":"Korea","ja":"Jepang","zh":"China","zh-TW":"Taiwan","zh-CN":"China","ru":"Rusia","ar":"Arab","th":"Thailand","vi":"Vietnam","tr":"Turki","fr":"Perancis","de":"Jerman","es":"Spanyol","pt":"Portugis","id":"Indonesia"}
    return m.get(code, code)

# -------- Slash commands --------
@bot.event
async def on_ready():
    print(f"[Translator] Login {bot.user} ({bot.user.id})")
    try:
        if GUILD_ID:
            guild = discord.Object(id=int(GUILD_ID))
            bot.tree.copy_global_to(guild=guild)
            synced = await bot.tree.sync(guild=guild)
            print(f"[Translator] Synced {len(synced)} guild commands")
        else:
            synced = await bot.tree.sync()
            print(f"[Translator] Synced {len(synced)} global")
    except Exception as e:
        print(f"[sync err] {e}")
    print("[Translator] Siap! /translate | mention @bot + teks | autotranslate channel")

@bot.tree.command(name="translate", description="Auto-detect bahasa → translate ke target")
@app_commands.describe(text="Teks apapun (auto-detect)", target="Target (default Indonesia)")
@app_commands.choices(target=[
    app_commands.Choice(name="Indonesia 🇮🇩", value="id"),
    app_commands.Choice(name="English 🇬🇧", value="en"),
    app_commands.Choice(name="Taiwan 🇹🇼", value="zh-TW"),
    app_commands.Choice(name="China 🇨🇳", value="zh-CN"),
    app_commands.Choice(name="Korea 🇰🇷", value="ko"),
    app_commands.Choice(name="Jepang 🇯🇵", value="ja"),
])
async def translate_cmd(interaction: discord.Interaction, text: str, target: str = "id"):
    await interaction.response.defer()
    try:
        # coba Worker dulu
        res = await translate_via_worker(text, target)
        if res:
            trans, detected = res
        else:
            trans, detected = await google_translate(text, target, "auto")
        if detected == target:
            emb = discord.Embed(title=f"{lang_flag(target)} Sudah {lang_name(target)}", description=f"```{text[:1500]}```\nTidak perlu translate.", color=0x2ECC71)
        else:
            emb = discord.Embed(title=f"{lang_flag(detected)} {lang_name(detected)} → {lang_flag(target)} {lang_name(target)}", color=0x3498DB)
            emb.add_field(name="Asli", value=text[:1000], inline=False)
            emb.add_field(name="Terjemahan", value=trans[:1000], inline=False)
            emb.set_footer(text=f"Auto-detect: {detected} → {target} • Gratis")
        await interaction.followup.send(embed=emb)
    except Exception as e:
        await interaction.followup.send(f"❌ Gagal: {e}", ephemeral=True)

# Context menu translate message
@bot.tree.context_menu(name="Translate to ID")
async def ctx_translate(interaction: discord.Interaction, message: discord.Message):
    await interaction.response.defer(ephemeral=True)
    text = message.content
    if not text:
        await interaction.followup.send("Tidak ada teks", ephemeral=True)
        return
    try:
        trans, detected = await google_translate(text, "id", "auto")
        if detected == "id":
            await interaction.followup.send(f"🇮🇩 Sudah Indonesia:\n```{text[:1500]}```", ephemeral=True)
        else:
            emb = discord.Embed(title=f"{lang_flag(detected)} → 🇮🇩 Indonesia", color=0x3498DB)
            emb.add_field(name="Asli", value=text[:1000], inline=False)
            emb.add_field(name="Terjemahan", value=trans[:1000], inline=False)
            await interaction.followup.send(embed=emb, ephemeral=True)
    except Exception as e:
        await interaction.followup.send(f"❌ {e}", ephemeral=True)

# In-memory autotranslate setting (reset saat restart; pakai D1 jika via Worker)
auto_channels = set()

@bot.tree.command(name="autotranslate", description="Auto translate tiap pesan di channel ini ke Indonesia")
@app_commands.describe(enable="ON/OFF", channel="Channel (default current)")
async def autotranslate_cmd(interaction: discord.Interaction, enable: bool, channel: discord.TextChannel = None):
    ch = channel or interaction.channel
    if enable:
        auto_channels.add(ch.id)
        await interaction.response.send_message(f"✅ Autotranslate ON untuk {ch.mention} — tiap pesan non-ID akan aku balas terjemahannya.", ephemeral=True)
    else:
        auto_channels.discard(ch.id)
        await interaction.response.send_message(f"❌ Autotranslate OFF untuk {ch.mention}", ephemeral=True)

# -------- Mention + Auto channel handler --------
@bot.event
async def on_message(message):
    await bot.process_commands(message)
    if message.author.bot:
        return

    # 1) Mention handler: @bot <teks> → translate
    if bot.user in message.mentions:
        q = message.content
        for m in message.mentions:
            q = q.replace(f"<@{m.id}>", "").replace(f"<@!{m.id}>", "")
        q = q.strip()
        # jika hanya mention tanpa teks, reply help
        if not q or q.lower() in ["help","halo","hi"]:
            emb = discord.Embed(title="Translator Bot", description="Mention aku + teks apapun, aku auto-detect → translate ke Indonesia.\n\nContoh:\n`@Translator Hello how are you?`\n`@Translator 안녕하세요`\n`@Translator こんにちは`\n\nAtau `/translate text:...` atau klik kanan pesan → Apps → Translate to ID", color=0x1ABC9C)
            await message.reply(embed=emb, mention_author=False)
            return
        # skip jika pesan adalah command BDM (player/guild) - jangan translate
        if q.lower().startswith(("player","guild","memory","market","/")):
            return
        async with message.channel.typing():
            try:
                res = await translate_via_worker(q, "id")
                if res:
                    trans, detected = res
                else:
                    trans, detected = await google_translate(q, "id", "auto")
                if detected == "id":
                    # sudah Indonesia, jangan spam
                    return
                emb = discord.Embed(title=f"{lang_flag(detected)} {lang_name(detected)} → 🇮🇩 Indonesia", color=0x3498DB)
                emb.description = f"**Terjemahan:** {trans[:1800]}"
                emb.set_footer(text=f"Asli: {q[:80]} • Auto-detect: {detected}")
                await message.reply(embed=emb, mention_author=False)
            except Exception as e:
                print(f"[mention translate err] {e}")

    # 2) Autotranslate channel
    elif message.channel.id in auto_channels:
        # jangan translate jika sudah Indonesia atau terlalu pendek
        if len(message.content.strip()) < 3:
            return
        async with message.channel.typing():
            try:
                trans, detected = await google_translate(message.content, "id", "auto")
                if detected == "id":
                    return
                # hanya translate jika bukan ID
                emb = discord.Embed(description=f"**Terjemahan:** {trans[:1800]}", color=0x3498DB)
                emb.set_author(name=f"{lang_flag(detected)} {lang_name(detected)} → 🇮🇩", icon_url=message.author.display_avatar.url if message.author.display_avatar else None)
                await message.reply(embed=emb, mention_author=False)
            except Exception as e:
                print(f"[auto err] {e}")

if __name__ == "__main__":
    if not TOKEN:
        print("[FATAL] DISCORD_TOKEN kosong di .env")
        exit(1)
    bot.run(TOKEN)
