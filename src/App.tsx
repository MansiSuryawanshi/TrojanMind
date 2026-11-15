import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import FinalCTA from './components/FinalCTA';
import { HOME_TABS } from './components/homeTabs';
import ReasoningChallenge from './components/ReasoningChallenge';
import { StudySchedule } from './components/StudySchedule';
import { StudyReport } from './components/StudyReport';
import { ExamPrep } from './components/ExamPrep';
import { Summary } from './components/Summary';
import { useStore } from './store/store';
import UploadMaterial from './components/UploadMaterial';
import { saveDocument } from './services/firebaseService';
import type { SaveDocumentMeta } from './services/firebaseService';
import { InitialDataLoader } from './components/InitialDataLoader';
import MyCourses from './components/MyCourses';
import MyMaterials from './components/MyMaterials';
import PiazzaAssistant from './components/PiazzaAssistant';
import './index.css';

const DEMO_SESSION = {
  roomId: 'demo-room',
  phase: 'revealed' as const,
  currentQuestion: null,
  players: ['student_a', 'student_b'],
  answers: {},
  scores: {
    round1: {
      student_a: { correctness: 6, reasoning_depth: 7, clarity: 8, total: 70, misconception_present: false, misconception_name: null, concept_gap: "Newton's 3rd Law" },
      student_b: { correctness: 5, reasoning_depth: 4, clarity: 6, total: 50, misconception_present: true, misconception_name: 'Teleological fallacy', concept_gap: 'Entropy' },
      depth_insight: 'Student A showed deeper causal reasoning',
      same_answer_different_depth: true,
      winner: 'A' as const,
    },
  },
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [uploadedContent, setUploadedContent] = useState<string>('');
  const [uploadMeta, setUploadMeta] = useState<SaveDocumentMeta>({});
  const setSession = useStore((state) => state.setSession);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [challengeSessionKey, setChallengeSessionKey] = useState<number>(0);
  // Saved workspace open on My Materials, and a study document to preselect in Challenge.
  const [openWorkspaceId, setOpenWorkspaceId] = useState<string | null>(null);
  const [challengeDocIds, setChallengeDocIds] = useState<string[]>([]);

  const openWorkspace = (id: string | null) => {
    setOpenWorkspaceId(id);
    setActiveTab(HOME_TABS.materials);
    window.scrollTo({ top: 0 });
  };

  const startChallengeWith = (documentId: string) => {
    setChallengeDocIds([documentId]);
    setChallengeSessionKey((prev) => prev + 1);
    navigateFromHome(HOME_TABS.challenge);
  };

  useEffect(() => { 
    setSession(DEMO_SESSION); 

    // Challenge is tab 3 after Summary insert
    const params = new URLSearchParams(window.location.search);
    if (params.get('roomId') || params.get('roomCode')) {
      setActiveTab(HOME_TABS.challenge);
    }
  }, [setSession]);

  // Homepage links: switch tab and start the new page at the top.
  const navigateFromHome = (tab: number) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  const exploreFeatures = () => {
    const section = document.getElementById('features');
    if (!section) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // Move keyboard focus to the section heading without a second scroll jump.
    document.getElementById('features-title')?.focus({ preventScroll: true });
  };

  const persistUpload = async (fileName: string, nextTab: number) => {
    if (!uploadedContent.trim()) {
      console.warn("[App-Step.Abort] Cannot save: uploadedContent is empty.");
      return;
    }

    console.group(`[App-Upload-Pipeline] Started for: ${fileName}`);
    setIsSaving(true);
    try {
      console.log(`[App-Step 1] Initializing Firestore write...`);
      const docId = await saveDocument(fileName, uploadedContent, uploadMeta);
      console.log(`[App-Step 2] Firebase success! Document ID: ${docId}. Navigating to tab ${nextTab}...`);
      if (nextTab === HOME_TABS.challenge) setChallengeSessionKey((prev) => prev + 1);
      setActiveTab(nextTab);
      console.log(`[App-Step 3] Navigation triggered.`);
      console.groupEnd();
    } catch (error: any) {
      console.group("[App-Step.FAIL] Execution halted.");
      console.error(`Reason: ${error?.message || "Unknown error"}`);
      console.error("Stack:", error);
      console.groupEnd();
      console.groupEnd();
      
      alert(`Critical: Failed to save study material.\n\nRoot Error: ${error?.message || "Firebase Network/Auth Error"}\n\nPlease check your internet connection and Vercel environment variables.`);
    } finally {
      setIsSaving(false);
      console.log(`[App-Lifecycle] Upload state reset. (isSaving=false)`);
    }
  };
  
  const handleStartChallenge = async (fileName: string = "Manual Upload") => {
    await persistUpload(fileName, HOME_TABS.challenge);
  };

  const handleSaveForSummary = async (fileName: string = "Manual Upload") => {
    await persistUpload(fileName, HOME_TABS.summary);
  };

  const handleContentChange = (content: string, meta?: SaveDocumentMeta) => {
    setUploadedContent(content);
    if (meta) setUploadMeta(meta);
    else if (!content.trim()) setUploadMeta({});
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <InitialDataLoader />
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          // The My Materials nav item always opens the history list.
          if (tab === HOME_TABS.materials) setOpenWorkspaceId(null);
          setActiveTab(tab);
        }}
      />
      <main>
        {activeTab === HOME_TABS.home && (
          <div className="animate-fade-in">
            {/* "Get Started" mirrors the navbar's Get Started (My Courses). */}
            <Hero onGetStarted={() => navigateFromHome(HOME_TABS.courses)} onExploreFeatures={exploreFeatures} />
            <Features onNavigate={navigateFromHome} />
            <HowItWorks />
            <FinalCTA
              onCourses={() => navigateFromHome(HOME_TABS.courses)}
              onUpload={() => navigateFromHome(HOME_TABS.upload)}
            />
            <footer className="py-10 px-4 border-t border-line bg-surface">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted">
                <div className="flex items-center gap-2">
                  <span className="brand-mark w-7 h-7 text-[11px] rounded-md" aria-hidden="true">TM</span>
                  <span className="font-semibold text-ink">TrojanMind</span>
                  <span>&copy; 2026</span>
                </div>
                <span>Learn together. Reason deeper.</span>
              </div>
            </footer>
          </div>
        )}
        {activeTab === HOME_TABS.upload && (
          <div className="container mx-auto px-4 sm:px-6 py-10">
            <UploadMaterial 
              content={uploadedContent} 
              onContentChange={handleContentChange}
              onStart={handleStartChallenge}
              onSaveForSummary={handleSaveForSummary}
              isSaving={isSaving}
              onBack={() => setActiveTab(HOME_TABS.courses)}
            />
          </div>
        )}
        {activeTab === HOME_TABS.summary && (
          <Summary
            onGoToExamPrep={() => setActiveTab(HOME_TABS.examPrep)}
            onGoToSchedule={() => setActiveTab(HOME_TABS.schedule)}
            onGoToUpload={() => setActiveTab(HOME_TABS.upload)}
          />
        )}
        {activeTab === HOME_TABS.challenge && (
          <div className="container mx-auto px-4 sm:px-6 py-6 animate-fade-in">
            <ReasoningChallenge key={challengeSessionKey} preselectDocumentIds={challengeDocIds} onAddMaterial={() => navigateFromHome(HOME_TABS.upload)} />
          </div>
        )}
        {activeTab === HOME_TABS.examPrep && (
          <div className="animate-fade-in">
            <ExamPrep
              onGoToSchedule={() => setActiveTab(HOME_TABS.schedule)}
              onGoToChallenge={() => setActiveTab(HOME_TABS.challenge)}
            />
          </div>
        )}
        {activeTab === HOME_TABS.schedule && (
          <StudySchedule onSwitchToChallenge={() => setActiveTab(HOME_TABS.challenge)} />
        )}
        {activeTab === HOME_TABS.report && <StudyReport />}
        {activeTab === HOME_TABS.courses && <MyCourses onUpload={() => navigateFromHome(HOME_TABS.upload)} onOpenWorkspace={openWorkspace} />}
        {activeTab === HOME_TABS.materials && (
          <MyMaterials
            openWorkspaceId={openWorkspaceId}
            onOpenWorkspace={openWorkspace}
            onNavigate={navigateFromHome}
            onChallenge={startChallengeWith}
            onUpload={() => navigateFromHome(HOME_TABS.upload)}
          />
        )}
      </main>
      {/* Authenticated-only floating assistant; does not add a nav tab. */}
      <PiazzaAssistant />
    </div>
  );
};

export default App;
