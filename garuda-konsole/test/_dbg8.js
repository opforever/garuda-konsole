'use strict';
const fs=require('fs'),path=require('path');
const {JSDOM,VirtualConsole}=require('jsdom');
const NodeWebSocket=require('ws');
const BASE='http://localhost:3224';
const PUB=path.join(__dirname,'..','public');
const tick=(ms)=>new Promise(r=>setTimeout(r,ms));
function installStubs(win){
  win.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(t,p)=>{if(p==='createLinearGradient')return()=>({addColorStop(){}});if(p==='measureText')return()=>({width:10});return()=>{};},set:()=>true});
  class FakeLine{constructor(t){this.t=t||'';this.length=(t||'').length;}translateToString(){return this.t;}}
  class TerminalStub{
    constructor(o){this.options=Object.assign({},o);this.cols=80;this.rows=24;this.written=[];this._dataCbs=[];this._selection='';this.element=null;
      this.buffer={active:{length:2,viewportY:0,getLine:(i)=>new FakeLine('log-line-'+i)}};}
    loadAddon(){} open(el){this.element=el;el.classList.add('xterm');const ta=el.ownerDocument.createElement('textarea');ta.className='xterm-helper-textarea';el.appendChild(ta);}
    write(d){this.written.push(String(d));} reset(){} clear(){} focus(){} scrollToBottom(){} scrollLines(){}
    getSelection(){return this._selection;} clearSelection(){} selectAll(){this._sel=1;} getSelectionPosition(){return{start:{x:2,y:1},end:{x:5,y:1}};}
    select(){} selectLines(){} onData(cb){this._dataCbs.push(cb);return{dispose(){}};} onBell(){return{dispose(){}};} onSelectionChange(){return{dispose(){}};}
    attachCustomKeyEventHandler(){} paste(){} dispose(){}
  }
  win.Terminal=TerminalStub;win.FitAddon={FitAddon:class{fit(){}}};win.SearchAddon={SearchAddon:class{findNext(){return true;}findPrevious(){return true;}onDidChangeResults(){return{dispose(){}};}clearDecorations(){}}};win.WebLinksAddon={WebLinksAddon:class{}};
  win.WebSocket=NodeWebSocket; win.fetch=(u,o)=>fetch(new URL(u,BASE),o);
  win.URL.createObjectURL=()=>'blob:f';win.URL.revokeObjectURL=()=>{};win.open=()=>null;
}
const {spawn}=require('child_process');
const srv=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{env:Object.assign({},process.env,{PORT:'3224',KONSOLE_LOGIN_LIMIT:'100000'}),stdio:['ignore','pipe','pipe']});
(async()=>{
  for(let i=0;i<60;i++){try{const r=await fetch(BASE+'/healthz');if(r.ok)break;}catch(e){}await tick(150);}
  const vc=new VirtualConsole(); vc.on('jsdomError',e=>console.log('JSDOMERR:',e.message));
  const dom=new JSDOM(fs.readFileSync(path.join(PUB,'index.html'),'utf8'),{url:BASE+'/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc});
  const win=dom.window; installStubs(win);
  for(const f of ['app.js','ui.js']){const sc=win.document.createElement('script');sc.textContent=fs.readFileSync(path.join(PUB,f),'utf8');win.document.body.appendChild(sc);}
  await tick(300);
  win.document.getElementById('password-input').value='20090228';
  await win.eval('doLogin()'); await tick(1300);
  const steps = [
    ['wrapper', `(function(){
            const prev = window.fetch;
            window.__inputSent = [];
            window.fetch = function(url, opts) {
                const u = String(url);
                if (u.includes('/api/tasks') && (!opts || !opts.method)) {
                    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ tasks: [
                        { id: 'tk_wait', name: 'Waiting task', cmd: 'read p', cwd: '/tmp', shell: 'bash', alive: true, waiting: true, exitCode: null, notify: true, elapsedMs: 5200, tail: 'Password: ' }
                    ] }) });
                }
                if (/\\/api\\/tasks\\/[\\w]+\\/input/.test(u) && opts && opts.method === 'POST') {
                    window.__inputSent.push(JSON.parse(opts.body).data);
                    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true }) });
                }
                return prev(url, opts);
            };
        })();`],
    ['renderTasks', `renderTasks()`],
    ['innerHTML-probe', `document.getElementById('task-list').innerHTML.length`]
  ];
  for (const [name, code] of steps) {
    try { const v = win.eval(code); console.log('STEP OK:', name, typeof v === 'number' ? v : ''); }
    catch (e) { console.log('STEP FAIL:', name, '→', e.message); console.log('   first 120 of code:', JSON.stringify(code.slice(0,120))); break; }
  }
  srv.kill(); process.exit(0);
})().catch(e=>{console.error('CRASH',e);srv.kill();process.exit(1);});
