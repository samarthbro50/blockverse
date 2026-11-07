import * as THREE from 'three';
import './style.css';

const API = location.hostname === 'localhost' ? 'http://localhost:4000/api' : '/api';
const app = document.querySelector('#app');
let token = localStorage.getItem('bv_token') || '', me = null, games = [], mine = [];
let blocks = [], current = null, activePage = 'discover', renderer, scene, camera, raf, drag = false, last = {x:0,y:0}, yaw = .7, pitch = .65, zoom = 10, selectedBlock = -1, editorMode = false;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options={}) {
  const response = await fetch(API + path, {...options, headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token}:{}), ...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
async function load() {
  if (token) {
    try { me = (await api('/me')).user; mine = (await api('/my/games')).games; }
    catch { token=''; me=null; mine=[]; localStorage.removeItem('bv_token'); }
  } else { me=null; mine=[]; }
  const result = await api('/games').catch(()=>({games:[]}));
  games = result.games || [];
}
function header() {
  return `<header class="topbar"><a class="brand" href="#" id="brand"><span class="brand-mark">B</span><span>BLOCKVERSE</span></a>
    <nav class="main-nav"><button data-page="discover" class="${activePage==='discover'?'selected':''}">Discover</button><button data-page="create" class="${activePage==='create'?'selected':''}">Creator Studio</button><button data-page="mine" class="${activePage==='mine'?'selected':''}">My worlds</button></nav>
    <div class="account">${me ? `<span class="user-chip">${esc(me.username)}</span><button id="logout" class="quiet">Log out</button>` : '<button id="login" class="quiet">Log in</button><button id="signup" class="primary small">Sign up</button>'}</div></header>`;
}
function shell() {
  app.innerHTML = header() + '<main id="view"></main><footer><span>BLOCKVERSE</span><span>Made for builders. Powered by imagination.</span></footer>';
  $('#brand').onclick=e=>{e.preventDefault();go('discover')};
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
  $('#logout')?.addEventListener('click',()=>{token='';me=null;localStorage.removeItem('bv_token');go('discover')});
  $('#login')?.addEventListener('click',()=>auth('login'));
  $('#signup')?.addEventListener('click',()=>auth('register'));
}
async function go(page='discover') { activePage=page; stopScene(); await load(); shell(); if(page==='discover') discover(); else if(page==='mine') myWorlds(); else creator(); }
function auth(mode) {
  const overlay=document.createElement('div'); overlay.className='overlay';
  overlay.innerHTML=`<form class="auth-card"><button type="button" class="close" aria-label="Close">×</button><div class="eyebrow">WELCOME TO BLOCKVERSE</div><h2>${mode==='login'?'Good to see you again.':'Your world starts here.'}</h2><p class="muted">One account. Unlimited ideas.</p><label>Username<input name="username" minlength="3" maxlength="24" placeholder="Your username" autocomplete="username" required></label><label>Password<input name="password" type="password" minlength="8" placeholder="At least 8 characters" autocomplete="${mode==='login'?'current-password':'new-password'}" required></label><button class="primary wide">${mode==='login'?'Log in':'Create free account'}</button><p class="error" id="auth-error"></p><p class="switch-auth">${mode==='login'?'New to Blockverse?':'Already have an account?'} <a href="#" id="switch-auth">${mode==='login'?'Sign up':'Log in'}</a></p></form>`;
  document.body.append(overlay); overlay.querySelector('.close').onclick=()=>overlay.remove(); overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelector('#switch-auth').onclick=e=>{e.preventDefault();overlay.remove();auth(mode==='login'?'register':'login')};
  overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const err=overlay.querySelector('#auth-error');try{const d=await api('/'+mode,{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});token=d.token;me=d.user;localStorage.setItem('bv_token',token);overlay.remove();go(activePage)}catch(x){err.textContent=x.message}};
}
function discover() {
  const v=$('#view');
  v.innerHTML=`<section class="hero-wrap"><div class="hero-copy"><div class="eyebrow"><span class="live-dot"></span> THE CREATOR PLAYGROUND</div><h1>Imagine it.<br><em>Build it.</em> Play it.</h1><p>Discover worlds made by the community, or create a place of your own. Your next adventure starts with a block.</p><div class="hero-actions"><button class="primary" id="hero-create">＋ Create a world</button><button class="secondary" id="explore">Explore worlds <span>↓</span></button></div><div class="hero-proof"><span>✦ Free to start</span><span>◈ Made by players</span><span>▦ Your imagination</span></div></div><div class="hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="float-block b1"></div><div class="float-block b2"></div><div class="float-block b3"></div><div class="float-block b4"></div><div class="art-label">YOUR NEXT WORLD<br><b>STARTS HERE</b></div></div></section>
  <section class="community" id="community"><div class="section-heading"><div><div class="eyebrow">MADE BY THE COMMUNITY</div><h2>Worlds to jump into</h2><p class="muted">Find something fun. Then make something better.</p></div><span class="count-pill">${games.length} ${games.length===1?'WORLD':'WORLDS'}</span></div><div class="game-grid">${games.length?games.map(card).join(''):'<div class="empty-state"><div class="empty-icon">▦</div><h3>It’s quiet in here… for now.</h3><p>Be the first to publish a world for everyone to explore.</p><button class="primary" id="empty-create">Create the first world</button></div>'}</div></section>`;
  $('#hero-create').onclick=()=>go('create');$('#explore').onclick=()=>$('#community').scrollIntoView({behavior:'smooth'});$('#empty-create')?.addEventListener('click',()=>go('create'));wireCards();
}
function card(g) { const hue=(g.title||'B').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360;return `<article class="game-card"><div class="game-cover" style="--hue:${hue}"><span class="cover-grid"></span><span class="cover-cube">▦</span><span class="cover-tag">COMMUNITY WORLD</span></div><div class="game-info"><div><h3>${esc(g.title)}</h3><p>by ${esc(g.owner||'Creator')}</p></div><button class="play-btn" data-play="${g.id}" aria-label="Play ${esc(g.title)}">Play <span>→</span></button></div></article>`; }
function myWorlds() {
  $('#view').innerHTML=`<section class="page-wrap"><div class="section-heading"><div><div class="eyebrow">YOUR CREATIONS</div><h1>My worlds</h1><p class="muted">Every great game starts somewhere.</p></div><button class="primary" id="new-world">＋ New world</button></div><div class="game-grid">${mine.length?mine.map(myCard).join(''):'<div class="empty-state"><div class="empty-icon">✧</div><h3>Your creator journey starts here.</h3><p>Build a world, save your progress, and publish it for the community.</p><button class="primary" id="first-world">＋ Create your first world</button></div>'}</div></section>`;
  $('#new-world').onclick=()=>go('create');$('#first-world')?.addEventListener('click',()=>go('create'));wireCards();
}
function myCard(g) { const hue=(g.title||'B').split('').reduce((a,c)=>a+c.charCodeAt(0),0)%360;return `<article class="game-card"><div class="game-cover" style="--hue:${hue}"><span class="cover-grid"></span><span class="cover-cube">▦</span><span class="cover-tag">${g.published?'PUBLISHED':'DRAFT'}</span></div><div class="game-info"><div><h3>${esc(g.title)}</h3><p>${g.published?'Published world':'Unpublished draft'}</p></div><button class="play-btn" data-edit="${esc(g.id)}">Edit</button><button class="play-btn" data-play="${esc(g.id)}">Play</button></div></article>`; }
function wireCards() { document.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>playGame(b.dataset.play));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editGame(b.dataset.edit)); }
function editGame(id) { const g=mine.find(x=>x.id===id);if(!g)return;current=id;blocks=Array.isArray(g.scene?.blocks)?g.scene.blocks.map(b=>({...b})):[];selectedBlock=-1;activePage='create';shell();editor(); }
function creator() {
  if(!me){$('#view').innerHTML=`<section class="page-wrap locked"><div class="empty-icon">✦</div><div class="eyebrow">CREATOR STUDIO</div><h1>Make something<br><em>only you can imagine.</em></h1><p class="muted">Create a free account to build, save, and publish your own worlds.</p><button class="primary" id="join-now">Start creating</button></section>`;$('#join-now').onclick=()=>auth('register');return;}
  current=null;blocks=[{x:0,y:0,z:0,color:'#8b7cff'},{x:1,y:0,z:0,color:'#40d6bd'},{x:0,y:0,z:1,color:'#ffb45f'}];selectedBlock=-1;editor();
}
function editor() {
  const editing=mine.find(g=>g.id===current);
  $('#view').innerHTML=`<section class="page-wrap studio"><div class="studio-head"><div><div class="eyebrow">CREATOR STUDIO / NEW PROJECT</div><h1>Build your world</h1><p class="muted">Place blocks, shape your space, then publish it.</p></div><div class="studio-actions"><button class="secondary" id="save-draft">Save draft</button><button class="primary" id="publish-world">Publish world ↗</button></div></div><div class="editor-layout"><aside class="tool-panel"><div class="panel-title">WORLD SETTINGS</div><label>World name<input id="title" maxlength="48" value="${esc(editing?.title||'My first world')}" placeholder="Give your world a name"></label><label>Description<textarea id="desc" maxlength="240" rows="3" placeholder="What makes your world special?">${esc(editing?.description||'')}</textarea></label><div class="panel-divider"></div><div class="panel-title">BUILD TOOLS</div><label>Block color<input id="color" type="color" value="#8b7cff" class="color-input"></label><button class="tool-btn" id="add">＋ <span>Add block (on selected)</span></button><label>Copies to spawn<input id="copy-count" type="number" min="1" max="2000" step="1" value="100"></label><button class="tool-btn" id="spawn-copies">▦ <span>Copy & spawn blocks</span></button><button class="tool-btn" id="move-up">↑ <span>Move selected up</span></button><button class="tool-btn" id="move-down">↓ <span>Move selected down</span></button><button class="tool-btn" id="remove">− <span>Remove selected / last</span></button><div class="block-count"><span>Blocks in world</span><b id="block-count">${blocks.length} / 2000</b></div><div class="tip">BUILD CONTROLS<br><span>Click a block to select it, then drag it across the grid. Add block stacks one on top. Set a copy count and use Copy & spawn to make up to 2000 matching blocks around it. Use up/down to change height. Drag empty space to orbit; scroll to zoom.</span></div><p id="status" class="status" role="status"></p></aside><div class="viewport-wrap"><div class="viewport-top"><span><i class="live-dot"></i> LIVE PREVIEW</span><span>DRAG TO ORBIT · SCROLL TO ZOOM</span></div><div id="stage" class="viewport"></div><div class="viewport-bottom"><span>▦ BLOCKVERSE BUILDER</span><span>Autosave is not enabled — save your draft.</span></div></div></div></section>`;
  editorMode=true;
  $('#add').onclick=()=>{if(blocks.length>=2000){setStatus('Maximum of 2000 blocks reached.','error');return;}let x=0,y=0,z=0;if(selectedBlock>=0&&blocks[selectedBlock]){const b=blocks[selectedBlock];x=b.x;y=b.y+1;z=b.z;}else{const atOrigin=blocks.filter(b=>b.x===0&&b.z===0);y=atOrigin.length?Math.max(...atOrigin.map(b=>b.y))+1:0;}blocks.push({x,y,z,color:$('#color').value});selectedBlock=blocks.length-1;$('#block-count').textContent=blocks.length+' / 2000';draw();};
  $('#spawn-copies').onclick=()=>{
    if(selectedBlock<0||!blocks[selectedBlock]){setStatus('Select a block to copy first.','error');return;}
    const source={...blocks[selectedBlock]};
    const requested=Math.max(1,Math.min(2000,Math.floor(Number($('#copy-count').value)||1)));
    const amount=Math.min(requested,2000-blocks.length);
    if(amount<=0){setStatus('World is full (2000 blocks). Remove blocks before spawning more.','error');return;}
    const occupied=new Set(blocks.map(b=>b.x+','+b.y+','+b.z));
    let made=0;
    for(let ring=1;ring<=20&&made<amount;ring++){
      for(let dx=-ring;dx<=ring&&made<amount;dx++){
        for(let dz=-ring;dz<=ring&&made<amount;dz++){
          if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
          const x=source.x+dx,z=source.z+dz,key=x+','+source.y+','+z;
          if(Math.abs(x)>30||Math.abs(z)>30||occupied.has(key))continue;
          blocks.push({x,y:source.y,z,color:source.color});
          occupied.add(key);made++;
        }
      }
    }
    selectedBlock=blocks.length-1;
    $('#block-count').textContent=blocks.length+' / 2000';
    setStatus(made+' block'+(made===1?'':'s')+' copied and spawned.','success');
    draw();
  };
  $('#move-up').onclick=()=>{if(selectedBlock<0||!blocks[selectedBlock]){setStatus('Select a block first.','error');return;}blocks[selectedBlock].y+=1;draw();};
  $('#move-down').onclick=()=>{if(selectedBlock<0||!blocks[selectedBlock]){setStatus('Select a block first.','error');return;}blocks[selectedBlock].y=Math.max(0,blocks[selectedBlock].y-1);draw();};
  $('#remove').onclick=()=>{const index=selectedBlock>=0?selectedBlock:blocks.length-1;if(index>=0){blocks.splice(index,1);selectedBlock=-1;$('#block-count').textContent=blocks.length+' / 2000';draw();}};
  $('#save-draft').onclick=()=>save(false);$('#publish-world').onclick=()=>save(true);draw();
}
function setStatus(message,type='') {const s=$('#status');if(s){s.textContent=message;s.className='status '+type;}}
async function save(published) {
  const title=$('#title').value.trim()||'Untitled world',description=$('#desc').value.trim(),body={title,description,scene:{blocks},published};
  const buttons=[$('#save-draft'),$('#publish-world')];buttons.forEach(b=>b.disabled=true);setStatus('Saving your world…');
  try {if(current){await api('/games/'+current,{method:'PUT',body:JSON.stringify(body)});}else{const d=await api('/games',{method:'POST',body:JSON.stringify(body)});current=d.game.id;if(published)await api('/games/'+current,{method:'PUT',body:JSON.stringify(body)});}
    setStatus(published?'Published! Your world is now in Discover.':'Draft saved successfully.','success');await load();
  }catch(e){setStatus(e.message,'error');}finally{buttons.forEach(b=>b.disabled=false);}
}
function stopScene(){if(raf)cancelAnimationFrame(raf);raf=null;const host=$('#stage');if(host?._ro){host._ro.disconnect();host._ro=null;}if(renderer){renderer.dispose();renderer=null;}scene=null;camera=null;}
function draw() {
  stopScene();const host=$('#stage');if(!host)return;const w=Math.max(host.clientWidth,320),h=Math.max(host.clientHeight,400);
  scene=new THREE.Scene();scene.background=new THREE.Color('#11182a');scene.fog=new THREE.Fog('#11182a',18,38);
  camera=new THREE.PerspectiveCamera(45,w/h,.1,100);renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(w,h);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.innerHTML='';host.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe5eaff,0x414b68,2));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(5,10,7);sun.castShadow=true;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:'#202a40',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;scene.add(ground);
  const grid=new THREE.GridHelper(24,24,0x7c8ba8,0x39465f);grid.position.y=-.02;scene.add(grid);
  const cubeMeshes=[];for(let i=0;i<blocks.length;i++){const b=blocks[i],cube=new THREE.Mesh(new THREE.BoxGeometry(.96,.96,.96),new THREE.MeshStandardMaterial({color:b.color,roughness:.65,emissive:i===selectedBlock?0x5140a0:0x000000,emissiveIntensity:.55}));cube.position.set(b.x,b.y+.5,b.z);cube.castShadow=true;cube.receiveShadow=true;cube.userData.blockIndex=i;cubeMeshes.push(cube);scene.add(cube);}
  const target=new THREE.Vector3(0,0,0);function positionCamera(){const p=Math.max(.12,Math.min(1.35,pitch));camera.position.set(target.x+zoom*Math.sin(yaw)*Math.cos(p),zoom*Math.sin(p),target.z+zoom*Math.cos(yaw)*Math.cos(p));camera.lookAt(target);}positionCamera();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane(),planeHit=new THREE.Vector3();let draggingBlock=false,draggingView=false,activeIndex=-1;
  const pointFromEvent=e=>{const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);};
  host.onpointerdown=e=>{pointFromEvent(e);const hit=editorMode?raycaster.intersectObjects(cubeMeshes,false)[0]:null;
    if(hit){activeIndex=hit.object.userData.blockIndex;selectedBlock=activeIndex;cubeMeshes.forEach((m,i)=>{m.material.emissive.setHex(i===activeIndex?0x5140a0:0x000000);});dragPlane.set(new THREE.Vector3(0,1,0),-blocks[activeIndex].y);draggingBlock=true;host.setPointerCapture(e.pointerId);setStatus('Block '+(activeIndex+1)+' selected. Drag to move it.','success');}
    else{draggingView=true;last={x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId);}
  };
  host.onpointermove=e=>{if(draggingBlock&&activeIndex>=0){pointFromEvent(e);if(raycaster.ray.intersectPlane(dragPlane,planeHit)){const b=blocks[activeIndex];b.x=Math.max(-18,Math.min(18,Math.round(planeHit.x)));b.z=Math.max(-18,Math.min(18,Math.round(planeHit.z)));cubeMeshes[activeIndex].position.set(b.x,b.y+.5,b.z);}return;}
    if(!draggingView)return;yaw-=(e.clientX-last.x)*.008;pitch+=(e.clientY-last.y)*.008;last={x:e.clientX,y:e.clientY};pitch=Math.max(.15,Math.min(1.25,pitch));positionCamera();};
  host.onpointerup=host.onpointercancel=()=>{draggingBlock=false;draggingView=false;activeIndex=-1;};
  host.onwheel=e=>{e.preventDefault();zoom=Math.max(5,Math.min(20,zoom+e.deltaY*.01));positionCamera();};
  const resize=()=>{if(!renderer||!host.isConnected)return;const nw=host.clientWidth,nh=host.clientHeight||470;camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh);};if(window.ResizeObserver){const ro=new ResizeObserver(resize);ro.observe(host);host._ro=ro;}
  const animate=()=>{if(!renderer)return;raf=requestAnimationFrame(animate);renderer.render(scene,camera);};animate();
}
async function playGame(id) {
  editorMode=false;selectedBlock=-1;const g=[...games,...mine].find(x=>x.id===id);if(!g)return;stopScene();blocks=g.scene?.blocks||[];
  $('#view').innerHTML=`<section class="page-wrap play-page"><div class="play-head"><div><div class="eyebrow">NOW PLAYING</div><h1>${esc(g.title)}</h1><p class="muted">Created by ${esc(g.owner||'Creator')} · ${esc(g.description||'Explore this community world.')}</p></div><button class="secondary" id="back-discover">← Back to worlds</button></div><div id="stage" class="play-viewport"></div><div class="play-hint">DRAG TO LOOK AROUND · SCROLL TO ZOOM</div></section>`;
  $('#back-discover').onclick=()=>go('discover');draw();
}
go('discover');
