// Optional public HTTPS endpoint for the fixed local TV bridge. No workspace serving.
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createBridge} from './server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const binary=process.env.CLOUDFLARED??root+'.local/bin/cloudflared';
if(!existsSync(binary))throw Error('Install cloudflared, then set CLOUDFLARED to its executable path. See JUDGE_SETUP.md.');
mkdirSync(root+'.local',{recursive:true});
let bridge,closing=false,started=false;
const child=spawn(binary,['tunnel','--no-autoupdate','--url','http://127.0.0.1:8082','--http-host-header','localhost:8082'],{stdio:['ignore','pipe','pipe']});
const deadline=setTimeout(()=>{console.error('Tunnel did not start within 60 seconds.');stop(1);},60000);
function output(data){
 const text=data.toString();process.stderr.write(text);
 const origin=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
 if(!origin||started||closing)return;
 started=true;
 bridge=createBridge({origin:'http://localhost:8082',tunnelOrigin:origin});
 bridge.on('error',error=>{console.error(error.message);stop(1);});
 bridge.listen(8082,'127.0.0.1',()=>{
  clearTimeout(deadline);writeFileSync(root+'.local/tunnel-origin',origin+'\n');
  console.log('\nCERTIFICATE-FREE CONTROLLER: '+origin);
  console.log('Public temporary controller URL. Mac, internet and this process must remain running.');
  console.log('Launch the TV with this controllerOrigin; scan its new QR. No certificate installation.');
 });
}
async function stop(code=0){if(closing)return;closing=true;clearTimeout(deadline);child.kill('SIGTERM');if(bridge)await bridge.closeBridge();process.exit(code);}
child.stdout.on('data',output);child.stderr.on('data',output);
child.on('error',error=>{console.error(error.message);stop(1);});
child.on('exit',code=>{if(!closing){console.error('Tunnel exited.');stop(code||1);}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
