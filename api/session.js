import {db,configured,hashCode,sign,setCookie,actor,fail} from '../lib/server.js';
export default async function handler(req,res){if(!configured())return fail(res,'The app needs Supabase configuration before sign-in is available.',503);try{
 if(req.method==='GET'){const user=await actor(req);return res.status(200).json({user})}
 if(req.method!=='POST')return fail(res,'Method not allowed',405);
 const {action,email,password,code}=req.body||{};
 if(action==='logout'){setCookie(res,'',0);return res.status(200).json({user:null})}
 const client=db();let user;
 if(action==='admin'){if(!email||!password||email.toLowerCase()!==process.env.ADMIN_EMAIL?.toLowerCase())return fail(res,'Invalid credentials',401);const {data,error}=await client.auth.signInWithPassword({email,password});if(error||!data.user)return fail(res,'Invalid credentials',401);user={id:data.user.id,role:'admin',name:'Hanin',group:'general'}}
 else if(action==='student'){if(typeof code!=='string'||code.length<4||code.length>32)return fail(res,'Invalid student code',401);const {data}=await client.from('students').select('id,name,group_id,groups(grade_level)').eq('code_hash',hashCode(code)).eq('active',true).single();if(!data)return fail(res,'Invalid student code',401);user={id:data.id,role:'student',name:data.name,group:data.groups?.grade_level,groupId:data.group_id}}
 else return fail(res,'Invalid action',400);
 setCookie(res,sign({id:user.id,role:user.role}));return res.status(200).json({user});
 }catch(e){console.error(e);return fail(res,e)}}
