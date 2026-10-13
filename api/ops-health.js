import { createClient } from '@supabase/supabase-js';

// Endpoint SOMENTE para administradores/gerentes autenticados.
// Responde contagens e status, nunca inclui payload, telefone ou textos da BR Whats.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'method_not_allowed'});
 }
 const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!secret)return res.status(503).json({error:'service_not_configured'});
 const auth=String(req.headers.authorization||'');
 if(!auth.startsWith('Bearer ')||auth.length>5000)return res.status(401).json({error:'authentication_required'});
 try{
  const supabase=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await supabase.auth.getUser(auth.slice(7));
  if(authError||!user)return res.status(401).json({error:'invalid_session'});
  const {data:profile,error:profileError}=await supabase.from('profiles').select('active,role').eq('id',user.id).maybeSingle();
  if(profileError||!profile?.active||!['admin','gerente'].includes(profile.role))return res.status(403).json({error:'forbidden'});
  const tableCount=async(table)=>{
   const {count,error}=await supabase.from(table).select('id',{count:'exact',head:true});
   return error?{available:false,count:null}:{available:true,count:count??0};
  };
  const [inbox,processed,sync_audit,config,last]=await Promise.all([
   tableCount('brwhats_webhook_inbox'),
   // Event PK differs from inbox: select valid column to count rows.
   supabase.from('brwhats_processed_events').select('event_id',{count:'exact',head:true}),
   tableCount('brwhats_sync_audit'),
   supabase.from('brwhats_automation_config').select('enabled').eq('singleton',true).maybeSingle(),
   supabase.from('brwhats_webhook_inbox').select('received_at').order('received_at',{ascending:false}).limit(1)
  ]);
  const result={
   service:'ivs-ops-health',
   checked_at:new Date().toISOString(),
   inbox,
   processed:processed.error?{available:false,count:null}:{available:true,count:processed.count??0},
   sync_audit,
   automation:config.error?{available:false,enabled:null}:{available:true,enabled:Boolean(config.data?.enabled)},
   last_received_at:last.error?null:last.data?.[0]?.received_at||null
  };
  return res.status(200).json(result);
 }catch(e){
  console.error('ops health failure',e?.name||'error');
  return res.status(503).json({error:'health_unavailable'});
 }
}