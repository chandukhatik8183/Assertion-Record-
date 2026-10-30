// Firebase adapter: paste your own Firebase web config below.
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,sendPasswordResetEmail,updatePassword,reauthenticateWithCredential,EmailAuthProvider} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,setDoc,deleteDoc,onSnapshot,writeBatch,updateDoc,arrayUnion,arrayRemove,query,orderBy,limit,where,getDocs} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCn8SG8bRCUekJ7KOOQKYyBnIbhGim7wk0",
  authDomain: "assertion-record.firebaseapp.com",
  projectId: "assertion-record",
  storageBucket: "assertion-record.firebasestorage.app",
  messagingSenderId: "454128517792",
  appId: "1:454128517792:web:a0b3b8dba55e29a829bfc5"
};

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),col=collection(db,"assets");
export const ADMIN_EMAIL="techpoint.chandu@gmail.com";
const slug=s=>String(s||"").trim().toLowerCase().replace(/\s+/g,".").replace(/[^a-z0-9._-]/g,"");
// "ramesh" -> ramesh@assets.local ; a real e-mail (admin) is used as it is
export const login=(e,p)=>signInWithEmailAndPassword(auth,String(e).includes("@")?String(e).trim():slug(e)+"@assets.local",p);
export const sendReset=e=>sendPasswordResetEmail(auth,e);
export const logout=()=>signOut(auth);
export const onAuth=cb=>onAuthStateChanged(auth,async u=>{let role="";if(u){try{role=(await u.getIdTokenResult()).claims.role||""}catch(e){}}cb(u,role)});
export const watch=(ok,err)=>onSnapshot(col,s=>ok(s.docs.map(d=>({...d.data(),code:d.id}))),err);
// Public QR page: only safe fields, served by /api/pub (assets can no longer be read without login)
export const getPublic=async c=>{const r=await fetch("/api/pub?code="+encodeURIComponent(c),{cache:"no-store"});if(r.status===404)return null;if(!r.ok){let m="Could not load";try{m=(await r.json()).error||m}catch(e){}throw new Error(m)}return r.json()};
export const getOne=async c=>{const s=await getDoc(doc(db,"assets",c));if(s.exists())return{...s.data(),code:s.id};try{const q=await getDocs(query(collection(db,"assets"),where("oldCodes","array-contains",c),limit(1)));if(!q.empty)return{...q.docs[0].data(),code:q.docs[0].id}}catch(e){}return null};
// ---- Audit log: who did what, when (admin can read, everybody logged-in can only add) ----
const acol=collection(db,"audit"),clip=(s,n)=>String(s==null?"":s).slice(0,n);
let LB={};export const setLabels=l=>{LB=l||{}};
export function audit(action,code,detail){try{const u=auth.currentUser;if(!u)return Promise.resolve();
  return setDoc(doc(acol),{at:Date.now(),by:u.email||"",action:clip(action,40),code:clip(code,40),detail:clip(detail,600)}).catch(()=>{})}catch(e){return Promise.resolve()}}
const SKIPD=["code","assigned"];
function diffText(a,b){const o=[];new Set(Object.keys(a||{}).concat(Object.keys(b||{}))).forEach(k=>{if(SKIPD.includes(k))return;
  const x=JSON.stringify(a&&a[k]==null?"":a[k]),y=JSON.stringify(b&&b[k]==null?"":b[k]);if(x!==y){const v=z=>{z=JSON.parse(z);return Array.isArray(z)?z.join(", "):(typeof z==="object"?"...":String(z))};o.push((LB[k]||k)+": "+(v(x)||"-")+" -> "+(v(y)||"-"))}});return o.join(" | ")}
