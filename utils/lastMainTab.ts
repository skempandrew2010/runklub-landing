// Tracks whichever of Home/Discover the user visited most recently, so pages
// like the club page can send "back" there deterministically instead of via
// router.back() - browser history isn't reliable for this (e.g. Club -> Run
// -> Club -> back can bounce between Run and Club instead of ever reaching
// Home/Discover, since the run page always links straight back to its club).
const KEY = "rk-last-main-tab"

export type MainTab = "home" | "explore"

export function setLastMainTab(tab: MainTab) {
  try {
    window.localStorage.setItem(KEY, tab)
  } catch {
    // localStorage unavailable (private mode, etc) - the fallback in
    // getLastMainTab handles this fine, nothing to do here.
  }
}

export function getLastMainTab(): MainTab {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === "home" || v === "explore" ? v : "explore"
  } catch {
    return "explore"
  }
}
