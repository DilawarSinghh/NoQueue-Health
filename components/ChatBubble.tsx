"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ChatBubble — AI messages left (frosted white), user messages right (teal).
// Subtle 200ms fade/slide entrance per spec §5.
export function ChatBubble({
  role,
  children,
}: {
  role: "ai" | "user";
  children?: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed shadow-sm",
          isUser
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-white/50 bg-white/85 text-foreground backdrop-blur-sm"
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

