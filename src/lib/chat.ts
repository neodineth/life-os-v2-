import { z } from "zod";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const chatMessageSchema = z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(12000) }).strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export const chatRequestSchema = z.object({ messages: z.array(chatMessageSchema).min(1).max(21), includeTasks: z.boolean() }).strict().superRefine(({ messages }, context) => {
  if (messages.some((message, i) => message.role !== (i % 2 ? "assistant" : "user")) || messages.at(-1)?.role !== "user") context.addIssue({ code: "custom", message: "Start a new chat and try again." });
  if (messages.some(message => message.role === "user" && message.text.length > 4000) || messages.reduce((sum, message) => sum + message.text.length, 0) > 24000) context.addIssue({ code: "custom", message: "This conversation is too long. Start a new chat." });
});

export function nextChatMessages(history: ChatMessage[], text: string): ChatMessage[] {
  const messages = [...history.slice(-16), { role: "user" as const, text: text.trim() }];
  while (messages.length > 1 && messages.reduce((sum, item) => sum + item.text.length, 0) > 24000) messages.splice(0, 2);
  return messages;
}
