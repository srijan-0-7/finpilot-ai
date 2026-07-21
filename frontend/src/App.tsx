import { useEffect, useState } from 'react';
import { Sidebar } from './components/Navigation/Sidebar';
import { ChatInterface } from './components/Chat/ChatInterface';
import { ExecutiveDashboard } from './components/Dashboard/ExecutiveDashboard';
import { SchemaExplorer } from './components/Data/SchemaExplorer';
import { SettingsPanel } from './components/Settings/SettingsPanel';
import { SharedResultView } from './components/Share/SharedResultView';

function getShareIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/share\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [shareId, setShareId] = useState<string | null>(getShareIdFromHash());

  useEffect(() => {
    const onHashChange = () => setShareId(getShareIdFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A shared link takes over the whole page — no sidebar, just the read-only result.
  if (shareId) {
    return <SharedResultView shareId={shareId} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-white dark:bg-brand-dark overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 min-h-0 relative pb-16 md:pb-0">
        {activeTab === 'dashboard' && <ExecutiveDashboard />}
        {activeTab === 'chat' && <ChatInterface />}
        {activeTab === 'schema' && <SchemaExplorer />}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

export default App;
