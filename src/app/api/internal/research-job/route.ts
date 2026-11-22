import { getCloudflareContext } from '@opennextjs/cloudflare';
import { consumeResearchJobs } from '@/lib/hosting/job-consumer';
import { validQueueSignature, type JobEnvironment } from '@/lib/hosting/job-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Called in-process by the queue handler, never through an outbound HTTP
 * request. The public Worker blocks this path; the signature is defense in depth. */
export async function POST(request:Request){
 try{
  const id=request.headers.get('X-Research-Job')||'',time=Number(request.headers.get('X-Research-Time'));
  if(!validQueueSignature(id,time,request.headers.get('X-Research-Signature')||''))return new Response(null,{status:404});
  const {env}=await getCloudflareContext({async:true});
  await consumeResearchJobs({messages:[{body:{id},ack(){}}]},env as unknown as JobEnvironment);
  return new Response(null,{status:204});
 }catch{return new Response(null,{status:503});}
}
