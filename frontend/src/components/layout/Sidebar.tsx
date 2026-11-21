
"use client";

type SidebarProps = {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
};

const navigation = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "audio-analysis", label: "Audio Analysis", icon: "♫" },
  { id: "story-assessment", label: "Story Reading", icon: "▷" },
  { id: "research-dataset", label: "Research Dataset", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({
  activeSection,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon" aria-hidden="true">
          S
        </div>
        <div>
          <strong>Speech Analytics</strong>
          <small>Research Platform</small>
        </div>
      </div>

      <nav aria-label="Main navigation">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${
              activeSection === item.id ? "active" : ""
            }`}
            onClick={() => onNavigate(item.id)}
            aria-current={
              activeSection === item.id ? "page" : undefined
            }
            title={item.label}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <span className="status-dot" />
        Backend connection checked during analysis
      </div>
    </aside>
  );
}
