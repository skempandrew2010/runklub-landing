// Shared by Select/DateInput/TimeInput: sizing/flex classes need to live on
// the outer wrapper so each behaves correctly as a flex/grid child (e.g.
// flex-1, min-w-[130px], shrink-0); everything else (bg, border, radius,
// padding, text, focus/disabled variants) belongs on the visible control
// itself.
export function splitFieldClasses(className: string) {
  const sizing: string[] = []
  const visual: string[] = []
  for (const c of className.split(/\s+/).filter(Boolean)) {
    if (/^(w-|min-w-|max-w-|flex-|basis-|shrink|grow)/.test(c)) sizing.push(c)
    else visual.push(c)
  }
  return { sizing: sizing.join(" "), visual: visual.join(" ") }
}