export const watchAudit=(ok,err,n)=>onSnapshot(query(acol,orderBy("at","desc"),limit(n||300)),s=>ok(s.docs.map(d=>({...d.data(),id:d.id}))),err);
export const getAudit=async(code,olds)=>{const l=[code].concat(Array.isArray(olds)?olds:[]).slice(0,30);return(await getDocs(query(acol,l.length>1?where("code","in",l):where("code","==",code)))).docs.map(d=>({...d.data(),id:d.id}))};
// Admin: change some fields of an asset (assign / return / status ...) and log it
export const updateAsset=async(code,patch,action,detail)=>{await updateDoc(doc(db,"assets",code),patch);await audit(action,code,detail)};
// ---- Stock audits (admin) ----
const scol=collection(db,"stockaudits");
export const saveStockAudit=o=>setDoc(doc(scol),o);
export const newSAId=()=>doc(scol).id;
export const putStockAudit=(id,o)=>setDoc(doc(scol,id),o);
export const delStockAudit=id=>deleteDoc(doc(scol,id));
export const watchStockAudits=(ok,err,me)=>onSnapshot(me?query(scol,where("by","==",me),limit(50)):query(scol,orderBy("at","desc"),limit(50)),s=>{const l=s.docs.map(d=>({...d.data(),id:d.id}));if(me)l.sort((x,y)=>(y.at||0)-(x.at||0));ok(l)},err);
// ---- Serial numbers: one serial number can belong to ONE asset only (registry collection "serials") ----
const snKey=v=>{v=String(v||"").trim().toUpperCase();return(!v||/^(NA|N\/A|NIL|NONE|NULL|TBD|UNKNOWN|-+|\.+)$|PENDING/.test(v))?"":v};
// which fields must be unique: ISP = Account Number (sn), SIM = Company Number (cnum), everything else = Serial No. (+ Monitor Serial No.)
const dupKeys=o=>(o.type==="ISP"?[snKey(o.sn)]:o.type==="SIM"?[snKey(o.cnum)]:[snKey(o.sn),snKey(o.mon_sn)]).filter(Boolean);
const sdoc=k=>doc(db,"serials",encodeURIComponent(k));
// returns the code of the asset that really owns this serial number, or null
export async function serialOwner(v){const k=snKey(v);if(!k)return null;try{const s=await getDoc(sdoc(k));if(!s.exists())return null;const c=s.data().code,x=await getDoc(doc(db,"assets",c));if(!x.exists())return null;const d=x.data();return dupKeys(d).includes(k)?c:null}catch(e){return null}}
async function serCheck(o,code){const ks=dupKeys(o);
  if(o.type!=="ISP"&&o.type!=="SIM"&&ks.length===2&&ks[0]===ks[1])throw new Error("Serial No. and Monitor Serial No. cannot be the same ("+ks[0]+").");
  for(const k of ks){const c=await serialOwner(k);if(c&&c!==code)throw new Error(""+(o.type==="ISP"?"Account Number ":o.type==="SIM"?"Company Number ":"Serial number ")+k+" is already added for asset "+c+".\nIt can be added only once. Delete that asset first, or enter the correct serial number.")}
  return ks}
async function serPut(ks,code){for(const k of ks){try{await setDoc(sdoc(k),{code,at:Date.now()})}catch(e){}}}
async function serDrop(o,code,keep){for(const k of dupKeys(o)){if(keep&&keep.includes(k))continue;try{const s=await getDoc(sdoc(k));if(s.exists()&&s.data().code===code)await deleteDoc(sdoc(k))}catch(e){}}}
// admin: register serial numbers of assets that were added before this rule existed
export async function syncSerials(list){for(const a of list){for(const k of dupKeys(a)){try{const s=await getDoc(sdoc(k));if(!s.exists())await setDoc(sdoc(k),{code:a.code,at:Date.now()})}catch(e){}}}}
export async function save(o,isNew){
  let code=o.code;
  if(isNew){const m=/^(.*-)(\d+)$/.exec(code);if(m){let n=+m[2];while((await getDoc(doc(db,"assets",code))).exists()){n++;code=m[1]+String(n).padStart(4,"0")}}}
  let before=null;if(!isNew){try{const s=await getDoc(doc(db,"assets",code));if(s.exists())before=s.data()}catch(e){}}
  const d={...o,code};if(before&&before.assigned&&!d.assigned)d.assigned=before.assigned;if(before&&before.oldCodes&&!d.oldCodes)d.oldCodes=before.oldCodes;
  const ks=await serCheck(d,code);
  await setDoc(doc(db,"assets",code),d);await serPut(ks,code);if(before)await serDrop(before,code,ks);
  audit(before?"asset.edit":"asset.add",code,before?(diffText(before,d)||"Saved (no change)"):"Added "+[d.type,d.model].filter(Boolean).join(" ")+" at "+[d.loc,d.aloc].filter(Boolean).join(" / "));return d}
