import type { FocusEvent } from "react"

// Opens a native <input type="date"|"time"> picker as soon as the field is
// focused, instead of making the user click the tiny calendar/clock icon
// specifically. showPicker() is well-supported in Chrome/Edge/Safari but
// isn't universal (older browsers, some in-app webviews) and can throw if
// called outside a user gesture -- both are non-fatal, since the field still
// works normally by typing or clicking the icon either way.
export function openNativePicker(e: FocusEvent<HTMLInputElement>) {
  try {
    const input = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
    input.showPicker?.()
  } catch {
    // unsupported or blocked -- ignore, the input is still fully usable
  }
}
