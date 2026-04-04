"use client";

import { Doc } from "@/convex/_generated/dataModel";
import EventChip from "./EventChip";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

interface DayViewProps {
  events: TodoWithUser[];
  currentDay: Date;
  userIndexMap: Map<string, number>;
  onDrop: (todoId: string, newDueAt: number) => void;
  onClickEvent: (todo: TodoWithUser) => void;
  onClickSlot: (date: Date) => void;
}

function isSameDayAndHour(ts: number, date: Date, hour: number): boolean {
  const d = new Date(ts);
  return d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate() &&
    d.getHours() === hour;
}

export default function DayView({ events, currentDay, userIndexMap, onDrop, onClickEvent, onClickSlot }: DayViewProps) {
  const dayLabel = `${DAYS_FR[currentDay.getDay()]} ${currentDay.getDate()} ${MONTHS_FR[currentDay.getMonth()]} ${currentDay.getFullYear()}`;

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, hour: number) {
    e.preventDefault();
    const todoId = e.dataTransfer.getData("todoId");
    if (!todoId) return;
    const newDueAt = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), hour, 0).getTime();
    onDrop(todoId, newDueAt);
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Day header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{dayLabel}</h3>
      </div>
      {/* Hour slots */}
      <div className="flex-1">
        {HOURS.map((hour) => {
          const slotEvents = events.filter((ev) => ev.dueAt != null && isSameDayAndHour(ev.dueAt, currentDay, hour));
          return (
            <div
              key={hour}
              className="flex border-b border-gray-50 dark:border-gray-800/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              style={{ minHeight: "60px" }}
              onClick={() => onClickSlot(new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), hour, 0))}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, hour)}
            >
              <div className="w-12 text-right pr-3 text-xs text-gray-400 pt-1 flex-shrink-0">
                {hour === 0 ? "" : `${hour}h`}
              </div>
              <div className="flex-1 py-1 pr-2 flex flex-col gap-1">
                {slotEvents.map((ev) => (
                  <EventChip key={ev._id} todo={ev} userIndex={userIndexMap.get(String(ev.userId)) ?? 0} onClick={onClickEvent} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
