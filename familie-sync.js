/* familie-sync.js – Familienspeicher (Supabase) für alle Apps unter thmsbauer1.github.io
   Ohne Bibliotheken, nur fetch. Offline-fest: Fehler werden geschluckt, Log-Einträge warten in einer Warteschlange.
   Die Anmeldung liegt im gemeinsamen Browserspeicher der Webadresse – einmal anmelden gilt für alle Apps. */
(function(){
  const URL_="https://rcfpnxcjfzeieqpvmkep.supabase.co";
  const KEY_="sb_publishable_qpgo7Vggg62vdIT0kqM9uA_Ti0gFrW1"; /* öffentlicher Schlüssel, Schutz liegt in den Datenbankregeln */
  const SESS="familie-sb-session",MEMB="familie-sb-member",QUEUE="familie-sb-queue";
  const ls={get(k){try{const t=localStorage.getItem(k);return t?JSON.parse(t):null;}catch(e){return null;}},
            set(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};

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
    async flush(){
      const q=ls.get(QUEUE)||[];if(!q.length||!ls.get(SESS))return;
      try{await req("/rest/v1/activity_log",{method:"POST",headers:{Prefer:"return=minimal"},body:q});const rest=(ls.get(QUEUE)||[]).slice(q.length);ls.set(QUEUE,rest);}catch(e){}
    }
  };
  window.FamilieSync=FS;
  addEventListener("online",()=>FS.flush());
})();
