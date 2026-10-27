"use client";

import { useState } from "react";
import { ResearchInbox } from "./ResearchInbox";
import type { ProductAdminSpotSearch } from "@backyrd/world-knowledge-authoring-ui";
import "@backyrd/world-knowledge-authoring-ui/styles.css";
import { supabase } from "@/lib/supabaseClient";
import { authorizedWorldResearchTasks, authorizedWorldKnowledgeSpotSearch, authorizedWorldResearchBatchPost, authorizedWorldResearchPipelinePost, authorizedWorldResearchDrafts, authorizedWorldResearchJobs, authorizedWorldResearchQueue } from "@/lib/worldKnowledgeSession";
import { WorldResearchBatchPanel } from "./WorldResearchBatchPanel";

const searchSpots = (query: string) => authorizedWorldKnowledgeSpotSearch({ auth: supabase.auth, query }) as Promise<ProductAdminSpotSearch>;

const tasks=(body?:unknown)=>authorizedWorldResearchTasks({auth:supabase.auth,body});
const post=(body:unknown)=>authorizedWorldResearchBatchPost({auth:supabase.auth,body});
export default function AdminSpotResearchPage() {
  const [tools,setTools]=useState(false);
  if(!tools)return <ResearchInbox request={tasks} post={post} onTools={()=>setTools(true)}/>;
  return <><div style={{maxWidth:880,margin:"24px auto",padding:"0 24px"}}><button onClick={()=>setTools(false)} style={{minHeight:48,color:"#ff84b9",fontSize:18}}>← Zurück zu meinen Aufgaben</button></div><WorldResearchBatchPanel inboxManaged search={searchSpots} queue={(page) => authorizedWorldResearchQueue({ auth: supabase.auth, page })} post={(body) => authorizedWorldResearchBatchPost({ auth: supabase.auth, body })}
    pipeline={(body)=>authorizedWorldResearchPipelinePost({auth:supabase.auth,body})}
    jobsGet={(jobId) => authorizedWorldResearchJobs({ auth: supabase.auth, jobId })}
    jobsStart={(spotIds) => authorizedWorldResearchJobs({ auth: supabase.auth, spotIds })}
    draftsGet={(draftId, view) => authorizedWorldResearchDrafts({ auth: supabase.auth, draftId, view })}
    draftsSave={(report) => authorizedWorldResearchDrafts({ auth: supabase.auth, report })} /></>;
}