// Admin: change an asset code. The code is the document id, so the asset is moved to the new code in ONE batch (all or nothing):
// new asset + delete old + serial registry + latest-ticket pointer + the tickets. The old code is kept in "oldCodes", so old printed
// QR labels still open the asset and the old History (audit log) is still shown.
export async function renameAsset(oldCode,o){
  const newCode=o.code;if(!newCode||newCode===oldCode)throw new Error("Nothing to rename.");
  if((await getDoc(doc(db,"assets",newCode))).exists())throw new Error("Asset code "+newCode+" already exists. Use a different code.");
  const os=await getDoc(doc(db,"assets",oldCode));if(!os.exists())throw new Error("The old asset "+oldCode+" no longer exists.");
  const before=os.data(),d={...o,code:newCode};if(before.assigned&&!d.assigned)d.assigned=before.assigned;
  d.oldCodes=[...new Set([...(before.oldCodes||[]),oldCode])].slice(-10);
  const ks=await serCheck(d,oldCode);                         // serial number must still be unique
  const delKs=[];for(const k of dupKeys(before)){if(ks.includes(k))continue;try{const x=await getDoc(sdoc(k));if(x.exists()&&x.data().code===oldCode)delKs.push(k)}catch(e){}}
  const ts=(await getDocs(query(collection(db,"tickets"),where("assetCode","==",oldCode)))).docs;
  const lat=await getDoc(doc(db,"assetLatest",oldCode));
  const first=writeBatch(db);let n=0;
  first.set(doc(db,"assets",newCode),d);first.delete(doc(db,"assets",oldCode));n+=2;
  ks.forEach(k=>{first.set(sdoc(k),{code:newCode,at:Date.now()});n++});delKs.forEach(k=>{first.delete(sdoc(k));n++});
  if(lat.exists()){first.set(doc(db,"assetLatest",newCode),lat.data());first.delete(doc(db,"assetLatest",oldCode));n+=2}
  const rest=ts.slice();for(const t of rest.splice(0,Math.max(0,450-n)))first.update(t.ref,{assetCode:newCode});
  await first.commit();                                       // asset + serials + latest + first tickets: all or nothing
  for(let i=0;i<rest.length;i+=450){const b=writeBatch(db);rest.slice(i,i+450).forEach(t=>b.update(t.ref,{assetCode:newCode}));await b.commit()}   // only for assets with more than ~440 tickets
  audit("asset.edit",newCode,"Asset code changed from "+oldCode+" to "+newCode+" ("+ts.length+" ticket(s) moved)");
  return d}
export const remove=async c=>{let s="",dd=null;try{const x=await getDoc(doc(db,"assets",c));if(x.exists()){const d=x.data();dd=d;s=[d.type,d.model,d.sn&&"SN "+d.sn,d.loc,d.usr].filter(Boolean).join(" | ")}}catch(e){}
  await deleteDoc(doc(db,"assets",c));if(dd)await serDrop(dd,c);audit("asset.delete",c,"Deleted: "+s)};
export async function restore(list){
  for(let i=0;i<list.length;i+=400){const b=writeBatch(db);
    list.slice(i,i+400).forEach(x=>{const c=String(x.code).toUpperCase();b.set(doc(db,"assets",c),{...x,code:c})});await b.commit()}
  if(list.length<=300)for(const x of list)audit("asset.bulk",String(x.code).toUpperCase(),"Saved via Excel / restore");else audit("asset.bulk","",list.length+" assets saved via Excel / restore")}

// ---- Support tickets ----
export const createTicket=async t=>{const b=writeBatch(db);b.set(doc(db,"tickets",t.id),t);b.set(doc(db,"assetLatest",t.assetCode),{ticketId:t.id,at:t.created});await b.commit();return t.id};
// Latest ticket of an asset (live): pointer doc -> ticket doc
export const watchLatest=(code,ok,err)=>{let u2=null;const u1=onSnapshot(doc(db,"assetLatest",code),s=>{if(u2){u2();u2=null}if(!s.exists()){ok(null);return}u2=onSnapshot(doc(db,"tickets",s.data().ticketId),d=>ok(d.exists()?{...d.data(),id:d.id}:null),err)},err);return()=>{u1();if(u2)u2()}};
// Admin: make sure every asset points to its newest ticket (covers tickets created before this feature)
export const syncLatest=async list=>{const m={};list.forEach(t=>{if(t.assetCode&&(!m[t.assetCode]||(t.created||0)>(m[t.assetCode].created||0)))m[t.assetCode]=t});
  for(const c in m){try{await setDoc(doc(db,"assetLatest",c),{ticketId:m[c].id,at:m[c].created})}catch(e){}}};
