import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandSchema,taskSchema,snapshotSchema} from '../src/lib/cloud-model.ts';
import {plannedBlockSchema} from '../src/lib/calendar.ts';
const workspace='custom:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const task={id:'research',title:'Read papers',workspace,due:'',start:'',focus:'',priority:'Medium',done:false,repeat:'None'};
test('new workspaces validate consistently in create, rename, tasks, and schedules',()=>{
 assert.equal(commandSchema.parse({type:'create-workspace',workspace,name:' Research '}).name,'Research');
 assert.equal(commandSchema.safeParse({type:'create-workspace',workspace:'University 01',name:'Overwrite'}).success,false);
 assert.equal(commandSchema.safeParse({type:'create-workspace',workspace,name:' '}).success,false);
 assert.equal(commandSchema.safeParse({type:'create-workspace',workspace,name:'x'.repeat(51)}).success,false);
 assert.equal(commandSchema.safeParse({type:'rename-workspace',workspace,name:'Projects',expectedVersion:1}).success,true);
 assert.equal(taskSchema.parse(task).workspace,workspace);
 assert.equal(taskSchema.safeParse({...task,workspace:'unknown'}).success,false);
 const block={id:crypto.randomUUID(),workspace,task:{id:task.id,title:task.title},origin:'task',start:Date.now(),end:Date.now()+3600000,timeZone:'Asia/Colombo',repeat:{frequency:'none',weekdays:[],until:null}};
 assert.equal(plannedBlockSchema.parse(block).workspace,workspace);
 assert.equal(snapshotSchema.parse({tasks:[task],versions:{research:1},playerName:'User',workspaceIds:[workspace],workspaceLabels:{[workspace]:'Research'}}).workspaceIds[0],workspace);
});
