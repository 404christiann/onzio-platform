import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic(loader:()=>Promise<{default:ComponentType<any>}>,options?:{loading?:ComponentType}){const Component=lazy(loader);const Loading=options?.loading;return function Dynamic(props:any){return <Suspense fallback={Loading?<Loading/>:null}><Component {...props}/></Suspense>;};}
