"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { exampleTree, treeSchema, type TreeDocument } from "@/lib/tree";
type Draft={document:TreeDocument;version:number;mutationId:string;dirty:boolean};
export function useTree(userId:string) {
 const key=`lifeos.tree.${userId}`;
 const [draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(""),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const current=useRef<Draft|null>(null),saving=useRef(false),alive=useRef(true);
 const persist=useCallback((next:Draft)=>{current.current=next;setDraft(next);try {localStorage.setItem(key,JSON.stringify(next));} catch {setError("Browser backup could not be saved. Export your tree before closing this page.");}},[key]);
 const request=useCallback(async(body?:Draft)=>{
  const response=await fetch("/api/tree",{method:body?"POST":"GET",cache:"no-store",headers:{"x-lifeos-account":userId,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify({document:body.document,expectedVersion:body.version,mutationId:body.mutationId})}:{})});
  const result=await response.json(); if(!response.ok) throw Object.assign(new Error(result.error||"Tree request failed."),{code:result.code});
  return {document:result.document?treeSchema.parse(result.document):null,version:result.version as number};
 },[userId]);
 const load=useCallback(async(discard=false)=>{
  setBusy(true);setError("");setReady(false);
  try {
   const remote=await request();if(!alive.current)return;
   const local=current.current;
   if(local?.dirty&&!discard) {
    if(JSON.stringify(remote.document)===JSON.stringify(local.document)) persist({...local,version:remote.version,dirty:false});
    else if(remote.version!==local.version) throw new Error("Tree changed on another device. Export your draft, then use Load cloud tree to resolve the conflict.");
   } else persist({document:remote.document||exampleTree(),version:remote.version,dirty:!remote.document,mutationId:crypto.randomUUID()});
   setReady(true);
  }catch(e){if(!alive.current)return;setError((e as Error).message);if((e as {code?:string}).code==="tree_setup"&&!current.current)persist({document:exampleTree(),version:0,mutationId:crypto.randomUUID(),dirty:true});}
  finally {if(alive.current)setBusy(false);}
 },[request,persist]);
 useEffect(()=>{
  alive.current=true;
  try {const raw=localStorage.getItem(key);if(raw){const cached=JSON.parse(raw);const document=treeSchema.parse(cached.document);if(!Number.isSafeInteger(cached.version)||cached.version<0||typeof cached.dirty!=="boolean"||typeof cached.mutationId!=="string")throw new Error("Invalid draft");current.current={...cached,document};setTimeout(()=>{if(alive.current)setDraft(current.current);},0);}}
  catch {setTimeout(()=>setError("The browser tree backup is unreadable. It has not been replaced. Use Load cloud tree to recover."),0);return;}
  const timer=setTimeout(()=>void load(),0);
  return ()=>{alive.current=false;clearTimeout(timer);};
 },[key,load]);
 const save=useCallback(async()=>{
  const snapshot=current.current;if(!snapshot?.dirty||saving.current)return;saving.current=true;setBusy(true);
  try {const remote=await request(snapshot);if(!alive.current)return;const latest=current.current!;persist({...latest,version:remote.version,dirty:latest.mutationId!==snapshot.mutationId});setError("");}
  catch(e){if(alive.current){setReady(false);setError((e as Error).message);}}
  finally{saving.current=false;if(alive.current)setBusy(false);}
 },[persist,request]);
 useEffect(()=>{if(!draft?.dirty||!ready||busy||error)return;const id=setTimeout(()=>void save(),750);return()=>clearTimeout(id);},[draft,ready,busy,error,save]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(current.current?.dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[]);
 const update=(document:TreeDocument)=>{const next=treeSchema.parse(document);persist({document:next,version:current.current?.version||0,mutationId:crypto.randomUUID(),dirty:true});};
 return {document:draft?.document||null,error,busy,dirty:draft?.dirty,update,retry:()=>load(),reload:()=>load(true)};
}
