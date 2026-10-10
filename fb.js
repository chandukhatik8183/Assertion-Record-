// Firebase adapter: paste your own Firebase web config below.
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,setDoc,deleteDoc,onSnapshot,writeBatch,updateDoc,arrayUnion} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCn8SG8bRCUekJ7KOOQKYyBnIbhGim7wk0",
  authDomain: "assertion-record.firebaseapp.com",
  projectId: "assertion-record",
  storageBucket: "assertion-record.firebasestorage.app",
  messagingSenderId: "454128517792",
  appId: "1:454128517792:web:a0b3b8dba55e29a829bfc5"
};

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),col=collection(db,"assets");
export const login=(e,p)=>signInWithEmailAndPassword(auth,e,p);
export const logout=()=>signOut(auth);
export const onAuth=cb=>onAuthStateChanged(auth,cb);
export const watch=(ok,err)=>onSnapshot(col,s=>ok(s.docs.map(d=>({...d.data(),code:d.id}))),err);
export const getOne=async c=>{const s=await getDoc(doc(db,"assets",c));return s.exists()?{...s.data(),code:s.id}:null};
export async function save(o,isNew){
  let code=o.code;
  if(isNew){const m=/^(.*-)(\d+)$/.exec(code);if(m){let n=+m[2];while((await getDoc(doc(db,"assets",code))).exists()){n++;code=m[1]+String(n).padStart(4,"0")}}}
  const d={...o,code};await setDoc(doc(db,"assets",code),d);return d}
export const remove=c=>deleteDoc(doc(db,"assets",c));
export async function restore(list){
  for(let i=0;i<list.length;i+=400){const b=writeBatch(db);
    list.slice(i,i+400).forEach(x=>{const c=String(x.code).toUpperCase();b.set(doc(db,"assets",c),{...x,code:c})});await b.commit()}}

// ---- Support tickets ----
export const createTicket=async t=>{await setDoc(doc(db,"tickets",t.id),t);return t.id};
export const getTicket=async id=>{const s=await getDoc(doc(db,"tickets",id));return s.exists()?{...s.data(),id:s.id}:null};
export const watchTickets=(ok,err)=>onSnapshot(collection(db,"tickets"),s=>ok(s.docs.map(d=>({...d.data(),id:d.id}))),err);
export const updateTicket=(id,patch)=>updateDoc(doc(db,"tickets",id),patch);
export const removeTicket=id=>deleteDoc(doc(db,"tickets",id));
export const watchTicket=(id,ok,err)=>onSnapshot(doc(db,"tickets",id),s=>ok(s.exists()?{...s.data(),id:s.id}:null),err);
export const actTicket=(id,status,notes,entry)=>updateDoc(doc(db,"tickets",id),{status,notes,updated:Date.now(),history:arrayUnion(entry)});