export const getTicket=async id=>{const s=await getDoc(doc(db,"tickets",id));return s.exists()?{...s.data(),id:s.id}:null};
export const watchTickets=(ok,err)=>onSnapshot(collection(db,"tickets"),s=>ok(s.docs.map(d=>({...d.data(),id:d.id}))),err);
export const updateTicket=(id,patch)=>updateDoc(doc(db,"tickets",id),patch);
export const removeTicket=id=>deleteDoc(doc(db,"tickets",id));
export const watchTicket=(id,ok,err)=>onSnapshot(doc(db,"tickets",id),s=>ok(s.exists()?{...s.data(),id:s.id}:null),err);
export const actTicket=async(id,patch,entry,code)=>{if(!code){try{const x=await getDoc(doc(db,"tickets",id));if(x.exists())code=x.data().assetCode}catch(e){}}await updateDoc(doc(db,"tickets",id),{...patch,updated:Date.now(),history:arrayUnion(entry)});audit("ticket",code||"","Ticket "+String(id).slice(0,8).toUpperCase()+": "+(entry&&(entry.note||entry.status)||"updated"))};
export const sendFeedback=(id,fbk)=>updateDoc(doc(db,"tickets",id),{feedback:fbk});
// Restore tickets exactly as backed up (status, notes, engineer, history, feedback), then repoint each asset to its newest ticket
export async function restoreTickets(list,current){
  for(let i=0;i<list.length;i+=400){const b=writeBatch(db);
    list.slice(i,i+400).forEach(x=>b.set(doc(db,"tickets",x.id),{...x,id:x.id}));await b.commit()}
  const m={};(current||[]).forEach(t=>{m[t.id]=t});list.forEach(t=>{m[t.id]=t});
  await syncLatest(Object.values(m))}

// ---- Branch list (config/branches) : admin edits it, the add-only user can only read it ----
const cfgRef=doc(db,"config","branches");
export const watchConfig=(ok,err)=>onSnapshot(cfgRef,s=>ok(s.exists()?s.data():{}),err);
export const seedBranches=(seed,v)=>{const o={__v:v};Object.keys(seed).forEach(c=>{if(seed[c].length)o[c]=arrayUnion(...seed[c])});return setDoc(cfgRef,o,{merge:true})};
export const addBranch=(co,b)=>setDoc(cfgRef,{[co]:arrayUnion(b)},{merge:true});
export const addCompany=e=>setDoc(cfgRef,{__co:arrayUnion(e)},{merge:true});   // e = "Company Name|XX"
export const removeBranch=(co,b)=>setDoc(cfgRef,{[co]:arrayRemove(b)},{merge:true});

// ---- Asset codes without listing all assets (counters = "last number used" hint, never trusted blindly) ----
const cid=p=>String(p).slice(0,5);                       // "SK-DT-" -> "SK-DT"
async function hint(p){try{const s=await getDoc(doc(db,"counters",cid(p)));return s.exists()?(+s.data().n||0):0}catch(e){return 0}}
export async function nextFree(p){let n=await hint(p);
  for(let i=0;i<500;i++){n++;const c=p+String(n).padStart(4,"0");if(!(await getDoc(doc(db,"assets",c))).exists())return c}
  throw new Error("No free asset code found")}
// Add-only user: create ONE new asset. If the code was taken meanwhile, pick the next free one and retry.
export async function createAsset(o){let code=o.code,last;const ks=await serCheck(o,"__new");
  for(let t=0;t<4;t++){const p=code.slice(0,6),num=parseInt(code.slice(6),10),b=writeBatch(db);
    b.set(doc(db,"assets",code),{...o,code});
    if(num>await hint(p))b.set(doc(db,"counters",cid(p)),{n:num});
    try{await b.commit();await serPut(ks,code);audit("asset.add",code,"Added "+[o.type,o.model].filter(Boolean).join(" ")+" at "+[o.loc,o.aloc].filter(Boolean).join(" / "));return{...o,code}}catch(e){last=e;code=await nextFree(p)}}
  throw last}
