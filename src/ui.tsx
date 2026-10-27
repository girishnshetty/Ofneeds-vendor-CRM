import React, { useEffect, useRef, useId } from "react";
import {
  X,
  Monitor,
  KeyRound,
  Shield,
  Truck,
  Clock,
  CheckCircle2,
  Link,
  Copy,
  FolderKanban,
  RefreshCw,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Backpack,
  BadgeCheck,
  Bell,
  BookmarkPlus,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChartNoAxesCombined,
  ChartPie,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  CircleCheck,
  CircleHelp,
  CirclePlay,
  CirclePlus,
  ClipboardList,
  ClipboardPlus,
  Columns3,
  Compass,
  Contact,
  ContactRound,
  CornerDownLeft,
  CupSoda,
  Download,
  Edit,
  FileSpreadsheet,
  FileText,
  Files,
  FolderOpen,
  GitCompareArrows,
  Headphones,
  House,
  Info,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  List,
  ListFilter,
  ListTodo,
  LockKeyhole,
  LogOut,
  Luggage,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Network,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Phone,
  Pin,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  Warehouse,
} from "lucide-react";
const Icons = {
  X,
  Monitor,
  KeyRound,
  Shield,
  Truck,
  Clock,
  CheckCircle2,
  Link,
  Copy,
  FolderKanban,
  RefreshCw,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Backpack,
  BadgeCheck,
  Bell,
  BookmarkPlus,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChartNoAxesCombined,
  ChartPie,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  CircleCheck,
  CircleHelp,
  CirclePlay,
  CirclePlus,
  ClipboardList,
  ClipboardPlus,
  Columns3,
  Compass,
  Contact,
  ContactRound,
  CornerDownLeft,
  CupSoda,
  Download,
  Edit,
  FileSpreadsheet,
  FileText,
  Files,
  FolderOpen,
  GitCompareArrows,
  Headphones,
  House,
  Info,
  Layers3,
  LayoutDashboard,
  LayoutGrid,
  List,
  ListFilter,
  ListTodo,
  LockKeyhole,
  LogOut,
  Luggage,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Moon,
  Network,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Phone,
  Pin,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  ShieldQuestion,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  Warehouse,
};
export function Icon({
  name,
  size = 18,
  ...props
}: {
  name: string;
  size?: number;
  [key: string]: any;
}) {
  const Component =
    (Icons as unknown as Record<string, React.ElementType>)[name] ||
    Icons.Circle;
  return (
    <Component size={size} strokeWidth={1.7} aria-hidden="true" {...props} />
  );
}
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <span className="logo-symbol">
        <Icon name="Boxes" size={23} />
      </span>
      {!compact && (
        <span>
          OfNeeds<span className="logo-sub">VENDOR CRM</span>
        </span>
      )}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  const tone = [
    "Active",
    "Authorized",
    "Completed",
    "Quoted",
    "Available",
    "Approved",
    "Accepted",
    "Received",
    "sent",
  ].includes(value)
    ? "green"
    : [
          "Pending",
          "Unverified",
          "Open",
          "Reviewing",
          "On request",
          "Pending approval",
          "Partially received",
          "blocked",
          "queued",
          "Submitted",
        ].includes(value)
      ? "amber"
      : [
            "Expired",
            "High",
            "Archived",
            "Cancelled",
            "Declined",
            "Rejected",
            "failed",
            "Changes requested",
          ].includes(value)
        ? "red"
        : "blue";
  return <Badge tone={tone}>{value || "Not set"}</Badge>;
}
export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  return (
    <span
      className={`avatar ${large ? "large" : ""} hue-${(name || "").length % 5}`}
    >
      {(name || "OF")
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Add a record to get started.",
  action,
  children,
}: {
  title?: string;
  description?: string;
  action?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="FolderOpen" size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" onClick={action}>
          <Icon name="Plus" />
          Add first record
        </button>
      )}
      {children}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="X" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading workspace">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
export function Money({ value }: { value: number }) {
  return (
    <>
      {new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
      }).format(value)}
    </>
  );
}
