import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const server = spawn(process.env.DOTNET_BIN || 'dotnet', ['bridge/ProtocolTests/bin/Debug/net9.0/ProtocolTests.dll', '--serve-screen'], { stdio: ['pipe','pipe','inherit'] });
let browser;
try {
 const lines=createInterface({input:server.stdout});
 const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);lines.on('line',line=>{if(line.startsWith('PORT=')){clearTimeout(timeout);resolve(Number(line.slice(5)));}});});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_BIN||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1480,height:1150}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/screen`);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#152c27';x.fillRect(0,0,800,600);x.fillStyle='#eac178';x.font='20px Segoe UI';x.fillText('SYNTHETIC MAP — TEST IMAGE',210,40);x.strokeStyle='#8bd7bd';for(const [a,b,txt] of [[400,520,'START'],[240,320,'REST'],[560,320,'ELITE'],[400,120,'FIGHT']]){x.beginPath();x.arc(a,b,35,0,Math.PI*2);x.stroke();x.fillText(txt,a-30,b+5);}return c.toDataURL('image/png').split(',')[1];});
 fs.writeFileSync('artifacts/screen-test-map.png',Buffer.from(png,'base64'));
 await page.locator('#upload').setInputFiles('artifacts/screen-test-map.png');
 await page.waitForFunction(()=>document.getElementById('map-canvas').width===800);
 async function click(x,y){const b=await page.locator('#map-canvas').boundingBox();await page.mouse.click(b.x+x/800*b.width,b.y+y/600*b.height);}
 for(const [type,x,y] of [['ancient',400,520],['rest',240,320],['elite',560,320],['fight',400,120]]){await page.selectOption('#room-type',type);await click(x,y);}
 await page.locator('#connect').click();for(const [a,b,c,d] of [[400,520,240,320],[400,520,560,320],[240,320,400,120],[560,320,400,120]]){await click(a,b);await click(c,d);}
 await page.locator('#current').click();await click(400,520);
 for(const [id,value] of [['hp','25'],['max-hp','80'],['gold','117'],['potions','0']])await page.fill('#'+id,value);
 await page.locator('#score').click();await page.getByText('Review the screenshot, connections, and stats, then confirm them.',{exact:true}).waitFor();assert.equal(await page.locator('.route').count(),0);
 await page.locator('#confirm').check();await page.locator('#score').click();await page.locator('.route').first().waitFor();assert.equal(await page.locator('.route').count(),3);
 assert.match(await page.locator('.route').first().textContent(),/Campfire/);
 await page.screenshot({path:'artifacts/screen-coach-preview.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1480,height:1150});
 await page.fill('#gold','118');assert.equal(await page.locator('.route').count(),0);assert.equal(await page.locator('#confirm').isChecked(),false);
 // Real helper status/image consumption, including an OCR suggestion; actual OCR is Windows-only.
 await page.route('**/screen/v1/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({capture_id:'ocr-test',captured_at:new Date().toISOString(),text:'Ironclad 68 / 80',words:[],ocr_error:null,error:''})}));
 await page.route('**/screen/v1/image?id=ocr-test',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'ocr-test',image:'data:image/png;base64,'+png})}));
 await page.waitForFunction(()=>document.getElementById('hp').value==='68');assert.equal(await page.locator('#max-hp').inputValue(),'80');assert.equal(await page.locator('#gold').inputValue(),'');assert.equal(await page.locator('#confirm').isChecked(),false);
 assert.equal(await page.locator('.route').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: external screen UI imports image locally, annotates branches, requires review, scores three routes, invalidates edited plans, consumes capture/OCR suggestions without trusting them, and fits mobile. No JS errors.');
} finally {if(browser)await browser.close();server.stdin.end('\n');server.kill();}
