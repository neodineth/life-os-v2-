import { z } from "zod";
export const treeSchema = z.object({ format: z.literal(1), rootId: z.string().uuid(), nodes: z.array(z.object({ id:z.string().uuid(), parentId:z.string().uuid().nullable(), children:z.array(z.string().uuid()).max(1000), name:z.string().trim().min(1).max(120), notes:z.string().max(20000), collapsed:z.boolean() }).strict()).min(1).max(1000) }).strict().superRefine((doc,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:"custom",message});
 if(new TextEncoder().encode(JSON.stringify(doc)).length>9000000) fail("Tree document is too large. Keep it below 9 MB by shortening notes.");
 const map=new Map(doc.nodes.map(n=>[n.id,n]));
 if(map.size!==doc.nodes.length) {fail("Duplicate node IDs.");return;}
 const root=map.get(doc.rootId); if(!root||root.parentId!==null) {fail("A single root is required.");return;}
 const seen=new Set<string>();
 function visit(id:string,depth:number,parent:string|null) {
  if(depth>30) {fail("Trees are limited to 30 levels.");return;}
  const node=map.get(id);
  if(!node||node.parentId!==parent||seen.has(id)) {fail("Invalid parents, duplicate children, or a cycle.");return;}
  seen.add(id); node.children.forEach(child=>visit(child,depth+1,id));
 }
 visit(doc.rootId,1,null); if(seen.size!==doc.nodes.length) fail("Every node must belong to the root tree.");
});
export type TreeDocument=z.infer<typeof treeSchema>;
export type TreeNode=TreeDocument["nodes"][number];
export function exampleTree():TreeDocument {
 const nodes:TreeNode[]=[];
 const add=(name:string,parentId:string|null)=>{const node={id:crypto.randomUUID(),parentId,children:[] as string[],name,notes:"",collapsed:false};nodes.push(node);if(parentId) nodes.find(n=>n.id===parentId)!.children.push(node.id);return node.id;};
 const rootId=add("Dineth",null),university=add("University",rootId),semester=add("Semester 1",university),moduleId=add("Module 1",semester),assignment=add("Assignment 1",moduleId);
 add("Formative submission",assignment);add("Summative submission",assignment);add("Semester 2",university);
 return {format:1,rootId,nodes};
}
export function addTreeNode(doc:TreeDocument,parentId:string):TreeDocument {
 const next=structuredClone(doc),parent=next.nodes.find(n=>n.id===parentId)!;
 const node={id:crypto.randomUUID(),parentId,children:[],name:"New node",notes:"",collapsed:false};parent.children.push(node.id);parent.collapsed=false;next.nodes.push(node);
 return treeSchema.parse(next);
}
export function deleteTreeBranch(doc:TreeDocument,id:string):TreeDocument {
 if(id===doc.rootId) throw new Error("The root cannot be deleted.");
 const removed=new Set<string>(); const map=new Map(doc.nodes.map(n=>[n.id,n]));
 function remove(key:string) {removed.add(key);map.get(key)!.children.forEach(remove);} remove(id);
 return {...doc,nodes:doc.nodes.filter(n=>!removed.has(n.id)).map(n=>({...n,children:n.children.filter(c=>!removed.has(c))}))};
}
export function treeLayout(doc:TreeDocument) {
 const map=new Map(doc.nodes.map(n=>[n.id,n])),widths=new Map<string,number>();
 const width=(id:string):number=>{const n=map.get(id)!;const w=n.collapsed||!n.children.length?220:Math.max(220,n.children.reduce((s,c)=>s+width(c),0)+32*(n.children.length-1));widths.set(id,w);return w;};
 width(doc.rootId); const positions:{node:TreeNode;x:number;y:number}[]=[];
 function place(id:string,left:number,depth:number) {const n=map.get(id)!;positions.push({node:n,x:left+widths.get(id)!/2-110,y:depth*132});let cursor=left;if(!n.collapsed) n.children.forEach(c=>{place(c,cursor,depth+1);cursor+=widths.get(c)!+32;});}
 place(doc.rootId,0,0);return positions;
}
