import * as React from "react"
import {
  EmojiPicker as EmojiPickerPrimitive,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
} from "frimousse"
import { LoaderIcon, SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Selector de emojis sobre `frimousse` (headless). Es el componente `emoji-picker` del registro de
 * shadcn, vendorizado a mano porque la CLI 3.8.5 que fija este proyecto no lo trae y la versión del
 * registro asume Tailwind v4. Adaptado a Tailwind 3 y a los tokens semánticos (light y dark).
 *
 * Los datos (emojibase) los descarga `frimousse` bajo demanda desde jsDelivr y los cachea en
 * `localStorage`: no viajan en el bundle.
 */
function EmojiPicker({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root>): React.ReactElement {
  return (
    <EmojiPickerPrimitive.Root
      className={cn(
        "isolate flex h-full w-fit flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className
      )}
      data-slot="emoji-picker"
      {...props}
    />
  )
}

function EmojiPickerSearch({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Search>): React.ReactElement {
  return (
    <div className={cn("flex h-9 items-center gap-2 border-b border-border px-3", className)} data-slot="emoji-picker-search-wrapper">
      <SearchIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      <EmojiPickerPrimitive.Search
        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        data-slot="emoji-picker-search"
        {...props}
      />
    </div>
  )
}

function EmojiPickerRow({ children, ...props }: EmojiPickerListRowProps): React.ReactElement {
  return (
    <div {...props} className="scroll-my-1 px-1" data-slot="emoji-picker-row">
      {children}
    </div>
  )
}

function EmojiPickerEmoji({
  emoji,
  className,
  ...props
}: EmojiPickerListEmojiProps): React.ReactElement {
  return (
    <button
      {...props}
      className={cn(
        "flex size-8 items-center justify-center rounded-sm text-lg data-[active]:bg-accent",
        className
      )}
      data-slot="emoji-picker-emoji"
    >
      {emoji.emoji}
    </button>
  )
}

function EmojiPickerCategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps): React.ReactElement {
  return (
    <div
      {...props}
      className="bg-popover px-3 pb-2 pt-3.5 text-xs leading-none text-muted-foreground"
      data-slot="emoji-picker-category-header"
    >
      {category.label}
    </div>
  )
}

function EmojiPickerContent({
  className,
  labels,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport> & {
  /** Textos de los estados de carga y vacío, para no dejarlos en inglés. */
  labels?: { loading?: string; empty?: string }
}): React.ReactElement {
  return (
    <EmojiPickerPrimitive.Viewport
      className={cn("relative flex-1 outline-none", className)}
      data-slot="emoji-picker-viewport"
      {...props}
    >
      <EmojiPickerPrimitive.Loading
        className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        data-slot="emoji-picker-loading"
      >
        <LoaderIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {labels?.loading}
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty
        className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
        data-slot="emoji-picker-empty"
      >
        {labels?.empty ?? "No emoji found."}
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className="select-none pb-1"
        components={{
          Row: EmojiPickerRow,
          Emoji: EmojiPickerEmoji,
          CategoryHeader: EmojiPickerCategoryHeader,
        }}
        data-slot="emoji-picker-list"
      />
    </EmojiPickerPrimitive.Viewport>
  )
}

function EmojiPickerFooter({
  className,
  emptyLabel,
  ...props
}: React.ComponentProps<"div"> & { emptyLabel?: string }): React.ReactElement {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-[var(--frimousse-viewport-width)] items-center gap-1 border-t border-border p-2",
        className
      )}
      data-slot="emoji-picker-footer"
      {...props}
    >
      <EmojiPickerPrimitive.ActiveEmoji>
        {({ emoji }) =>
          emoji ? (
            <>
              <div className="flex size-7 flex-none items-center justify-center text-lg">{emoji.emoji}</div>
              <span className="truncate text-xs text-secondary-foreground">{emoji.label}</span>
            </>
          ) : (
            <span className="ml-1.5 flex h-7 items-center truncate text-xs text-muted-foreground">
              {emptyLabel ?? "Select an emoji…"}
            </span>
          )
        }
      </EmojiPickerPrimitive.ActiveEmoji>
    </div>
  )
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EmojiPickerFooter }
