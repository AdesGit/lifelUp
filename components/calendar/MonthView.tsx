"use client";

import { Doc } from "@/convex/_generated/dataModel";
import EventChip from "./EventChip";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface MonthViewProps {
  events: TodoWithUser[];
  currentMonth: Date;
  userIndexMap: Map<string, number>;
  onDrop: (todoId: string, newDueAt: number) => void;
  onClickEvent: (todo: TodoWithUser) => void;
  onClickSlot: (date: Date) => void;
}

function getMonthGrid(month: Date): Date[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  // ISO week: Monday=0
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const grid: Date[] = [];
  for (let i = -startOffset; i < 42 - startOffset; i++) {
    grid.push(new Date(year, m, 1 + i));
  }
  return grid;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function MonthView({ events, currentMonth, userIndexMap, onDrop, onClickEvent, onClickSlot }: MonthViewProps) {
  const grid = getMonthGrid(currentMonth);
  const today = new Date();

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, date: Date) {
    e.preventDefault();
    const todoId = e.dataTransfer.getData("todoId");
    if (!todoId) return;
    // Use noon on the target date
    const newDueAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0).getTime();
    onDrop(todoId, newDueAt);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
            {d}
          </div>
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: "repeat(6, minmax(80px, 1fr))" }}>
        {grid.map((date, idx) => {
          const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
          const isToday = isSameDay(date, today);
          const dayEvents = events.filter((e) => e.dueAt != null && isSameDay(new Date(e.dueAt), date));

          return (
            <div
              key={idx}
              onClick={() => onClickSlot(date)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, date)}
              className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${!isCurrentMonth ? "opacity-40" : ""}`}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-400"}`}>
                {date.getDate()}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((todo) => (
                  <EventChip
                    key={todo._id}
                    todo={todo}
                    userIndex={userIndexMap.get(String(todo.userId)) ?? 0}
                    onClick={onClickEvent}
                    compact
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-gray-400 pl-1">+{dayEvents.length - 3} autres</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
