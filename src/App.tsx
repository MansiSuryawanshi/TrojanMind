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
import { useStore } from './store/store';
import UploadMaterial from './components/UploadMaterial';
import { saveDocument } from './services/firebaseService';
import { InitialDataLoader } from './components/InitialDataLoader';
import MyCourses from './components/MyCourses';
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
  const setSession = useStore((state) => state.setSession);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [challengeSessionKey, setChallengeSessionKey] = useState<number>(0);

  useEffect(() => { 
    setSession(DEMO_SESSION); 

    // Handle deep link to challenge room
    const params = new URLSearchParams(window.location.search);
    if (params.get('roomId') || params.get('roomCode')) {
      setActiveTab(2);
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

  const handleStartChallenge = async (fileName: string = "Manual Upload") => {
    if (!uploadedContent.trim()) {
      console.warn("[App-Step.Abort] Cannot start challenge: uploadedContent is empty.");
      return;
    }
    
    console.group(`[App-Upload-Pipeline] Started for: ${fileName}`);
    setIsSaving(true);
    try {
      console.log(`[App-Step 1] Initializing Firestore write...`);
      const docId = await saveDocument(fileName, uploadedContent);
      console.log(`[App-Step 2] Firebase success! Document ID: ${docId}. Navigating to Challenge arena...`);
      
      setChallengeSessionKey(prev => prev + 1); // Force Challenge reload
      setActiveTab(2);
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <InitialDataLoader />
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main>
        {activeTab === 0 && (
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
        {activeTab === 1 && (
          <div className="container mx-auto px-4 sm:px-6 py-10">
            <UploadMaterial 
              content={uploadedContent} 
              onContentChange={setUploadedContent} 
              onStart={handleStartChallenge} 
              isSaving={isSaving}
              onBack={() => setActiveTab(HOME_TABS.courses)}
            />
          </div>
        )}
        {activeTab === 2 && (
          <div className="container mx-auto px-4 sm:px-6 py-6 animate-fade-in">
            <ReasoningChallenge key={challengeSessionKey} onAddMaterial={() => navigateFromHome(HOME_TABS.upload)} />
          </div>
        )}
        {activeTab === 3 && (
          <div className="animate-fade-in">
            <ExamPrep />
          </div>
        )}
        {activeTab === 4 && <StudySchedule onSwitchToChallenge={() => setActiveTab(2)} />}
        {activeTab === 5 && <StudyReport />}
        {activeTab === 6 && <MyCourses onUpload={() => navigateFromHome(HOME_TABS.upload)} />}
      </main>
    </div>
  );
};

export default App;
