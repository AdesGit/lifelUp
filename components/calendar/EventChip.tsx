"use client";

import { Doc } from "@/convex/_generated/dataModel";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };

export const COLOR_PALETTE = [
  { bg: "bg-blue-500",   light: "bg-blue-200",   text: "text-blue-800"   },
  { bg: "bg-purple-500", light: "bg-purple-200", text: "text-purple-800" },
  { bg: "bg-green-500",  light: "bg-green-200",  text: "text-green-800"  },
  { bg: "bg-orange-500", light: "bg-orange-200", text: "text-orange-800" },
  { bg: "bg-pink-500",   light: "bg-pink-200",   text: "text-pink-800"   },
];

interface EventChipProps {
  todo: TodoWithUser;
  userIndex: number;
  onClick: (todo: TodoWithUser) => void;
  compact?: boolean;
}

export default function EventChip({ todo, userIndex, onClick, compact = false }: EventChipProps) {
  const colors = COLOR_PALETTE[userIndex % COLOR_PALETTE.length];
  const hasGcal = !!todo.gcalEventId;
  const bgClass = hasGcal ? colors.bg : colors.light;
  const textClass = hasGcal ? "text-white" : colors.text;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("todoId", todo._id);
    e.dataTransfer.setData("originalDueAt", String(todo.dueAt ?? 0));
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => { e.stopPropagation(); onClick(todo); }}
      className={`${bgClass} ${textClass} ${compact ? "text-[10px] px-1 py-0.5" : "text-xs px-1.5 py-0.5"} rounded truncate cursor-pointer hover:opacity-80 transition-opacity`}
      title={todo.text}
    >
      {todo.text}
    </div>
  );
}
