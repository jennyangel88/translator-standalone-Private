/**
 * Translator Standalone - Cloudflare Worker (GRATIS 100%)
 * - Handle Discord Interactions: /translate, /autotranslate (dummy), Translate to ID
 * - Auto-detect via Google gtx (sl=auto) gratis, no key, no D1
 * - Tanpa gateway 24/7, tanpa Render, tanpa kartu kredit
 * 
 * Deploy: npx wrangler deploy
 * Env: DISCORD_PUBLIC_KEY (secret), DISCORD_APPLICATION_ID optional
 */

// Verify Discord Ed25519
async function verify(request, publicKey) {
  const sig = request.headers.get('x-signature-ed25519');
  const ts = request.headers.get('x-signature-timestamp');
  const body = await request.clone().text();
  if (!sig || !ts || !body) return false;
  try {
    const enc = new TextEncoder();
    const toBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map(b=>parseInt(b,16)));
    const key = await crypto.subtle.importKey('raw', toBytes(publicKey), {name:'Ed25519'}, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, toBytes(sig), enc.encode(ts+body));
  } catch { return false; }
}

async function googleTranslate(text, target='id', source='auto') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, {headers:{'User-Agent':'Translator-Worker/1.0'}});
  if (!r.ok) throw new Error(`Google ${r.status}`);
  const j = await r.json();
  if (j.sentences) return {translated: j.sentences.map(s=>s.trans).join(''), detected: j.src||source};
  if (Array.isArray(j)) return {translated: j[0].map(x=>x[0]).join(''), detected: j[2]||source};
  throw new Error('Google format');
}
function flag(c){ const m={en:'🇬🇧',ko:'🇰🇷',ja:'🇯🇵',zh:'🇨🇳',ru:'🇷🇺',id:'🇮🇩'}; return m[c]||'🌐'; }
function lang(c){ const m={en:'Inggris',ko:'Korea',ja:'Jepang',zh:'China',ru:'Rusia',id:'Indonesia'}; return m[c]||c; }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ok:true, service:'translator-standalone', free:'Cloudflare Worker', endpoints:'/interactions'}), {headers:{'content-type':'application/json'}});
    }
    if (url.pathname === '/interactions' && request.method === 'POST') {
      if (env.DISCORD_PUBLIC_KEY) {
        const ok = await verify(request, env.DISCORD_PUBLIC_KEY);
        if (!ok) return new Response('Bad signature', {status:401});
      }
      const body = await request.json();
      if (body.type === 1) return json({type:1});
      if (body.type === 2 || body.type === 3) { // slash or context menu
        const name = body.data.name;
        const opts = Object.fromEntries((body.data.options||[]).map(o=>[o.name,o.value]));
        // context menu message text
        let msgText = opts.text || '';
        if (body.data.resolved && body.data.resolved.messages) {
          const first = Object.values(body.data.resolved.messages)[0];
          msgText = first.content || msgText;
        }
        let result;
        if (name === 'translate') {
          const text = opts.text || msgText;
          const target = opts.target || 'id';
          if (!text) result = {content:'Kirim teks yang mau diterjemahkan', flags:64};
          else {
            try {
              const r = await googleTranslate(text, target, 'auto');
              if (r.detected === target) result = {embeds:[{title:`${flag(target)} Sudah ${lang(target)}`, description:`\`\`\`${text.slice(0,1500)}\`\`\``, color:0x2ecc71}]};
              else result = {embeds:[{title:`${flag(r.detected)} ${lang(r.detected)} → ${flag(target)} ${lang(target)}`, description:`**Asli:** ${text.slice(0,1200)}\n\n**Terjemahan:** ${r.translated.slice(0,1200)}`, color:0x3498db, footer:{text:`Auto-detect: ${r.detected}`}}]};
            } catch(e){ result = {embeds:[{title:'❌ Gagal', description:String(e), color:0xe74c3c}], flags:64}; }
          }
        } else if (name === 'Translate to ID') {
          const text = msgText;
          if (!text) result = {content:'Tidak ada teks', flags:64};
          else {
            try {
              const r = await googleTranslate(text, 'id', 'auto');
              if (r.detected === 'id') result = {embeds:[{title:'🇮🇩 Sudah Indonesia', description:`\`\`\`${text.slice(0,1500)}\`\`\``, color:0x2ecc71}], flags:64};
              else result = {embeds:[{title:`${flag(r.detected)} ${lang(r.detected)} → 🇮🇩 Indonesia`, description:`**Asli:** ${text.slice(0,1000)}\n\n**Terjemahan:** ${r.translated.slice(0,1000)}`, color:0x3498db}]};
            } catch(e){ result = {embeds:[{title:'❌ Gagal', description:String(e), color:0xe74c3c}], flags:64}; }
          }
        } else if (name === 'autotranslate') {
          // Worker alone cannot listen MESSAGE_CREATE, jadi kasih info
          const en = opts.enable;
          result = {embeds:[{title: en?'✅ Autotranslate ON (butuh gateway)':'❌ OFF', description: en ? 'Worker murni tidak bisa auto di tiap pesan (butuh gateway bot.py). Pakai `/translate` atau `@mention` via gateway jika butuh true auto.' : 'Dimatikan', color: en?0x2ecc71:0xe74c3c}], flags:64};
        } else {
          result = {content:`Unknown ${name}`, flags:64};
        }
        return json({type:4, data: result});
      }
      return json({error:'unknown'},400);
    }
    return new Response('Not found', {status:404});
  }
}
function json(o,s=200){ return new Response(JSON.stringify(o), {status:s, headers:{'content-type':'application/json'}}); }
