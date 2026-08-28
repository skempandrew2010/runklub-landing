import type { SyntheticEvent } from "react"

// Opens a native <input type="date"|"time"> picker as soon as the field is
// interacted with, instead of making the user click the tiny calendar/clock
// icon specifically. Wired to both onFocus and onClick -- focus alone can
// fail Chrome's "transient activation" requirement for showPicker() in some
// contexts (e.g. focus arriving indirectly rather than as the direct result
// of a click), while a click event is the most unambiguous user gesture
// there is, so it's a reliable fallback trigger. showPicker() is
// well-supported in Chrome/Edge/Safari but isn't universal (older browsers,
// some in-app webviews) and can throw if called outside a user gesture --
// both are non-fatal, since the field still works normally by typing or
// clicking the icon either way.
export function openNativePicker(e: SyntheticEvent<HTMLInputElement>) {
  try {
    const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
    input.showPicker?.()
  } catch {
    // unsupported or blocked -- ignore, the input is still fully usable
  }
}
