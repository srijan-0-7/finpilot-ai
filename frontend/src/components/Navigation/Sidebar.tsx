import { LayoutDashboard, MessageSquare, Database, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { id: 'chat', icon: <MessageSquare size={20} />, label: 'Copilot AI' },
  { id: 'schema', icon: <Database size={20} />, label: 'Data Explorer' },
];

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <>
      {/* Desktop: vertical sidebar, always visible */}
      <div className="hidden md:flex w-64 bg-gray-50 dark:bg-[#0B0F19] border-r border-gray-200 dark:border-gray-800 flex-col h-screen flex-shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <span className="text-brand-accent text-2xl">▲</span> FinPilot<span className="font-light">AI</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === item.id
                  ? 'bg-brand-accent/10 text-brand-accent border border-brand-accent/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-brand-accent/10 text-brand-accent'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            <Settings size={20} /> Settings
          </button>
        </div>
      </div>

      {/* Mobile: slim top bar + bottom tab bar */}
      <div className="md:hidden flex items-center justify-center p-3 bg-gray-50 dark:bg-[#0B0F19] border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-1.5">
          <span className="text-brand-accent text-lg">▲</span> FinPilot<span className="font-light">AI</span>
        </h1>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-gray-50 dark:bg-[#0B0F19] border-t border-gray-200 dark:border-gray-800 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {[...menuItems, { id: 'settings', icon: <Settings size={19} />, label: 'Settings' }].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              activeTab === item.id ? 'text-brand-accent' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
