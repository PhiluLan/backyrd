import EventEditor from"../../EventEditor";export default async function Page({params}:{params:Promise<{id:string}>}){return <EventEditor eventId={(await params).id}/>}
