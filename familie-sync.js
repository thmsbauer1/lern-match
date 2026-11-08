/* familie-sync.js – Familienspeicher (Supabase) für alle Apps unter thmsbauer1.github.io
   Ohne Bibliotheken, nur fetch. Offline-fest: Fehler werden geschluckt, Log-Einträge warten in einer Warteschlange.
   Die Anmeldung liegt im gemeinsamen Browserspeicher der Webadresse – einmal anmelden gilt für alle Apps.
   Diese Datei ist in allen Repos gleich (lern-match, spuernase, testtrainer, eltern-cockpit). Änderungen bitte überall übernehmen.

   Einbinden in eine App (siehe spuernase):
     FamilieSync.attach({app:"spuernase", get:()=>S, set:d=>{S=d;}, store:()=>localStorage…, render, idle:()=>bool, showChild:(data,info)=>{…}})
     im save() der App:   FamilieSync.stamp(S); …lokal schreiben…; FamilieSync.saved();
     im Elternbereich:    ${FamilieSync.panelHTML()} */
(function(){
  const URL_="https://rcfpnxcjfzeieqpvmkep.supabase.co";
  const KEY_="sb_publishable_qpgo7Vggg62vdIT0kqM9uA_Ti0gFrW1"; /* öffentlicher Schlüssel, Schutz liegt in den Datenbankregeln */
  const SESS="familie-sb-session",MEMB="familie-sb-member",QUEUE="familie-sb-queue";
  const ls={get(k){try{const t=localStorage.getItem(k);return t?JSON.parse(t):null;}catch(e){return null;}},
            set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function req(path,opt){
    opt=opt||{};const h=Object.assign({apikey:KEY_,"Content-Type":"application/json"},opt.headers||{});
    if(opt.auth!==false){const t=await token();if(!t)throw new Error("nicht angemeldet");h.Authorization="Bearer "+t;}
    const res=await fetch(URL_+path,{method:opt.method||"GET",headers:h,body:opt.body?JSON.stringify(opt.body):undefined,keepalive:!!opt.keepalive,cache:"no-store"});
    const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null;}catch(e){data=txt;}
    if(!res.ok){const m=(data&&(data.msg||data.message||data.error_description||data.error))||("Fehler "+res.status);const err=new Error(m);err.status=res.status;err.code=data&&(data.code||data.error_code);throw err;}
    return data;
  }
  function keep(d){const s={access:d.access_token,refresh:d.refresh_token,exp:Date.now()+((d.expires_in||3600)-60)*1000,uid:d.user&&d.user.id,email:d.user&&d.user.email};ls.set(SESS,s);return s;}
  async function token(){
    const s=ls.get(SESS);if(!s)return null;if(Date.now()<s.exp)return s.access;
    try{const d=await req("/auth/v1/token?grant_type=refresh_token",{method:"POST",auth:false,body:{refresh_token:s.refresh}});return keep(d).access;}
    catch(e){if(e.status===400||e.status===401){ls.set(SESS,null);ls.set(MEMB,null);}return null;}
  }
  const netErr=e=>navigator.onLine===false||e instanceof TypeError?"Gerade kein Internet – wird später abgeglichen.":e.message;

  const FS={
    session(){return ls.get(SESS);},
    member(){return ls.get(MEMB);},
    async signIn(email,password){
      try{const d=await req("/auth/v1/token?grant_type=password",{method:"POST",auth:false,body:{email:String(email).trim(),password}});keep(d);}
      catch(e){if(e.status===400)throw new Error("E-Mail oder Passwort stimmt nicht.");throw new Error("Anmeldung gerade nicht möglich. Ist Internet da?");}
      return FS.loadMember();
    },
    async signOut(){try{await req("/auth/v1/logout",{method:"POST"});}catch(e){}ls.set(SESS,null);ls.set(MEMB,null);},
    async loadMember(){
      const s=ls.get(SESS);if(!s)return null;
      const r=await req("/rest/v1/members?select=id,display_name,role,family_id&user_id=eq."+s.uid);
      const m=r&&r[0]||null;ls.set(MEMB,m);return m;
    },
    async familyMembers(){return req("/rest/v1/members?select=id,display_name,role&order=role.desc,display_name");},
    async pull(app,memberId){
      const m=memberId||(FS.member()||{}).id;if(!m)return null;
      const r=await req("/rest/v1/app_progress?select=data,updated_at&member_id=eq."+m+"&app=eq."+encodeURIComponent(app));
      return r&&r[0]||null;
    },
    async push(app,data,keepalive){
      const m=(FS.member()||{}).id;if(!m)return false;
      await req("/rest/v1/app_progress?on_conflict=member_id,app",{method:"POST",keepalive,headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:{member_id:m,app,data}});
      return true;
    },
    /* Ereignis fürs Auswerten (Lesezeit, Trefferquote …). Ohne Netz wird es aufgehoben und später nachgeschickt. */
    log(app,kind,value){
      const m=FS.member();if(!m)return;
      const q=ls.get(QUEUE)||[];q.push({member_id:m.id,app,kind,value:value||{},occurred_at:new Date().toISOString()});ls.set(QUEUE,q.slice(-500));
      FS.flush();
    },
    /* Lesender Zugriff auf eine Tabelle (nur angemeldet; die Datenbankregeln entscheiden, was sichtbar ist).
       Beispiel: FS.rest("/rest/v1/activity_log?select=kind,value&member_id=eq.…") – genutzt vom Eltern-Cockpit. */
    async rest(path){return req(path);},
    /* Ruft eine Edge Function im Familienspeicher auf (nur angemeldet), z. B. FS.fn("tiebreak-check",{…}). */
    async fn(name,body){return req("/functions/v1/"+encodeURIComponent(name),{method:"POST",body:body||{}});},
    async flush(){
      const q=ls.get(QUEUE)||[];if(!q.length||!ls.get(SESS))return;
      try{await req("/rest/v1/activity_log",{method:"POST",headers:{Prefer:"return=minimal"},body:q});const rest=(ls.get(QUEUE)||[]).slice(q.length);ls.set(QUEUE,rest);}catch(e){}
    }
  };

  /* ---------- Fertiger Abgleich für eine App ----------
     Regel: Der neuere Stand (savedAt) gewinnt. Hochgeladen wird erst nach einem erfolgreichen Abgleich,
     damit ein leeres neues Gerät nie einen vorhandenen Stand überschreibt. */
  let C=null;const ST={ready:false,busy:false,t:null,last:null,err:null,ui:{}};
  function rerender(){if(C&&(!C.idle||C.idle()))C.render();}
  FS.stamp=d=>{if(d&&typeof d==="object")d.savedAt=Date.now();};
  FS.saved=()=>{if(!C||!ST.ready||!FS.session())return;clearTimeout(ST.t);ST.t=setTimeout(()=>FS.syncNow(),4000);};
  FS.syncStart=async()=>{
    if(!C||!FS.session()||ST.busy)return;ST.busy=true;
    try{const m=FS.member()||await FS.loadMember();if(!m){ST.err="Dieses Konto ist noch keiner Familie zugeordnet.";return;}
      const r=await FS.pull(C.app),loc=C.get()||{};
      if(r&&r.data&&(r.data.savedAt||0)>(loc.savedAt||0)){
        if(C.idle&&!C.idle())return; /* mitten im Lesen/Üben nicht austauschen – beim nächsten Öffnen erneut */
        C.set(r.data);C.store();}
      else if(!C.hasProgress||C.hasProgress())await FS.push(C.app,loc);
      ST.ready=true;ST.err=null;ST.last=new Date();FS.flush();
    }catch(e){ST.err=netErr(e);}
    finally{ST.busy=false;rerender();}
  };
  FS.syncNow=async keepalive=>{
    if(!C||!FS.session())return;if(!ST.ready)return FS.syncStart();clearTimeout(ST.t);
    try{await FS.push(C.app,C.get(),keepalive);ST.last=new Date();ST.err=null;}catch(e){ST.err=netErr(e);}
  };
  FS.attach=cfg=>{
    C=Object.assign({btn:"btn sm",btn2:"btn ghost sm"},cfg);
    addEventListener("online",()=>ST.ready?FS.syncNow():FS.syncStart());
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")FS.syncNow(true);else FS.syncStart();});
    FS.syncStart();
  };

  /* ---------- Anmeldebereich für die Elternansicht ---------- */
  FS.panelHTML=()=>{
    if(!C)return"";const s=FS.session(),m=FS.member(),U=ST.ui;
    if(!s)return`<div class="panel stack fs-box"><h2>Familienspeicher</h2>
      <p class="small muted">Mit der Anmeldung wird der Stand gesichert, und ihr seht ihn auch auf euren Handys. Eine Anmeldung gilt für alle Apps.</p>
      <form id="fs-login" class="stack"><input class="fs-inp" id="fs-mail" type="email" autocomplete="username" placeholder="E-Mail" value="${esc(U.mail||"")}" required>
       <input class="fs-inp" id="fs-pw" type="password" autocomplete="current-password" placeholder="Passwort" required>
       <button class="${C.btn}" type="submit" ${U.busy?"disabled":""}>${U.busy?"Melde an …":"Anmelden"}</button></form>
      ${U.err?`<p class="small fs-err">${esc(U.err)}</p>`:""}</div>`;
    const tm=ST.last?ST.last.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}):null;
    const kids=(U.kids||[]).filter(k=>k.role==="child"&&(!m||k.id!==m.id));
    return`<div class="panel stack fs-box"><h2>Familienspeicher</h2>
      <p class="small">Angemeldet als <b>${esc(m?m.display_name:s.email)}</b>${m&&m.role==="parent"?" (Elternteil)":""}</p>
      <p class="small muted">${ST.err?esc(ST.err):ST.busy?"Gleiche ab …":tm?"Zuletzt abgeglichen um "+tm+" Uhr.":"Noch nicht abgeglichen."}</p>
      <div class="row fs-row"><button class="${C.btn}" data-fs="sync">Jetzt abgleichen</button><button class="${C.btn2}" data-fs="out">Abmelden</button></div>
      ${m&&m.role==="parent"&&C.showChild?`<div class="stack"><p class="small"><b>Stand eines Kindes ansehen</b></p>
        ${kids.length?`<div class="row fs-row">${kids.map(k=>`<button class="${C.btn2}" data-fs="kid" data-id="${esc(k.id)}" data-name="${esc(k.display_name)}">${esc(k.display_name)}</button>`).join("")}</div>`:`<button class="${C.btn2}" data-fs="kids">Kinder laden</button>`}
        ${U.kidMsg?`<p class="small muted">${esc(U.kidMsg)}</p>`:""}</div>`:""}
    </div>`;
  };
  const css=document.createElement("style");
  css.textContent=".fs-inp{box-sizing:border-box;width:100%;font:inherit;font-size:1rem;padding:11px 12px;border:2px solid currentColor;border-radius:4px;background:transparent;color:inherit}.fs-err{color:#d6455a}.fs-row{display:flex;flex-wrap:wrap;gap:10px}";
  (document.head||document.documentElement).appendChild(css);

  document.addEventListener("click",async e=>{
    const b=e.target.closest("[data-fs]");if(!b||!C)return;const U=ST.ui;
    switch(b.dataset.fs){
      case"sync":ST.ready?FS.syncNow().then(rerender):FS.syncStart();rerender();break;
      case"out":await FS.signOut();ST.ready=false;ST.last=null;ST.err=null;ST.ui={};rerender();break;
      case"kids":try{U.kids=await FS.familyMembers();U.kidMsg=null;}catch(err){U.kidMsg="Gerade nicht möglich: "+netErr(err);}rerender();break;
      case"kid":try{const r=await FS.pull(C.app,b.dataset.id);
          if(!r){U.kidMsg=b.dataset.name+" hat hier noch keinen Stand im Familienspeicher.";rerender();}
          else{U.kidMsg=null;C.showChild(r.data,{name:b.dataset.name,at:new Date(r.updated_at)});}
        }catch(err){U.kidMsg="Gerade nicht abrufbar: "+netErr(err);rerender();}break;
    }
  });
  document.addEventListener("submit",e=>{
    if(!C||e.target.id!=="fs-login")return;e.preventDefault();e.stopPropagation();
    const U=ST.ui,mail=document.getElementById("fs-mail").value,pw=document.getElementById("fs-pw").value;
    U.busy=true;U.err=null;U.mail=mail;rerender();
    FS.signIn(mail,pw).then(async m=>{U.busy=false;
      if(!m){U.err="Angemeldet, aber das Konto gehört noch zu keiner Familie.";rerender();return;}
      if(m.role==="parent"){try{U.kids=await FS.familyMembers();}catch(err){}}
      await FS.syncStart();
    }).catch(err=>{U.busy=false;U.err=err.message;rerender();});
  },true);

  window.FamilieSync=FS;
  addEventListener("online",()=>FS.flush());
})();
