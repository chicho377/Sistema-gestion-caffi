import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
process.loadEnvFile('.env.local');
const secrets=['SUPABASE_SERVICE_ROLE_KEY','AUTH_FLOW_SECRET'].map(key=>process.env[key]).filter(value=>value&&value.length>=32);
if(secrets.length!==2)throw Error('Faltan secretos locales para verificar el bundle');
const candidates=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n'))];
const failures=[];
const credential=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{24,}|\bsbp_[A-Za-z0-9]{30,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bnpm_[A-Za-z0-9]{30,}/;
for(const path of candidates){if(!existsSync(path)||!statSync(path).isFile())continue;const text=readFileSync(path,'utf8');if(secrets.some(s=>text.includes(s))||credential.test(text))failures.push(path);}
function assets(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())assets(path);else {const content=readFileSync(path,'utf8');if(secrets.some(s=>content.includes(s))||credential.test(content))failures.push(path);}}}
assets('.next/static');
if(execFileSync('git',['ls-files','.env.local'],{encoding:'utf8'}).trim())failures.push('.env.local tracked');
execFileSync('git',['check-ignore','.env.local'],{stdio:'pipe'});
if(/^\s*[A-Z_]*SMTP[A-Z_]*\s*=/mi.test(readFileSync('.env.local','utf8')))failures.push('.env.local contiene configuración SMTP');
const artifacts=candidates.filter(path=>/^(?:test-results|playwright-report|\.next|supabase\/\.temp)\//.test(path));
failures.push(...artifacts);
if(failures.length){console.error('FAIL archivos a revisar: '+[...new Set(failures)].join(', '));process.exitCode=1;}else console.log('PASS secretos privados ausentes de archivos versionables y assets cliente; .env.local ignorado; sin artefactos de pruebas versionables');
