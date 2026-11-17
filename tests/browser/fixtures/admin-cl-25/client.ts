type Input={table:string;operation:string;payload?:unknown;filters:{kind:string;column:string;value:unknown}[]};
function query(table:string){const input:Input={table,operation:"select",filters:[]};let proxy:any;proxy=new Proxy({}, {get(_target,key){
 if(key==="then")return(resolve:any,reject:any)=>fetch("/__cl25__/data",{method:"POST",body:JSON.stringify(input)}).then(r=>r.json()).then(resolve,reject);
 return(...args:any[])=>{if(["upsert","insert","delete"].includes(String(key))){input.operation=String(key);input.payload=args[0];}if(["in","eq"].includes(String(key)))input.filters.push({kind:String(key),column:args[0],value:args[1]});return proxy;};
}});return proxy;}
export function createClient(){return{from:query,storage:{from:()=>({upload:async(path:string,file:File)=>{const result=await fetch("/__cl25__/upload",{method:"POST",body:JSON.stringify({path,name:file.name})});return result.json();},getPublicUrl:(path:string)=>({data:{publicUrl:"/logos/"+path}}),remove:async(paths:string[])=>{const response=await fetch("/__cl25__/cleanup",{method:"POST",body:JSON.stringify(paths)});return response.json();}})}};}
