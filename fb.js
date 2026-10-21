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
export const getOne=async c=>{const s=await getDoc(doc(db,"assets",c));return s.exists()?{...s.data(),code:s.id}:null};
// ---- Audit log: who did what, when (admin can read, everybody logged-in can only add) ----
const acol=collection(db,"audit"),clip=(s,n)=>String(s==null?"":s).slice(0,n);
let LB={};export const setLabels=l=>{LB=l||{}};
export function audit(action,code,detail){try{const u=auth.currentUser;if(!u)return Promise.resolve();
  return setDoc(doc(acol),{at:Date.now(),by:u.email||"",action:clip(action,40),code:clip(code,40),detail:clip(detail,600)}).catch(()=>{})}catch(e){return Promise.resolve()}}
const SKIPD=["code","assigned"];
function diffText(a,b){const o=[];new Set(Object.keys(a||{}).concat(Object.keys(b||{}))).forEach(k=>{if(SKIPD.includes(k))return;
  const x=JSON.stringify(a&&a[k]==null?"":a[k]),y=JSON.stringify(b&&b[k]==null?"":b[k]);if(x!==y){const v=z=>{z=JSON.parse(z);return Array.isArray(z)?z.join(", "):(typeof z==="object"?"...":String(z))};o.push((LB[k]||k)+": "+(v(x)||"-")+" -> "+(v(y)||"-"))}});return o.join(" | ")}
export const watchAudit=(ok,err,n)=>onSnapshot(query(acol,orderBy("at","desc"),limit(n||300)),s=>ok(s.docs.map(d=>({...d.data(),id:d.id}))),err);
export const getAudit=async code=>(await getDocs(query(acol,where("code","==",code)))).docs.map(d=>({...d.data(),id:d.id}));
// Admin: change some fields of an asset (assign / return / status ...) and log it
export const updateAsset=async(code,patch,action,detail)=>{await updateDoc(doc(db,"assets",code),patch);await audit(action,code,detail)};
// ---- Stock audits (admin) ----
const scol=collection(db,"stockaudits");
export const saveStockAudit=o=>setDoc(doc(scol),o);
export const newSAId=()=>doc(scol).id;
export const putStockAudit=(id,o)=>setDoc(doc(scol,id),o);
export const delStockAudit=id=>deleteDoc(doc(scol,id));
export const watchStockAudits=(ok,err)=>onSnapshot(query(scol,orderBy("at","desc"),limit(50)),s=>ok(s.docs.map(d=>({...d.data(),id:d.id}))),err);
export async function save(o,isNew){
  let code=o.code;
  if(isNew){const m=/^(.*-)(\d+)$/.exec(code);if(m){let n=+m[2];while((await getDoc(doc(db,"assets",code))).exists()){n++;code=m[1]+String(n).padStart(4,"0")}}}
  let before=null;if(!isNew){try{const s=await getDoc(doc(db,"assets",code));if(s.exists())before=s.data()}catch(e){}}
  const d={...o,code};if(before&&before.assigned&&!d.assigned)d.assigned=before.assigned;
  await setDoc(doc(db,"assets",code),d);
  audit(before?"asset.edit":"asset.add",code,before?(diffText(before,d)||"Saved (no change)"):"Added "+[d.type,d.model].filter(Boolean).join(" ")+" at "+[d.loc,d.aloc].filter(Boolean).join(" / "));return d}
export const remove=async c=>{let s="";try{const x=await getDoc(doc(db,"assets",c));if(x.exists()){const d=x.data();s=[d.type,d.model,d.sn&&"SN "+d.sn,d.loc,d.usr].filter(Boolean).join(" | ")}}catch(e){}
  await deleteDoc(doc(db,"assets",c));audit("asset.delete",c,"Deleted: "+s)};
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
export const removeBranch=(co,b)=>setDoc(cfgRef,{[co]:arrayRemove(b)},{merge:true});

// ---- Asset codes without listing all assets (counters = "last number used" hint, never trusted blindly) ----
const cid=p=>String(p).slice(0,5);                       // "SK-DT-" -> "SK-DT"
async function hint(p){try{const s=await getDoc(doc(db,"counters",cid(p)));return s.exists()?(+s.data().n||0):0}catch(e){return 0}}
export async function nextFree(p){let n=await hint(p);
  for(let i=0;i<500;i++){n++;const c=p+String(n).padStart(4,"0");if(!(await getDoc(doc(db,"assets",c))).exists())return c}
  throw new Error("No free asset code found")}
// Add-only user: create ONE new asset. If the code was taken meanwhile, pick the next free one and retry.
export async function createAsset(o){let code=o.code,last;
  for(let t=0;t<4;t++){const p=code.slice(0,6),num=parseInt(code.slice(6),10),b=writeBatch(db);
    b.set(doc(db,"assets",code),{...o,code});
    if(num>await hint(p))b.set(doc(db,"counters",cid(p)),{n:num});
    try{await b.commit();audit("asset.add",code,"Added "+[o.type,o.model].filter(Boolean).join(" ")+" at "+[o.loc,o.aloc].filter(Boolean).join(" / "));return{...o,code}}catch(e){last=e;code=await nextFree(p)}}
  throw last}
// Add-only user: create many NEW assets (items = [{p:"SK-DT-",o:asset}]); codes are allotted here. Returns the codes.
export async function bulkCreate(items){const cur={};
  for(const it of items){const p=it.p;if(cur[p]===undefined)cur[p]=await hint(p);it.code="";
    for(let i=0;i<500&&!it.code;i++){cur[p]++;const c=p+String(cur[p]).padStart(4,"0");if(!(await getDoc(doc(db,"assets",c))).exists())it.code=c}
    if(!it.code)throw new Error("No free asset code found")}
  for(let i=0;i<items.length;i+=400){const b=writeBatch(db);items.slice(i,i+400).forEach(it=>b.set(doc(db,"assets",it.code),{...it.o,code:it.code}));await b.commit()}
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
