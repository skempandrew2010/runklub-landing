import { Minus, Plus } from "lucide-react"
import { Select as SharedSelect } from "@/components/Select"
import { RollerSelect } from "@/components/RollerSelect"

// Builds a 1..max roller option list plus a leading "unlimited" (blank
// value) entry, for count-style limit/cap fields - same spin-to-pick feel
// as the timezone roller instead of a plain stepper or long dropdown.
export function numberRollerOptions(max: number) {
  return [
    { value: "", label: "Unlimited" },
    ...Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ]
}

export function LimitRoller({
  value,
  onChange,
  max,
  className = "",
}: {
  value: string
  onChange: (value: string) => void
  max: number
  className?: string
}) {
  return (
    <RollerSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={numberRollerOptions(max)}
      panelWidth={140}
      className={`w-[140px] bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50 transition ${className}`}
    />
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-5">{children}</div>
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3">{children}</h2>
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#c5f135]/50 transition ${props.className ?? ""}`}
    />
  )
}

export function Select({
  className = "",
  value,
  onChange,
  children,
  disabled,
}: {
  className?: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <SharedSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#c5f135]/50 transition ${className}`}
    >
      {children}
    </SharedSelect>
  )
}

// Blank/empty means "unlimited" for the caller - the +/- buttons treat a
// blank field as `base` (usually 1) so the first tap always lands on a
// sensible number instead of NaN.
export function NumberStepper({
  value,
  onChange,
  min = 1,
  max,
  base = 1,
  placeholder,
  className = "",
}: {
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
  base?: number
  placeholder?: string
  className?: string
}) {
  const numeric = parseInt(value, 10)
  const current = Number.isFinite(numeric) ? numeric : null

  const step = (delta: number) => {
    const next = current == null ? base : current + delta
    const clamped = Math.max(min, max != null ? Math.min(max, next) : next)
    onChange(String(clamped))
  }

  return (
    <div className={`inline-flex items-center bg-[#1a2110] border border-[#2e3d1a] rounded-xl overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={current != null && current <= min}
        className="w-9 h-9 flex items-center justify-center text-white/50 hover:text-white hover:bg-[#2e3d1a] transition shrink-0 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/50"
        aria-label="Decrease"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => { if (/^\d*$/.test(e.target.value)) onChange(e.target.value) }}
        placeholder={placeholder}
        className="w-12 bg-transparent text-center text-sm font-bold text-white placeholder-white/30 placeholder:font-normal focus:outline-none py-2"
      />
      <button
        type="button"
        onClick={() => step(1)}
        disabled={current != null && max != null && current >= max}
        className="w-9 h-9 flex items-center justify-center text-white/50 hover:text-white hover:bg-[#2e3d1a] transition shrink-0 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/50"
        aria-label="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-[#c5f135]/50 transition ${props.className ?? ""}`}
    />
  )
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-[#c5f135] text-[#1a2110] hover:bg-[#d4fb4d] disabled:opacity-40",
    ghost: "bg-transparent border border-[#2e3d1a] text-white/50 hover:text-white disabled:opacity-40",
    danger: "bg-transparent text-red-400 hover:text-red-300 hover:bg-red-400/10 disabled:opacity-40",
  }[variant]
  return (
    <button
      {...props}
      className={`px-3 py-1.5 rounded-lg text-sm font-black transition ${styles} ${className}`}
    />
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap">{children}</div>
}
