"use client";

import { Doc } from "@/convex/_generated/dataModel";
import EventChip from "./EventChip";

type TodoWithUser = Doc<"todos"> & { user: Doc<"users"> | null };

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface WeekViewProps {
  events: TodoWithUser[];
  currentWeek: Date;
  userIndexMap: Map<string, number>;
  onDrop: (todoId: string, newDueAt: number) => void;
  onClickEvent: (todo: TodoWithUser) => void;
  onClickSlot: (date: Date) => void;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function isSameDayAndHour(ts: number, date: Date, hour: number): boolean {
  const d = new Date(ts);
  return d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate() &&
    d.getHours() === hour;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateLabel(date: Date): string {
  return `${DAY_LABELS_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1]} ${date.getDate()}`;
}

export default function WeekView({ events, currentWeek, userIndexMap, onDrop, onClickEvent, onClickSlot }: WeekViewProps) {
  const weekDays = getWeekDays(currentWeek);
  const today = new Date();

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, date: Date, hour: number) {
    e.preventDefault();
    const todoId = e.dataTransfer.getData("todoId");
    if (!todoId) return;
    const newDueAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0).getTime();
    onDrop(todoId, newDueAt);
  }

  // All-day events (no specific time, just date)
  function getAllDayEvents(date: Date) {
    return events.filter((ev) => {
      if (ev.dueAt == null) return false;
      const d = new Date(ev.dueAt);
      return isSameDay(d, date) && d.getHours() === 12 && d.getMinutes() === 0;
    });
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header row */}
      <div className="grid sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
        <div />
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          const allDay = getAllDayEvents(d);
          return (
            <div key={i} className="text-center py-2 border-l border-gray-100 dark:border-gray-800">
              <div className={`text-xs font-medium ${isToday ? "text-blue-600" : "text-gray-500"}`}>
                {formatDateLabel(d)}
              </div>
              <div className="flex flex-col gap-0.5 px-1 mt-1">
                {allDay.map((ev) => (
                  <EventChip key={ev._id} todo={ev} userIndex={userIndexMap.get(String(ev.userId)) ?? 0} onClick={onClickEvent} compact />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hour rows */}
      <div className="flex-1">
        {HOURS.map((hour) => (
          <div key={hour} className="grid border-b border-gray-50 dark:border-gray-800/50" style={{ gridTemplateColumns: "48px repeat(7, 1fr)", minHeight: "60px" }}>
            <div className="text-right pr-2 text-[10px] text-gray-400 pt-1">{hour === 0 ? "" : `${hour}h`}</div>
            {weekDays.map((d, di) => {
              const slotEvents = events.filter((ev) => ev.dueAt != null && isSameDayAndHour(ev.dueAt, d, hour));
              return (
                <div
                  key={di}
                  onClick={() => onClickSlot(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0))}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, d, hour)}
                  className="border-l border-gray-100 dark:border-gray-800 px-0.5 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  {slotEvents.map((ev) => (
                    <EventChip key={ev._id} todo={ev} userIndex={userIndexMap.get(String(ev.userId)) ?? 0} onClick={onClickEvent} compact />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
