/**
 * Register slash untuk Translator Worker (pure Cloudflare, tanpa bot.py gateway)
 * Pakai DISCORD_TOKEN & APPLICATION_ID dari .env
 */
import fs from 'fs';
let env={};
try{ for(const l of fs.readFileSync('.env','utf8').split('\n')){ const m=l.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/); if(m) env[m[1].trim()]=m[2].trim(); } }catch{}
const TOK=env.DISCORD_TOKEN, APP=env.DISCORD_APPLICATION_ID || '1544557315318091940', GID=env.GUILD_ID;
if(!TOK){ console.error('DISCORD_TOKEN missing'); process.exit(1); }
const cmds=[
  {name:'translate', description:'Auto-detect → translate ke target', type:1, options:[{name:'text', description:'Teks apapun (auto-detect)', type:3, required:true},{name:'target', description:'Target (default Indonesia)', type:3, required:false, choices:[{name:'Indonesia 🇮🇩',value:'id'},{name:'English 🇬🇧',value:'en'},{name:'Taiwan 🇹🇼',value:'zh-TW'},{name:'China 🇨🇳',value:'zh-CN'},{name:'Korea 🇰🇷',value:'ko'},{name:'Jepang 🇯🇵',value:'ja'}]}]},
  {name:'autotranslate', description:'Auto translate channel', type:1, options:[{name:'enable', description:'ON/OFF', type:5, required:true},{name:'channel', description:'Channel', type:7, required:false}]},
  {name:'Translate to ID', type:3},
  {name:'Translate to EN', type:3},
  {name:'Translate to TW', type:3},
  {name:'Translate to CN', type:3}
];
const url = GID ? `https://discord.com/api/v10/applications/${APP}/guilds/${GID}/commands` : `https://discord.com/api/v10/applications/${APP}/commands`;
console.log(`PUT ${url}`);
const r=await fetch(url,{method:'PUT', headers:{Authorization:`Bot ${TOK}`, 'Content-Type':'application/json'}, body:JSON.stringify(cmds)});
console.log(r.status, await r.text());
