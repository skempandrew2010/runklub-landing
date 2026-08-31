"use client"

import { createPortal } from "react-dom"

// The page shell wraps route content in an "animate-page-enter" div that
// carries a transform during its enter animation, which makes any "fixed"
// descendant position relative to that div instead of the real viewport -
// it ends up wherever that div's box is (and scrolls away on tall pages)
// instead of staying centered on whatever the visitor is currently looking
// at. Every full-screen popup portals straight onto <body> to escape that
// and stay truly viewport-fixed regardless of scroll position or page length.
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}
