"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { CheckSquare2, Square, Trash2, Plus, Loader2 } from "lucide-react"
import { addChecklistItem, toggleChecklistItem, deleteChecklistItem } from "@/actions/checklist"

type Item = { id: string; description: string; completed: boolean }

export function Checklist({ orderId, items, readonly }: { orderId: string; items: Item[]; readonly?: boolean }) {
  const t = useTranslations("serviceOrdersComponents")
  const [newItem, setNewItem] = useState("")
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    const desc = newItem.trim()
    if (!desc) return
    setNewItem("")
    startTransition(() => addChecklistItem(orderId, desc))
  }

  const done = items.filter((i) => i.completed).length
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0

  return (
    <div className="space-y-3">
      {/* Progress */}
      {items.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("checklist.progressLabel", { done, total: items.length })}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 group">
            <button
              disabled={readonly}
              onClick={() => startTransition(() => toggleChecklistItem(item.id, !item.completed))}
              className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {item.completed
                ? <CheckSquare2 className="size-4 text-green-500" />
                : <Square className="size-4" />}
            </button>
            <span className={`flex-1 text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
              {item.description}
            </span>
            {!readonly && (
              <button
                onClick={() => startTransition(() => deleteChecklistItem(item.id))}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Add new */}
      {!readonly && (
        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t("checklist.addPlaceholder")}
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={pending || !newItem.trim()}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}
