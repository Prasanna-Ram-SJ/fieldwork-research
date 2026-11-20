import {Workspace} from '@/components/Workspace';
export default async function Chat({params}:{params:Promise<{conversationId:string}>}){return <Workspace initialId={(await params).conversationId}/>}
