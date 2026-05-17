"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-sm max-w-none",
        "[&_p]:my-2 [&_p]:leading-relaxed [&_p]:text-ink-300",
        "[&_strong]:text-ink-50 [&_strong]:font-semibold",
        "[&_em]:text-ink-50",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_li]:text-ink-300",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_code]:bg-pitch-700 [&_code]:text-flood-300 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono",
        "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1",
        "[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2",
        "[&_a]:text-turf-300 [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-turf-400 [&_blockquote]:pl-3 [&_blockquote]:text-ink-300 [&_blockquote]:italic",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