// Add-only user: create many NEW assets (items = [{p:"SK-DT-",o:asset}]); codes are allotted here. Returns the codes.
export async function bulkCreate(items){const cur={};const seen={};
  for(const it of items){const ks=await serCheck(it.o,"__new");for(const k of ks){if(seen[k])throw new Error("Serial number "+k+" is repeated in the file. A serial number can be added only once.");seen[k]=1}it.ks=ks}
  for(const it of items){const p=it.p;if(cur[p]===undefined)cur[p]=await hint(p);it.code="";
    for(let i=0;i<500&&!it.code;i++){cur[p]++;const c=p+String(cur[p]).padStart(4,"0");if(!(await getDoc(doc(db,"assets",c))).exists())it.code=c}
    if(!it.code)throw new Error("No free asset code found")}
  for(let i=0;i<items.length;i+=400){const b=writeBatch(db);items.slice(i,i+400).forEach(it=>b.set(doc(db,"assets",it.code),{...it.o,code:it.code}));await b.commit()}
  for(const it of items)await serPut(it.ks||[],it.code);
  for(const it of items)audit("asset.add",it.code,"Added (bulk) "+[it.o.type,it.o.model].filter(Boolean).join(" ")+" at "+[it.o.loc,it.o.aloc].filter(Boolean).join(" / "));
  const mx={};items.forEach(it=>{mx[it.p]=Math.max(mx[it.p]||0,parseInt(it.code.slice(6),10))});
  for(const p in mx){try{if(mx[p]>await hint(p))await setDoc(doc(db,"counters",cid(p)),{n:mx[p]})}catch(e){}}
  return items.map(it=>it.code)}
// Admin: keep the counters up to date (so the add-only user finds the next free code quickly)
export async function bumpCounters(codes){const mx={};
  codes.forEach(c=>{const m=/^([A-Z]{2}-[A-Z]{2})-(\d{4})$/.exec(String(c).toUpperCase());if(m)mx[m[1]]=Math.max(mx[m[1]]||0,+m[2])});
  for(const k in mx){try{const s=await getDoc(doc(db,"counters",k));if(!s.exists()||(+s.data().n||0)<mx[k])await setDoc(doc(db,"counters",k),{n:mx[k]})}catch(e){}}}
export const syncCounters=list=>bumpCounters(list.map(a=>a.code));

// ---- Asset movement / repair approval (admin) ----
// Next gate-pass number for a financial year, e.g. fy "2026-27" -> 1, 2, 3 ...
export async function nextGP(fy,pfx){pfx=pfx||"GP";const r=doc(db,"counters",pfx+fy);let n=0;try{const s=await getDoc(r);if(s.exists())n=+s.data().n||0}catch(e){}n++;await setDoc(r,{n});return n}
// User confirms the asset is back in his hands: ticket gets urcv, asset goes back to In Use (rules allow only this exact change)
export async function userReceive(id,code,name){const now=Date.now();await updateDoc(doc(db,"tickets",id),{urcv:{at:now,name:String(name||"").slice(0,80)}});try{await updateDoc(doc(db,"assets",code),{st:"In Use"})}catch(e){}return now}
export const setAssetStatus=async(code,st)=>{await updateDoc(doc(db,"assets",code),{st});audit("asset.status",code,"Status -> "+st)};

// ---- Passwords (direct change, no e-mail) ----
// Own password: re-login with the current password, then set the new one.
export async function changeMyPassword(oldPw,newPw){const u=auth.currentUser;if(!u)throw new Error("Not logged in");
  await reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,oldPw));await updatePassword(u,newPw)}
// Admin: secure server functions (/api/users, /api/backup)
async function api(path,action,data){const u=auth.currentUser;if(!u)throw new Error("Not logged in");
  const tok=await u.getIdToken(true),r=await fetch("/api/"+path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+tok},body:JSON.stringify({...(data||{}),action})});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok)throw new Error(r.status===404?"Server function not found - deploy this folder on Vercel (api/"+path+".js).":(j.error||"Server error "+r.status));return j}
export const usersApi=(a,d)=>api("users",a,d);
export const backupApi=(a,d)=>api("backup",a,d);

// ---- IT Support Center (help.html): real screenshots on the steps. Anybody can read, only the admin can add / remove ----
const hcol=collection(db,"helpshots");
export const helpShots=async topic=>{const o={};(await getDocs(query(hcol,where("topic","==",topic)))).docs.forEach(d=>{const x=d.data();if(typeof x.img==="string")o[x.step]=x.img});return o};
export const helpShotSave=(topic,step,img)=>setDoc(doc(hcol,topic+"-"+step),{topic,step,img,at:Date.now()});
export const helpShotDel=(topic,step)=>deleteDoc(doc(hcol,topic+"-"+step));
