import { Select as SharedSelect } from "@/components/Select"

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
