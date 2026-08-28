"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Search, Check, RotateCcw, Mail, Phone, Pencil, Plus, X } from "lucide-react"
import { Select } from "@/components/Select"

type Status = "cold" | "contacted" | "replied" | "booked" | "closed"

type Contact = {
  id: string
  club_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  status: Status
  source: string | null
  last_touch_date: string | null
  next_followup_date: string | null
  notes: string | null
  created_at: string
}

const STATUSES: Status[] = ["cold", "contacted", "replied", "booked", "closed"]

const STATUS_STYLES: Record<Status, string> = {
  cold: "bg-[#1e2d12] border-[#2e3d1a] text-white/50",
  contacted: "bg-[#c5f135]/10 border-[#c5f135]/30 text-[#c5f135]",
  replied: "bg-blue-400/10 border-blue-400/30 text-blue-300",
  booked: "bg-purple-400/10 border-purple-400/30 text-purple-300",
  closed: "bg-white/5 border-white/10 text-white/30",
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function isOverdue(c: Contact) {
  if (!c.next_followup_date) return false
  if (c.status === "replied" || c.status === "closed") return false
  return c.next_followup_date <= todayString()
}

type ContactForm = {
  club_name: string
  contact_name: string
  email: string
  phone: string
  source: string
  notes: string
}

const EMPTY_FORM: ContactForm = { club_name: "", contact_name: "", email: "", phone: "", source: "", notes: "" }

function contactToForm(c: Contact): ContactForm {
  return {
    club_name: c.club_name,
    contact_name: c.contact_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    source: c.source ?? "",
    notes: c.notes ?? "",
  }
}

export default function CrmDashboardPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [modal, setModal] = useState<{ mode: "add" | "edit"; contactId?: string } | null>(null)
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const authedFetch = async (url: string, body: object) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    })
  }

  const loadContacts = async () => {
    setLoading(true)
    setError("")
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/admin/crm/contacts", {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (res.ok) {
      const json = await res.json()
      setContacts(json.contacts ?? [])
    } else {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? "Failed to load contacts")
    }
    setLoading(false)
  }

  useEffect(() => {
    loadContacts()
  }, [])

  const handleStatusChange = async (id: string, status: Status) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
    const res = await authedFetch("/api/admin/crm/update-status", { id, status })
    if (!res.ok) loadContacts()
  }

  const handleMarkContacted = async (id: string) => {
    setBusyId(id)
    const res = await authedFetch("/api/admin/crm/mark-contacted", { id })
    if (res.ok) {
      const { last_touch_date, next_followup_date } = await res.json()
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, last_touch_date, next_followup_date } : c)))
    }
    setBusyId(null)
  }

  const handleSnooze = async (id: string) => {
    setBusyId(id)
    const res = await authedFetch("/api/admin/crm/snooze", { id })
    if (res.ok) {
      const { next_followup_date } = await res.json()
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, next_followup_date } : c)))
    }
    setBusyId(null)
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError("")
    setModal({ mode: "add" })
  }

  const openEdit = (c: Contact) => {
    setForm(contactToForm(c))
    setFormError("")
    setModal({ mode: "edit", contactId: c.id })
  }

  const closeModal = () => {
    if (saving) return
    setModal(null)
  }

  const handleSaveContact = async () => {
    if (!form.club_name.trim()) {
      setFormError("Klub name is required")
      return
    }
    setSaving(true)
    setFormError("")

    const url = modal?.mode === "edit" ? "/api/admin/crm/update-contact" : "/api/admin/crm/create-contact"
    const body = modal?.mode === "edit" ? { id: modal.contactId, ...form } : form
    const res = await authedFetch(url, body)

    if (res.ok) {
      const { contact } = await res.json()
      setContacts((prev) =>
        modal?.mode === "edit"
          ? prev.map((c) => (c.id === contact.id ? contact : c))
          : [...prev, contact]
      )
      setModal(null)
    } else {
      const json = await res.json().catch(() => ({}))
      setFormError(json.error ?? "Failed to save contact")
    }
    setSaving(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false
      if (q && !c.club_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [contacts, search, statusFilter])

  return (
    <div className="min-h-screen bg-[#1a2110] pb-24">
      <div className="max-w-6xl mx-auto px-6 pt-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black text-white">Outreach CRM</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/40">{filtered.length} of {contacts.length} contacts</span>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
            >
              <Plus className="w-4 h-4" /> Add Contact
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by klub name..."
              className="w-full bg-[#1e2d12] border border-[#2e3d1a] rounded-xl pl-9 pr-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-full text-sm font-bold transition ${statusFilter === "all" ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-full text-sm font-bold capitalize transition ${statusFilter === s ? "bg-[#c5f135] text-[#1a2110]" : "bg-[#1e2d12] border border-[#2e3d1a] text-white/50 hover:text-white"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-400/10 border border-red-400/30 rounded-2xl p-4 text-red-300 text-sm mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#c5f135]/30 border-t-[#c5f135] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1e2d12] rounded-2xl border border-[#2e3d1a] p-8 text-center text-white/40">
            No contacts match.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1.3fr_1.1fr_1fr_auto] gap-4 px-5 text-xs font-bold uppercase tracking-wide text-white/30">
              <span>Klub</span>
              <span>Contact</span>
              <span>Status</span>
              <span>Next follow-up</span>
              <span></span>
            </div>
            {filtered.map((c) => {
              const overdue = isOverdue(c)
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1.1fr_1fr_auto] gap-3 md:gap-4 items-center rounded-2xl border px-5 py-4 ${
                    overdue ? "bg-red-400/[0.06] border-red-400/30" : "bg-[#1e2d12] border-[#2e3d1a]"
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <div>
                      <div className="text-white font-bold text-sm">{c.club_name}</div>
                      {c.source && <div className="text-white/30 text-xs mt-0.5">{c.source}</div>}
                    </div>
                    <button
                      onClick={() => openEdit(c)}
                      title="Edit contact info"
                      className="text-white/20 hover:text-[#c5f135] transition shrink-0 mt-0.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-sm space-y-0.5">
                    {c.contact_name && <div className="text-white/70">{c.contact_name}</div>}
                    {c.email && (
                      <div className="text-white/40 text-xs flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div className="text-white/40 text-xs flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </div>
                    )}
                    {!c.contact_name && !c.email && !c.phone && <span className="text-white/20 text-xs">-</span>}
                  </div>

                  <Select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value as Status)}
                    className={`text-xs font-bold capitalize rounded-lg border px-2.5 py-2 bg-transparent focus:outline-none ${STATUS_STYLES[c.status]}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>

                  <div className={`text-sm ${overdue ? "text-red-300 font-bold" : "text-white/50"}`}>
                    {c.next_followup_date ?? "-"}
                    {overdue && <div className="text-xs font-normal text-red-300/70">overdue</div>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleMarkContacted(c.id)}
                      disabled={busyId === c.id}
                      title="Mark contacted (sets next follow-up +5d)"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
                    >
                      <Check className="w-3.5 h-3.5" /> Contacted
                    </button>
                    <button
                      onClick={() => handleSnooze(c.id)}
                      disabled={busyId === c.id}
                      title="Snooze follow-up +3d"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition disabled:opacity-40 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white hover:border-[#c5f135]/40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Snooze
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={closeModal}>
          <div
            className="bg-[#1e2d12] border border-[#2e3d1a] rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">
                {modal.mode === "edit" ? "Edit Contact" : "Add Contact"}
              </h2>
              <button onClick={closeModal} className="text-white/40 hover:text-white transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-3 text-red-300 text-xs">
                {formError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-white/30">Klub name *</label>
                <input
                  value={form.club_name}
                  onChange={(e) => setForm((f) => ({ ...f, club_name: e.target.value }))}
                  className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-white/30">Contact name</label>
                <input
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-white/30">Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-white/30">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-white/30">Source</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="e.g. referral, website, conference"
                  className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-white/30">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full mt-1 bg-[#1a2110] border border-[#2e3d1a] rounded-xl px-3 py-2 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#c5f135]/50 transition resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSaveContact}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-black transition disabled:opacity-40 bg-[#c5f135] text-[#1a2110] hover:bg-[#d4ff45]"
              >
                {saving ? "Saving..." : modal.mode === "edit" ? "Save Changes" : "Add Contact"}
              </button>
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-black transition disabled:opacity-40 bg-[#1a2110] border border-[#2e3d1a] text-white/60 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
