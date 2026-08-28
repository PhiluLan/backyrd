import { ChatExperience } from "@/components/consumer/chat-experience";
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChatExperience chatId={id} />;
}
