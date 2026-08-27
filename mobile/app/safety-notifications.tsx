import { Ionicons } from "@expo/vector-icons";
import { Stack,useRouter } from "expo-router";
import React,{useCallback,useState} from "react";
import {Pressable,RefreshControl,ScrollView,StyleSheet,Text,View} from "react-native";
import {useFocusEffect} from "@react-navigation/native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {supabase} from "../lib/supabase";
import {StateView} from "../components/foundation/StateView";

type Notice={notice_id:string;notice_type:string;title:string;body:string;
action_label:string|null;action_path:string|null;read_at:string|null;created_at:string};
type Status={active?:{id:string;type:string;public_explanation:string;ends_at:string|null}[];
active_strikes?:number};

export default function SafetyNotifications(){
 const router=useRouter(),insets=useSafeAreaInsets();
 const [notices,setNotices]=useState<Notice[]>([]),[status,setStatus]=useState<Status|null>(null);
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");

 const load=useCallback(async(refresh=false)=>{
  if(refresh)setRefreshing(true);else setLoading(true);
  setError("");
  const [n,s]=await Promise.all([
   supabase.rpc("safety_my_notices_v1",{p_limit:200}),
   supabase.rpc("safety_my_account_status_v1")
  ]);
  if(n.error||s.error)setError("Deine Mitteilungen konnten gerade nicht geladen werden.");
  else{setNotices((n.data??[]) as Notice[]);setStatus((s.data??{}) as Status);}
  setLoading(false);setRefreshing(false);
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));

 async function open(n:Notice){
  if(!n.read_at)await supabase.rpc("safety_mark_notice_read_v1",{p_notice_id:n.notice_id});
  if(n.action_path)router.push(n.action_path as never);else await load(true);
 }

 return <View style={st.root}><Stack.Screen options={{headerShown:false}}/>
  <View style={[st.header,{paddingTop:insets.top+10}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Zurück zu Sicherheit und Support" onPress={()=>router.back()} style={st.back}><Ionicons accessibilityElementsHidden name="chevron-back" size={22} color="#fff"/></Pressable>
   <View><Text style={st.eyebrow}>SICHERHEIT & SUPPORT</Text><Text style={st.title}>Mitteilungen</Text></View>
  </View>
  {loading?<StateView kind="loading" title="Mitteilungen werden geladen"/>:
  <ScrollView contentContainerStyle={[st.content,{paddingBottom:insets.bottom+40}]}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor="#FF4F91"/>}>
   {error?<StateView kind="error" title="Mitteilungen nicht geladen" message={error} actionLabel="Noch einmal versuchen" onAction={()=>void load()}/>:null}
   {(status?.active?.length??0)>0?<View style={st.status}>
    <Ionicons accessibilityElementsHidden name="warning-outline" size={24} color="#FFBA62"/>
    <Text style={{color:"#fff",flex:1}}>{status?.active?.length} aktive {status?.active?.length===1?"Maßnahme":"Maßnahmen"}
     {Number(status?.active_strikes??0)>0?` · ${status?.active_strikes} ${status?.active_strikes===1?"Verwarnung":"Verwarnungen"}`:""}</Text>
   </View>:null}
   {notices.length===0&&!error?<StateView kind="empty" title="Keine Sicherheitsmitteilungen" message="Entscheidungen, Einsprüche und Kontomaßnahmen erscheinen hier."/>:null}
   {notices.map(n=><Pressable accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}`} accessibilityHint={n.action_label??"Details öffnen"} key={n.notice_id} onPress={()=>void open(n)}
    style={[st.card,!n.read_at&&st.unread]}>
    <View style={st.icon}><Ionicons accessibilityElementsHidden name={n.notice_type.includes("appeal")?"checkmark-circle-outline":"shield-checkmark-outline"} size={22} color="#FF4F91"/></View>
    <View style={{flex:1}}><Text style={st.cardTitle}>{n.title}</Text><Text style={st.muted}>{n.body}</Text>
    <Text style={st.date}>{new Date(n.created_at).toLocaleString("de-CH")}</Text>
    {n.action_label?<Text style={st.action}>{n.action_label} →</Text>:null}</View>
   </Pressable>)}
  </ScrollView>}
 </View>;
}
const st=StyleSheet.create({
 root:{flex:1,backgroundColor:"#050506"},header:{paddingHorizontal:18,paddingBottom:16,flexDirection:"row",gap:12,alignItems:"center"},
 back:{width:42,height:42,borderRadius:21,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(255,255,255,.06)"},
 eyebrow:{color:"#FF4F91",fontSize:11,fontWeight:"900",letterSpacing:1.2},title:{color:"#fff",fontSize:28,fontWeight:"900"},
 center:{flex:1,alignItems:"center",justifyContent:"center"},content:{padding:18,gap:12},
 status:{padding:17,borderRadius:18,flexDirection:"row",gap:12,backgroundColor:"rgba(255,186,98,.08)"},
 muted:{color:"rgba(255,255,255,.62)",lineHeight:21},
 card:{padding:17,borderRadius:18,flexDirection:"row",gap:13,backgroundColor:"rgba(255,255,255,.035)",borderWidth:1,borderColor:"rgba(255,255,255,.08)"},
 unread:{backgroundColor:"rgba(255,79,139,.075)",borderColor:"rgba(255,79,139,.2)"},
 icon:{width:43,height:43,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(255,79,139,.1)"},
 cardTitle:{color:"#fff",fontSize:16,fontWeight:"800",marginBottom:6},date:{color:"rgba(255,255,255,.38)",fontSize:12,marginTop:8},
 action:{color:"#FF4F91",fontSize:13,fontWeight:"800",marginTop:9}
});
