import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exampleTree,treeSchema,addTreeNode,deleteTreeBranch,treeLayout} from '../src/lib/tree.ts';
test('example, editing order, deleting descendants and round trip',()=>{
 const initial=exampleTree();assert.equal(initial.nodes.length,8);treeSchema.parse(initial);
 const added=addTreeNode(initial,initial.rootId);assert.equal(added.nodes.length,9);assert.equal(initial.nodes.length,8);
 assert.equal(added.nodes[0].children.at(-1),added.nodes.at(-1).id);
 assert.deepEqual(treeSchema.parse(JSON.parse(JSON.stringify(added))),added);
 const university=initial.nodes.find(n=>n.name==='University');assert.equal(deleteTreeBranch(initial,university.id).nodes.length,1);
 assert.throws(()=>deleteTreeBranch(initial,initial.rootId));
});
test('invalid imports and depth limits are rejected',()=>{
 const doc=exampleTree();assert.equal(treeSchema.safeParse({...doc,nodes:[...doc.nodes,doc.nodes[0]]}).success,false);
 const cycle=structuredClone(doc);cycle.nodes[0].children.push(doc.rootId);assert.equal(treeSchema.safeParse(cycle).success,false);
 const missing=structuredClone(doc);missing.nodes[1].parentId=crypto.randomUUID();assert.equal(treeSchema.safeParse(missing).success,false);
 let deep={...doc,nodes:[{...doc.nodes[0],children:[]}]};for(let i=1;i<30;i++)deep=addTreeNode(deep,deep.nodes.at(-1).id);
 assert.throws(()=>addTreeNode(deep,deep.nodes.at(-1).id));
});
test('layout has no overlapping visible cards and collapse hides descendants',()=>{
 const doc=exampleTree(),positions=treeLayout(doc);
 for(const a of positions)for(const b of positions)if(a!==b&&a.y===b.y)assert.ok(a.x+220<=b.x||b.x+220<=a.x);
 doc.nodes[0].collapsed=true;assert.equal(treeLayout(doc).length,1);
});

test('name, notes and node limits reject excessive input',()=>{
 const doc=exampleTree();
 const invalid=structuredClone(doc);invalid.nodes[0].name=' ';assert.equal(treeSchema.safeParse(invalid).success,false);
 invalid.nodes[0].name='x'.repeat(121);assert.equal(treeSchema.safeParse(invalid).success,false);
 invalid.nodes[0].name='Valid';invalid.nodes[0].notes='x'.repeat(20001);assert.equal(treeSchema.safeParse(invalid).success,false);
 let wide={...doc,nodes:[{...doc.nodes[0],children:[]}]};
 for(let i=1;i<1000;i++){const id=crypto.randomUUID();wide.nodes[0].children.push(id);wide.nodes.push({id,parentId:wide.rootId,children:[],name:'Child '+i,notes:'',collapsed:false});}
 treeSchema.parse(wide);assert.equal(treeLayout(wide).length,1000);assert.throws(()=>addTreeNode(wide,wide.rootId));
});
