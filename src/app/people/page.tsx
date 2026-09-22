"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import type {
  PersonDTO,
  PersonDetailDTO,
  RelationshipType,
  InteractionChannel,
  FollowUpStatus,
  FollowUpRemindersDTO,
  CreatePersonInput,
  LogInteractionInput,
} from "@/types";
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Building,
  Briefcase,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Tag,
  MessageSquare,
  Video,
  FileText,
  CheckSquare,
  FolderKanban,
  Edit3,
  Archive,
  RotateCcw,
  Trash2,
  ExternalLink,
  ChevronRight,
  Filter,
  UserCheck,
  Send,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { formatFollowUpLabel } from "@/lib/follow-up";

const RELATIONSHIP_TYPES: { label: string; value: RelationshipType; color: string }[] = [
  { label: "Client", value: "client", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { label: "Colleague", value: "colleague", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { label: "Friend", value: "friend", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { label: "Family", value: "family", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { label: "Prospect", value: "prospect", color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  { label: "Mentor", value: "mentor", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  { label: "Professional", value: "professional", color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" },
  { label: "Other", value: "other", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
];

const CHANNELS: { label: string; value: InteractionChannel; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Call", value: "call", icon: Phone },
  { label: "Meeting", value: "meeting", icon: Video },
  { label: "Email", value: "email", icon: Mail },
  { label: "Message", value: "message", icon: MessageSquare },
  { label: "In Person", value: "in_person", icon: Users },
  { label: "Other", value: "other", icon: Clock },
];

export default function PeoplePage() {
  const router = useRouter();
  const { data: sessionData, isPending } = useSession();

  // Data state
  const [people, setPeople] = React.useState<PersonDTO[]>([]);
  const [reminders, setReminders] = React.useState<FollowUpRemindersDTO | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedType, setSelectedType] = React.useState<string>("all");
  const [selectedFollowUp, setSelectedFollowUp] = React.useState<string>("all");
  const [showArchived, setShowArchived] = React.useState(false);
  const [groupBy, setGroupBy] = React.useState<"none" | "relationshipType" | "company" | "followUpStatus">("none");

  // Selected Person for details modal/drawer
  const [selectedPersonId, setSelectedPersonId] = React.useState<string | null>(null);
  const [selectedPersonDetail, setSelectedPersonDetail] = React.useState<PersonDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  // Create / Edit Person Modal
  const [isPersonModalOpen, setIsPersonModalOpen] = React.useState(false);
  const [editingPerson, setEditingPerson] = React.useState<PersonDTO | null>(null);
  const [personForm, setPersonForm] = React.useState<CreatePersonInput>({
    name: "",
    relationshipType: "colleague",
    company: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    tags: [],
    nextFollowUpDate: "",
  });
  const [tagInput, setTagInput] = React.useState("");
  const [savingPerson, setSavingPerson] = React.useState(false);

  // Log Interaction Modal
  const [isInteractionModalOpen, setIsInteractionModalOpen] = React.useState(false);
  const [interactionTargetPerson, setInteractionTargetPerson] = React.useState<PersonDTO | null>(null);
  const [interactionForm, setInteractionForm] = React.useState<LogInteractionInput>({
    channel: "call",
    date: new Date().toISOString().slice(0, 16),
    summary: "",
    nextFollowUpDate: "",
  });
  const [savingInteraction, setSavingInteraction] = React.useState(false);

  // Fetch all people and reminders
  const fetchPeople = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showArchived) params.set("isArchived", "true");
      if (selectedType !== "all") params.set("relationshipType", selectedType);
      if (selectedFollowUp !== "all") params.set("followUpStatus", selectedFollowUp);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const [peopleRes, remindersRes] = await Promise.all([
        fetch(`/api/people?${params.toString()}`),
        fetch("/api/people/reminders"),
      ]);

      if (peopleRes.ok) {
        const json = await peopleRes.json();
        setPeople(json.people || json.data || []);
      }
      if (remindersRes.ok) {
        const rJson = await remindersRes.json();
        setReminders(rJson);
      }
    } catch (err) {
      console.error("Failed to load people:", err);
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [showArchived, selectedType, selectedFollowUp, searchQuery]);

  React.useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  // Fetch person details
  const fetchPersonDetail = React.useCallback(async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/people/${id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedPersonDetail(json.person || json.data);
      }
    } catch (err) {
      console.error("Failed to load contact details:", err);
      toast.error("Failed to load contact details");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedPersonId) {
      fetchPersonDetail(selectedPersonId);
    } else {
      setSelectedPersonDetail(null);
    }
  }, [selectedPersonId, fetchPersonDetail]);

  // Open Create Person Modal
  const handleOpenCreateModal = () => {
    setEditingPerson(null);
    setPersonForm({
      name: "",
      relationshipType: "colleague",
      company: "",
      role: "",
      email: "",
      phone: "",
      notes: "",
      tags: [],
      nextFollowUpDate: "",
    });
    setTagInput("");
    setIsPersonModalOpen(true);
  };

  // Open Edit Person Modal
  const handleOpenEditModal = (p: PersonDTO) => {
    setEditingPerson(p);
    setPersonForm({
      name: p.name,
      relationshipType: p.relationshipType,
      company: p.company || "",
      role: p.role || "",
      email: p.email || "",
      phone: p.phone || "",
      notes: p.notes || "",
      tags: p.tags || [],
      nextFollowUpDate: p.nextFollowUpDate
        ? new Date(p.nextFollowUpDate).toISOString().slice(0, 10)
        : "",
    });
    setTagInput("");
    setIsPersonModalOpen(true);
  };

  // Save Person (Create or Update)
  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personForm.name.trim()) {
      toast.error("Contact name is required");
      return;
    }

    try {
      setSavingPerson(true);
      const payload = {
        name: personForm.name.trim(),
        relationshipType: personForm.relationshipType,
        company: personForm.company?.trim() || null,
        role: personForm.role?.trim() || null,
        email: personForm.email?.trim() || null,
        phone: personForm.phone?.trim() || null,
        notes: personForm.notes?.trim() || null,
        tags: personForm.tags,
        nextFollowUpDate: personForm.nextFollowUpDate
          ? new Date(personForm.nextFollowUpDate).toISOString()
          : null,
      };

      let res: Response;
      if (editingPerson) {
        res = await fetch(`/api/people/${editingPerson.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to save contact");
      }

      toast.success(editingPerson ? "Contact updated" : "Contact created");
      setIsPersonModalOpen(false);
      fetchPeople();
      if (selectedPersonId && editingPerson && selectedPersonId === editingPerson.id) {
        fetchPersonDetail(selectedPersonId);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save contact");
    } finally {
      setSavingPerson(false);
    }
  };

  // Archive / Restore Person
  const handleToggleArchive = async (person: PersonDTO) => {
    try {
      const action = person.isArchived ? "restore" : "archive";
      const res = await fetch(`/api/people/${person.id}?${action}=true`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Action failed");
      toast.success(person.isArchived ? "Contact restored" : "Contact archived");
      fetchPeople();
      if (selectedPersonId === person.id) {
        fetchPersonDetail(person.id);
      }
    } catch (err) {
      toast.error("Failed to update contact");
    }
  };

  // Delete Person
  const handleDeletePerson = async (person: PersonDTO) => {
    if (!confirm(`Are you sure you want to delete ${person.name}? This will remove all logged interactions.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/people/${person.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete contact");
      toast.success("Contact deleted");
      if (selectedPersonId === person.id) {
        setSelectedPersonId(null);
      }
      fetchPeople();
    } catch (err) {
      toast.error("Failed to delete contact");
    }
  };

  // Open Log Interaction Modal
  const handleOpenInteractionModal = (person: PersonDTO) => {
    setInteractionTargetPerson(person);
    setInteractionForm({
      channel: "call",
      date: new Date().toISOString().slice(0, 16),
      summary: "",
      nextFollowUpDate: "",
    });
    setIsInteractionModalOpen(true);
  };

  // Save Logged Interaction
  const handleSaveInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interactionTargetPerson) return;
    if (!interactionForm.summary.trim()) {
      toast.error("Interaction summary is required");
      return;
    }

    try {
      setSavingInteraction(true);
      const payload = {
        channel: interactionForm.channel,
        date: interactionForm.date
          ? new Date(interactionForm.date).toISOString()
          : new Date().toISOString(),
        summary: interactionForm.summary.trim(),
        nextFollowUpDate: interactionForm.nextFollowUpDate
          ? new Date(interactionForm.nextFollowUpDate).toISOString()
          : null,
      };

      const res = await fetch(`/api/people/${interactionTargetPerson.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to log interaction");
      }

      toast.success("Interaction logged");
      setIsInteractionModalOpen(false);
      fetchPeople();
      if (selectedPersonId === interactionTargetPerson.id) {
        fetchPersonDetail(interactionTargetPerson.id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to log interaction");
    } finally {
      setSavingInteraction(false);
    }
  };

  // Delete an interaction
  const handleDeleteInteraction = async (personId: string, interactionId: string) => {
    if (!confirm("Are you sure you want to delete this interaction log?")) return;
    try {
      const res = await fetch(`/api/people/${personId}/interactions/${interactionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete interaction");
      toast.success("Interaction deleted");
      fetchPeople();
      if (selectedPersonId === personId) {
        fetchPersonDetail(personId);
      }
    } catch (err) {
      toast.error("Failed to delete interaction");
    }
  };

  // Add tag to form
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !personForm.tags?.includes(trimmed)) {
      setPersonForm({
        ...personForm,
        tags: [...(personForm.tags || []), trimmed],
      });
      setTagInput("");
    }
  };

  // Remove tag from form
  const handleRemoveTag = (tagToRemove: string) => {
    setPersonForm({
      ...personForm,
      tags: personForm.tags?.filter((t) => t !== tagToRemove) || [],
    });
  };

  // Format relative last interaction date
  const formatLastInteraction = (dateStr: string | null) => {
    if (!dateStr) return "Never contacted";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Get follow-up status badge styling
  const getFollowUpBadge = (status: FollowUpStatus, nextDateStr: string | null) => {
    const label = formatFollowUpLabel(nextDateStr);
    switch (status) {
      case "overdue":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20" data-testid="badge-overdue">
            <AlertCircle className="w-3 h-3" />
            {label}
          </span>
        );
      case "today":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" data-testid="badge-today">
            <Clock className="w-3 h-3" />
            {label}
          </span>
        );
      case "upcoming":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" data-testid="badge-upcoming">
            <Calendar className="w-3 h-3" />
            {label}
          </span>
        );
      case "none":
      default:
        return (
          <span className="text-xs text-muted-foreground">
            No follow-up
          </span>
        );
    }
  };

  // Grouped people map
  const groupedPeople = React.useMemo(() => {
    if (groupBy === "none") {
      return { "All Contacts": people };
    }

    const groups: Record<string, PersonDTO[]> = {};

    for (const p of people) {
      let key = "Other";
      if (groupBy === "relationshipType") {
        key = p.relationshipType.charAt(0).toUpperCase() + p.relationshipType.slice(1);
      } else if (groupBy === "company") {
        key = p.company || "No Company";
      } else if (groupBy === "followUpStatus") {
        if (p.followUpStatus === "overdue") key = "⚠️ Overdue Follow-ups";
        else if (p.followUpStatus === "today") key = "🔔 Due Today";
        else if (p.followUpStatus === "upcoming") key = "📅 Upcoming Follow-ups";
        else key = "No Follow-up Scheduled";
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    return groups;
  }, [people, groupBy]);

  return (
    <AppShell>
      <div className="flex-1 space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full" data-testid="people-crm-page">
        {/* Header and Top Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Users className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">People & CRM</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Manage personal and professional relationships, track interactions, and stay on top of follow-ups.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleOpenCreateModal}
              className="gap-2"
              data-testid="add-person-button"
            >
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* Reminders Alert Banner (if overdue or today follow-ups exist) */}
        {reminders && (reminders.overdue.length > 0 || reminders.today.length > 0) && (
          <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10" data-testid="follow-up-reminders-banner">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>
                  Follow-up Attention Needed ({reminders.overdue.length + reminders.today.length})
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="flex flex-wrap gap-2">
                {reminders.overdue.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersonId(p.id)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors"
                    data-testid={`reminder-overdue-${p.id}`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="opacity-80">({formatFollowUpLabel(p.nextFollowUpDate)})</span>
                  </button>
                ))}
                {reminders.today.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPersonId(p.id)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/25 transition-colors"
                    data-testid={`reminder-today-${p.id}`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="opacity-80">(Due Today)</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters, Search and Controls Bar */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, role, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
                data-testid="crm-search-input"
              />
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              {/* Follow-up Status Filter */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground hidden sm:inline">Follow-up:</span>
                <select
                  value={selectedFollowUp}
                  onChange={(e) => setSelectedFollowUp(e.target.value)}
                  className="h-9 px-2 text-xs rounded-md border border-input bg-background"
                  data-testid="crm-followup-filter"
                >
                  <option value="all">All Follow-ups</option>
                  <option value="overdue">Overdue</option>
                  <option value="today">Due Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="none">No Follow-up</option>
                </select>
              </div>

              {/* Group By Selector */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground hidden sm:inline">Group:</span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                  className="h-9 px-2 text-xs rounded-md border border-input bg-background"
                  data-testid="crm-group-by-select"
                >
                  <option value="none">No Grouping</option>
                  <option value="relationshipType">Relationship Type</option>
                  <option value="company">Company</option>
                  <option value="followUpStatus">Follow-up Status</option>
                </select>
              </div>

              {/* Archived Toggle */}
              <Button
                variant={showArchived ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                className="h-9 text-xs gap-1.5"
                data-testid="crm-toggle-archived"
              >
                <Archive className="w-3.5 h-3.5" />
                {showArchived ? "Archived" : "Active"}
              </Button>
            </div>
          </div>

          {/* Relationship Type Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none" data-testid="crm-relationship-tabs">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                selectedType === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent text-muted-foreground"
              }`}
            >
              All Contacts ({people.length})
            </button>
            {RELATIONSHIP_TYPES.map((type) => {
              const count = people.filter((p) => p.relationshipType === type.value).length;
              return (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                    selectedType === type.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-accent text-muted-foreground"
                  }`}
                  data-testid={`crm-type-tab-${type.value}`}
                >
                  {type.label} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contacts Display (Grouped or Flat) */}
        {loading ? (
          <div className="py-24 text-center text-muted-foreground" data-testid="crm-loading">
            <Clock className="w-8 h-8 animate-spin mx-auto mb-2 opacity-40" />
            Loading contacts...
          </div>
        ) : people.length === 0 ? (
          <Card className="p-12 text-center" data-testid="crm-empty-state">
            <div className="p-3 bg-primary/10 text-primary rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No contacts found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
              {searchQuery || selectedType !== "all" || selectedFollowUp !== "all"
                ? "No contacts match your active filter criteria."
                : "Your personal CRM is empty. Start adding colleagues, clients, friends, and mentors."}
            </p>
            <Button onClick={handleOpenCreateModal} className="gap-2" data-testid="empty-add-person-btn">
              <Plus className="w-4 h-4" />
              Add First Contact
            </Button>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedPeople).map(([groupTitle, groupItems]) => (
              <div key={groupTitle} className="space-y-4">
                {groupBy !== "none" && (
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <h2 className="text-base font-semibold text-foreground">{groupTitle}</h2>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted font-medium">
                      {groupItems.length}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="people-cards-grid">
                  {groupItems.map((person) => {
                    const typeConfig = RELATIONSHIP_TYPES.find((t) => t.value === person.relationshipType);

                    return (
                      <Card
                        key={person.id}
                        className="flex flex-col justify-between hover:shadow-md transition-shadow border border-border"
                        data-testid={`person-card-${person.id}`}
                      >
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3
                                  onClick={() => setSelectedPersonId(person.id)}
                                  className="font-semibold text-base hover:text-primary cursor-pointer transition-colors"
                                  data-testid={`person-name-${person.id}`}
                                >
                                  {person.name}
                                </h3>
                                {person.isArchived && (
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    Archived
                                  </span>
                                )}
                              </div>

                              {(person.role || person.company) && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                                  {person.role && <span>{person.role}</span>}
                                  {person.role && person.company && <span>•</span>}
                                  {person.company && (
                                    <span className="font-medium">{person.company}</span>
                                  )}
                                </p>
                              )}
                            </div>

                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                                typeConfig?.color || "bg-muted text-muted-foreground"
                              }`}
                              data-testid={`person-type-${person.id}`}
                            >
                              {typeConfig?.label || person.relationshipType}
                            </span>
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 pt-2 space-y-3 flex-1 flex flex-col justify-between">
                          {/* Contact Info & Notes Snippet */}
                          <div className="space-y-2 text-xs">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                              {person.email && (
                                <a
                                  href={`mailto:${person.email}`}
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                  title={person.email}
                                  data-testid={`person-email-${person.id}`}
                                >
                                  <Mail className="w-3.5 h-3.5" />
                                  <span className="truncate max-w-[150px]">{person.email}</span>
                                </a>
                              )}
                              {person.phone && (
                                <a
                                  href={`tel:${person.phone}`}
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                  title={person.phone}
                                  data-testid={`person-phone-${person.id}`}
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  <span>{person.phone}</span>
                                </a>
                              )}
                            </div>

                            {person.notes && (
                              <p className="text-xs text-muted-foreground line-clamp-2 italic bg-muted/40 p-2 rounded">
                                "{person.notes}"
                              </p>
                            )}

                            {/* Tags */}
                            {person.tags && person.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {person.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Follow-up and Last Interaction status */}
                          <div className="pt-3 border-t border-border/60 flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Follow-up:</span>
                              <div>{getFollowUpBadge(person.followUpStatus, person.nextFollowUpDate)}</div>
                            </div>

                            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                              <span>Last contact:</span>
                              <span>{formatLastInteraction(person.lastInteractionDate)}</span>
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="pt-2 flex items-center justify-between gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenInteractionModal(person)}
                              className="text-xs h-8 gap-1 flex-1"
                              data-testid={`log-interaction-btn-${person.id}`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              Log Interaction
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedPersonId(person.id)}
                              className="text-xs h-8 px-2"
                              title="View details and timeline"
                              data-testid={`view-detail-btn-${person.id}`}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditModal(person)}
                              className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                              title="Edit contact"
                              data-testid={`edit-person-btn-${person.id}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleArchive(person)}
                              className="text-xs h-8 px-2 text-muted-foreground hover:text-foreground"
                              title={person.isArchived ? "Restore" : "Archive"}
                              data-testid={`archive-person-btn-${person.id}`}
                            >
                              {person.isArchived ? (
                                <RotateCcw className="w-3.5 h-3.5" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact Details & Interaction Timeline Modal */}
        <Modal
          isOpen={!!selectedPersonId}
          onClose={() => setSelectedPersonId(null)}
          title={selectedPersonDetail?.name || "Contact Details"}
          className="max-w-2xl"
        >
          {loadingDetail || !selectedPersonDetail ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="detail-loading">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
              Loading details...
            </div>
          ) : (
            <div className="space-y-6 pt-2" data-testid="person-detail-modal">
              {/* Header profile info */}
              <div className="flex items-start justify-between border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold">{selectedPersonDetail.name}</h2>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                      {selectedPersonDetail.relationshipType}
                    </span>
                  </div>
                  {(selectedPersonDetail.role || selectedPersonDetail.company) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedPersonDetail.role} {selectedPersonDetail.role && selectedPersonDetail.company && "at"} {selectedPersonDetail.company}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                    {selectedPersonDetail.email && (
                      <a href={`mailto:${selectedPersonDetail.email}`} className="flex items-center gap-1 hover:text-foreground">
                        <Mail className="w-3 h-3" />
                        {selectedPersonDetail.email}
                      </a>
                    )}
                    {selectedPersonDetail.phone && (
                      <a href={`tel:${selectedPersonDetail.phone}`} className="flex items-center gap-1 hover:text-foreground">
                        <Phone className="w-3 h-3" />
                        {selectedPersonDetail.phone}
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleOpenInteractionModal(selectedPersonDetail)}
                    className="gap-1.5 text-xs h-8"
                    data-testid="detail-log-interaction-btn"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Log Interaction
                  </Button>
                </div>
              </div>

              {/* Follow-up Status Strip */}
              <div className="p-3 rounded-lg bg-muted/40 flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Follow-up status: </span>
                  {getFollowUpBadge(selectedPersonDetail.followUpStatus, selectedPersonDetail.nextFollowUpDate)}
                </div>
                <div className="text-muted-foreground">
                  Last interaction: {formatLastInteraction(selectedPersonDetail.lastInteractionDate)}
                </div>
              </div>

              {/* Bio / Context Notes */}
              {selectedPersonDetail.notes && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Context & Notes</h4>
                  <p className="text-xs bg-muted/30 p-3 rounded border border-border text-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedPersonDetail.notes}
                  </p>
                </div>
              )}

              {/* Interaction Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Interaction Timeline ({selectedPersonDetail.interactions.length})
                  </h4>
                </div>

                {selectedPersonDetail.interactions.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg">
                    No interactions logged yet. Click "Log Interaction" to start tracking.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1" data-testid="interactions-timeline">
                    {selectedPersonDetail.interactions.map((item) => {
                      const channelItem = CHANNELS.find((c) => c.value === item.channel);
                      const ChannelIcon = channelItem?.icon || MessageSquare;

                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-md border border-border bg-card hover:bg-muted/30 transition-colors flex items-start justify-between gap-3 text-xs"
                          data-testid={`interaction-item-${item.id}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="p-1.5 rounded bg-primary/10 text-primary mt-0.5">
                              <ChannelIcon className="w-3.5 h-3.5" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold capitalize text-foreground">{item.channel}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(item.date).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{item.summary}</p>
                              {item.nextFollowUpDate && (
                                <div className="text-[11px] text-primary flex items-center gap-1 mt-1 font-medium">
                                  <Calendar className="w-3 h-3" />
                                  <span>Next follow-up: {new Date(item.nextFollowUpDate).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteInteraction(selectedPersonDetail.id, item.id)}
                            className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                            title="Delete log"
                            data-testid={`delete-interaction-${item.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Linked Entities (Tasks, Projects, Notes) */}
              <div className="space-y-4 pt-2 border-t border-border">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Linked Work & Knowledge
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Linked Tasks */}
                  <div className="p-3 rounded-lg border border-border bg-card/60 space-y-2" data-testid="linked-tasks-section">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1">
                        <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
                        Tasks
                      </span>
                      <span className="text-muted-foreground">({selectedPersonDetail.linkedTasks.length})</span>
                    </div>
                    {selectedPersonDetail.linkedTasks.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">No tasks linked</p>
                    ) : (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {selectedPersonDetail.linkedTasks.map((t) => (
                          <div key={t.id} className="text-xs truncate flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${t.status === "completed" ? "bg-emerald-500" : "bg-amber-500"}`} />
                            <span className={t.status === "completed" ? "line-through text-muted-foreground" : "font-medium"}>
                              {t.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Linked Projects */}
                  <div className="p-3 rounded-lg border border-border bg-card/60 space-y-2" data-testid="linked-projects-section">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1">
                        <FolderKanban className="w-3.5 h-3.5 text-purple-500" />
                        Projects
                      </span>
                      <span className="text-muted-foreground">({selectedPersonDetail.linkedProjects.length})</span>
                    </div>
                    {selectedPersonDetail.linkedProjects.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">No projects linked</p>
                    ) : (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {selectedPersonDetail.linkedProjects.map((proj) => (
                          <div key={proj.id} className="text-xs truncate font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            <span>{proj.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Linked Notes */}
                  <div className="p-3 rounded-lg border border-border bg-card/60 space-y-2" data-testid="linked-notes-section">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-emerald-500" />
                        Notes
                      </span>
                      <span className="text-muted-foreground">({selectedPersonDetail.linkedNotes.length})</span>
                    </div>
                    {selectedPersonDetail.linkedNotes.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">No notes linked</p>
                    ) : (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {selectedPersonDetail.linkedNotes.map((n) => (
                          <a
                            key={n.id}
                            href={`/notes?id=${n.id}`}
                            className="text-xs truncate font-medium flex items-center gap-1.5 hover:text-primary transition-colors"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="truncate">{n.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-border text-xs">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeletePerson(selectedPersonDetail)}
                  className="h-8 text-xs gap-1"
                  data-testid="modal-delete-person-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Contact
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditModal(selectedPersonDetail)}
                    className="h-8 text-xs gap-1"
                    data-testid="modal-edit-person-btn"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Add / Edit Person Modal */}
        <Modal
          isOpen={isPersonModalOpen}
          onClose={() => setIsPersonModalOpen(false)}
          title={editingPerson ? "Edit Contact" : "Add New Contact"}
          className="max-w-lg"
        >
          <form onSubmit={handleSavePerson} className="space-y-4 pt-2" data-testid="person-form">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Full Name *</label>
              <Input
                placeholder="e.g. Sarah Connor"
                value={personForm.name}
                onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
                required
                data-testid="person-form-name"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Relationship Type</label>
                <select
                  value={personForm.relationshipType}
                  onChange={(e) => setPersonForm({ ...personForm, relationshipType: e.target.value as any })}
                  className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background"
                  data-testid="person-form-relationship"
                >
                  {RELATIONSHIP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Company / Organization</label>
                <Input
                  placeholder="e.g. Acme Corp"
                  value={personForm.company || ""}
                  onChange={(e) => setPersonForm({ ...personForm, company: e.target.value })}
                  data-testid="person-form-company"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Role / Title</label>
                <Input
                  placeholder="e.g. VP of Product"
                  value={personForm.role || ""}
                  onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })}
                  data-testid="person-form-role"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Email</label>
                <Input
                  type="email"
                  placeholder="sarah@example.com"
                  value={personForm.email || ""}
                  onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })}
                  data-testid="person-form-email"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Phone</label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={personForm.phone || ""}
                  onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
                  data-testid="person-form-phone"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Next Follow-up Date</label>
                <Input
                  type="date"
                  value={personForm.nextFollowUpDate || ""}
                  onChange={(e) => setPersonForm({ ...personForm, nextFollowUpDate: e.target.value })}
                  data-testid="person-form-next-followup"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Tags</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddTag} className="h-8 text-xs">
                  Add
                </Button>
              </div>
              {personForm.tags && personForm.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {personForm.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive text-muted-foreground ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Background & Context Notes</label>
              <Textarea
                placeholder="Key details, how you met, mutual interests, priorities..."
                value={personForm.notes || ""}
                onChange={(e) => setPersonForm({ ...personForm, notes: e.target.value })}
                rows={3}
                data-testid="person-form-notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPersonModalOpen(false)}
                disabled={savingPerson}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingPerson} data-testid="save-person-submit-btn">
                {savingPerson ? "Saving..." : editingPerson ? "Save Changes" : "Create Contact"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Log Interaction Modal */}
        <Modal
          isOpen={isInteractionModalOpen}
          onClose={() => setIsInteractionModalOpen(false)}
          title={`Log Interaction: ${interactionTargetPerson?.name || ""}`}
          className="max-w-md"
        >
          <form onSubmit={handleSaveInteraction} className="space-y-4 pt-2" data-testid="interaction-form">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Channel</label>
                <select
                  value={interactionForm.channel}
                  onChange={(e) => setInteractionForm({ ...interactionForm, channel: e.target.value as any })}
                  className="w-full h-9 px-3 text-xs rounded-md border border-input bg-background capitalize"
                  data-testid="interaction-form-channel"
                >
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Date & Time</label>
                <Input
                  type="datetime-local"
                  value={interactionForm.date || ""}
                  onChange={(e) => setInteractionForm({ ...interactionForm, date: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="interaction-form-date"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Discussion Summary & Notes *</label>
              <Textarea
                placeholder="What did you discuss? Key takeaways, action items, next steps..."
                value={interactionForm.summary}
                onChange={(e) => setInteractionForm({ ...interactionForm, summary: e.target.value })}
                rows={4}
                required
                data-testid="interaction-form-summary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Set Next Follow-up Reminder</label>
              <Input
                type="date"
                value={interactionForm.nextFollowUpDate || ""}
                onChange={(e) => setInteractionForm({ ...interactionForm, nextFollowUpDate: e.target.value })}
                className="h-9 text-xs"
                data-testid="interaction-form-next-followup"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Setting this will update the contact's reminder schedule and surface on your dashboard.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInteractionModalOpen(false)}
                disabled={savingInteraction}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingInteraction} data-testid="save-interaction-submit-btn">
                {savingInteraction ? "Saving..." : "Log Interaction"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
