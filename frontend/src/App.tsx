import { useRef, useState, useEffect } from "react";
import { WebRTCSession } from "./services/webrtc";
import type { ChecklistItem } from "./services/checklist";
import { DEFAULT_CHECKLIST, createChecklistItems } from "./services/checklist";
import { getSession, putSession } from "./services/db";
import type { Session, StructuredChecklist, PermitRecord, PermitType, SessionDomain } from "./services/sessionModel";
import SummaryRow from "./components/SummaryRow";
import { IconClose, IconDoc, IconShield, IconChat } from "./components/Icon";
import "./App.css";

interface AppProps {
  sessionId?: string;
  initialMode?: "TBM" | "EHS";
  initialDomain?: SessionDomain;
}

// Minimal chat message type
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface Event {
  type: string;
  [key: string]: unknown;
}

// Prior information interface
interface PriorInformation {
  workLocation?: string;
  workContentDetails?: string;
  numberOfWorkers?: number;
  equipmentDetails?: string;
}

// Citation interface
interface Citation {
  title: string;
  url: string;
  summary: string;
}

interface CitationDisplay {
  citations: Citation[];
  context?: string;
  timestamp: number;
}

// Language-specific initial cue messages
const INITIAL_CUE_MESSAGES: Record<Language, string> = {
  korean: "동그라미를 터치해주세요",
  english: "Touch the circle to start",
  vietnamese: "Chạm vào vòng tròn để bắt đầu",
  thai: "แตะวงกลมเพื่อเริ่มต้น",
  indonesian: "Sentuh lingkaran untuk memulai",
};

// App mode type
type AppMode = "TBM" | "EHS";

// Language type (v0.2.0: polish dropped, thai/indonesian added)
type Language = "english" | "korean" | "vietnamese" | "thai" | "indonesian";

// Language configuration
const LANGUAGE_CONFIG: Record<Language, { name: string; flag: string }> = {
  english: { name: "English", flag: "🇺🇸" },
  korean: { name: "한국어", flag: "🇰🇷" },
  vietnamese: { name: "Tiếng Việt", flag: "🇻🇳" },
  thai: { name: "ภาษาไทย", flag: "🇹🇭" },
  indonesian: { name: "Bahasa Indonesia", flag: "🇮🇩" },
};

// Recommended questions for EHS mode
const RECOMMENDED_QUESTIONS = [
  "셀 조립 라인에서 신규 설비가 도입됐는데 어떤 위험요소가 있는지 알려줘.",
  "판금 작업 중 손가락 끼임 사고를 방지하려면 어떤 보호장비를 착용해야 해?",
  "포장작업 라인에서 박스 사이즈가 변경됐을 때 작업자의 부하 위험은 어떻게 평가해야 할까?",
  "출하 작업 시 리프트가 고장났을 때 비상조치 절차는 어떻게 되지?",
  "성형 작업 중 화상 위험이 있는 공정은 어디고, 이를 방지하는 방법은 뭘까?",
  "유니트 작업 공정에서 중량물 취급 시 가장 흔한 사고사례는 뭐야?",
  "내상 공정에서 화학물질이 누출되었을 때 즉시 해야 할 조치는 뭐야?",
  "발포 작업에 사용하는 화학제 변경 시 어떤 유해위험성 평가가 필요한지 알려줘.",
  "작업 라인이 재배치되었을 때, 이동 동선 변경에 따른 안전조치사항은 뭐가 있을까?",
  "다양한 작업자들이 혼재된 구역에서 안전사고를 줄이기 위한 구역 분리 기준은 어떻게 정해야 해?",
  "셀 조립 작업에서 전동 드라이버가 고속 타입으로 바뀌었는데 손목 부상 위험은 어떻게 줄일 수 있어?",
  "셀 조립 라인에서 볼트 체결 공정 중 전동공구의 토크 설정이 바뀌었을 때 안전하게 사용하는 방법은 뭐야?",
  "판금 작업에서 샤링기(절단기) 교체 후 날 각도가 달라졌는데 작업자 안전 교육은 어떻게 해야 해?",
  "포장 작업 중 자동 테이핑기 속도가 조정되었을 때 손 끼임 방지를 위한 조치는 뭐가 있을까?",
  "출하 라인에서 팔레트 자동적재기가 도입됐을 때 충돌사고를 방지하려면 어떤 구역 분리가 필요해?",
  "성형 공정 중 금형 온도 조절 시스템이 고장났을 때 발생할 수 있는 화상 위험과 그 대비책은 뭐야?",
  "유니트 조립 중 콘덴서 고정 브래킷 사양이 바뀌었는데 중량물 취급 시 유의할 점은 뭐야?",
  "내상 공정에서 R-32 냉매를 R-290 냉매로 바꾼다는데 폭발 위험은 어떻게 확인하고 대응해야 해?",
  "발포 공정에서 사이클로펜테인 함량이 높아졌다고 하는데 화재 위험에 따른 환기 기준은 어떻게 되지?",
  "작업장 바닥 도장 재시공 이후 미끄럼 위험이 늘었는데 보행 안전을 위한 조치는 어떻게 해야 해?",
  "전동 드라이버 토크 과다 설정으로 인한 손목·팔꿈치 질환 발생 사례가 있을까?",
  "판금 절단기 칼날 교체 후 첫 작업 시 주의해야 할 안전 체크포인트는 뭐야?",
  "사이클로펜테인을 사용하는 발포 공정에서 정전기 방지를 위한 작업자 복장은 어떤 기준이 있어?",
  "R-290 냉매 작업 중 누출 감지 센서 오작동 사례가 있었을 때 어떻게 대처했는지 알려줘.",
  "유니트 작업 시 협소 공간에서 작업할 때 작업자 간 충돌을 방지하려면 어떤 신호체계가 효과적일까?",
  "출하구역에서 물류 동선이 교차되었을 때 발생한 사고 사례와 그 개선사례를 알고 싶어.",
  "작업자가 포장기계에 손을 넣은 사고가 있었을 때, 인터록(interlock) 기능 외에 추가로 도입할 수 있는 안전장치는 뭐가 있어?",
  "최근 라인 재배치로 셀 간 간격이 좁아졌을 때, 협동로봇과의 안전거리 기준은 어떻게 적용돼야 해?",
  "작업장 바닥에 쌓인 미세먼지로 인한 화재 위험을 줄이기 위한 설비 관리 방안은 뭐야?",
  "판금 작업장의 소음 수준이 85dB를 넘을 경우 법적으로 어떤 조치를 해야 해?",
  "신규 작업자가 투입되었을 때, 화학물질 안전교육은 어떤 방식으로 해야 효과적일까?",
  "발포 공정의 작업중지 기준이 되는 조건은 어떤 게 있고, 누가 판단을 내려야 해?",
  "셀조립 작업에서 협동작업 시 커뮤니케이션 오류로 발생했던 사고사례가 있다면 알려줘.",
  "유니트 고정 볼트 사양이 바뀐 뒤 반복적인 손목통증 호소가 늘었는데, 이런 근골격계 질환은 어떻게 예방해야 해?",
  "에어컨 제품의 고용량화로 유니트 중량이 증가했을 때, 리프터와 인력배치 기준은 어떻게 조정하는 게 맞을까?",
];

// Document retrieval types
interface DocumentResult {
  title: string;
  id: string;
  url: string;
  score: number;
  keywords: string[];
  content: string;
}

interface RetrieveResponse {
  documents: DocumentResult[];
  query: string;
  total_found: number;
}

function App({ sessionId, initialMode, initialDomain }: AppProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<WebRTCSession | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [talking, setTalking] = useState<"idle" | "user" | "assistant">("idle"); // Track who is talking
  // Checklist state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  // Add state for chat log visibility
  const [showChatLog, setShowChatLog] = useState(false);
  // Add state for checklist panel at bottom
  const [showChecklistPanel, setShowChecklistPanel] = useState(false);
  // Add state for cue message
  const [cueMessage, setCueMessage] = useState<string>("");
  // Add state for interruption message with timer
  const [interruptionMessage, setInterruptionMessage] = useState<string>("");
  const [showInterruption, setShowInterruption] = useState<boolean>(false);
  const interruptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Add state for prior information
  const [priorInfo, setPriorInfo] = useState<PriorInformation>({});
  // Add mode state
  const [currentMode, setCurrentMode] = useState<AppMode>(initialMode || "TBM");
  // v0.2.0: domain (optional; legacy sessions stay undefined)
  const [currentDomain, setCurrentDomain] = useState<SessionDomain | undefined>(initialDomain);
  // v0.2.0: permits collected via request_permit tool
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  // Session persistence refs
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase B: structured 8-field checklist (progressive)
  const [structured, setStructured] = useState<StructuredChecklist>({});
  const [hazardSuggestions, setHazardSuggestions] = useState<{ hazard: string; rationale: string }[]>([]);
  const [finalSummary, setFinalSummary] = useState<string>("");
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
  // Add language state
  const [currentLanguage, setCurrentLanguage] = useState<Language>("korean");
  // Add state for language selector visibility
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  // Add citations state
  const [citations, setCitations] = useState<CitationDisplay[]>([]);
  // Add state for recommended questions
  const [showRecommendedQuestions, setShowRecommendedQuestions] = useState(false);
  const [displayedQuestions, setDisplayedQuestions] = useState<string[]>([]);
  const [remainingQuestions, setRemainingQuestions] = useState<string[]>([]);
  const [animatingOut, setAnimatingOut] = useState(false);
  const questionRotationRef = useRef<NodeJS.Timeout | null>(null);
  // Add state for input focus to control microphone
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Function to get initial cue message based on current language
  const getInitialCueMessage = () => {
    return INITIAL_CUE_MESSAGES[currentLanguage] || INITIAL_CUE_MESSAGES.korean;
  };

  // Initialize cue message with language-specific greeting
  useEffect(() => {
    setCueMessage(getInitialCueMessage());
  }, [currentLanguage]);

  // Hydrate state from IndexedDB when a sessionId is provided
  useEffect(() => {
    if (!sessionId) {
      hydratedRef.current = true;
      return;
    }
    hydratedRef.current = false;
    let cancelled = false;
    getSession(sessionId).then((s) => {
      if (cancelled || !s) {
        hydratedRef.current = true;
        return;
      }
      setMessages(s.messages.map((m) => ({ role: m.role, text: m.text })));
      setChecklist(s.checklist_items);
      setPriorInfo(s.prior_info);
      setCitations(s.citations);
      if (s.mode) setCurrentMode(s.mode);
      if (s.language) setCurrentLanguage(s.language);
      setStructured(s.structured || {});
      setFinalSummary(s.final_summary || "");
      if (s.domain) setCurrentDomain(s.domain);
      setPermits(s.permits ?? []);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Auto-save state to IndexedDB (debounced) when persisted fields change
  useEffect(() => {
    if (!sessionId || !hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const existing = await getSession(sessionId);
        if (!existing) return;
        const nowIso = new Date().toISOString();
        const next: Session = {
          ...existing,
          mode: currentMode,
          language: currentLanguage,
          messages: messages.map((m) => ({ role: m.role, text: m.text, at: nowIso })),
          checklist_items: checklist,
          prior_info: priorInfo,
          citations,
          structured,
          final_summary: finalSummary || existing.final_summary,
          domain: currentDomain ?? existing.domain,
          permits,
          updated_at: nowIso,
        };
        if (!existing.work_type && priorInfo.workContentDetails) {
          next.work_type = priorInfo.workContentDetails;
        }
        if (!next.work_type && structured.work_summary) {
          next.work_type = structured.work_summary;
        }
        await putSession(next);
      })();
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessionId, messages, checklist, priorInfo, citations, currentMode, currentLanguage, structured, finalSummary, currentDomain, permits]);

  // Initialize recommended questions when switching to EHS mode
  useEffect(() => {
    if (currentMode === "EHS") {
      // Shuffle the questions and take first 4
      const shuffled = [...RECOMMENDED_QUESTIONS].sort(() => Math.random() - 0.5);
      setDisplayedQuestions(shuffled.slice(0, 4));
      setRemainingQuestions(shuffled.slice(4));
      setShowRecommendedQuestions(true);
    } else {
      setShowRecommendedQuestions(false);
      setDisplayedQuestions([]);
      setRemainingQuestions([]);
    }
  }, [currentMode]);

  // Question rotation logic
  useEffect(() => {
    if (currentMode === "EHS" && showRecommendedQuestions && remainingQuestions.length > 0) {
      questionRotationRef.current = setInterval(() => {
        setAnimatingOut(true);
        
        setTimeout(() => {
          setDisplayedQuestions(prev => {
            const newDisplayed = [...prev];
            newDisplayed.shift(); // Remove first (topmost) question
            return newDisplayed;
          });
          
          setRemainingQuestions(prev => {
            if (prev.length === 0) return prev;
            
            const randomIndex = Math.floor(Math.random() * prev.length);
            const selectedQuestion = prev[randomIndex];
            const newRemaining = prev.filter((_, index) => index !== randomIndex);
            
            setDisplayedQuestions(current => [...current, selectedQuestion]);
            
            return newRemaining;
          });
          
          setAnimatingOut(false);
        }, 300); // Match animation duration
      }, 5000); // Rotate every 5 seconds
    }

    return () => {
      if (questionRotationRef.current) {
        clearInterval(questionRotationRef.current);
      }
    };
  }, [currentMode, showRecommendedQuestions, remainingQuestions.length]);

  // Handle recommended question click
  const handleRecommendedQuestionClick = async (question: string) => {
    // Hide recommended questions
    setShowRecommendedQuestions(false);
    
    // Interrupt any ongoing audio response
    if (talking === "assistant" && sessionRef.current) {
      sessionRef.current.interruptResponse();
    }
    
    // Start session if not active
    if (!sessionActive) {
      await startSession(question, 'user');
    }
    
    // Add to chat log immediately
    setMessages(prev => [...prev, { role: "user", text: question }]);
  };

  // Close language selector when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showLanguageSelector) {
        setShowLanguageSelector(false);
      }
    };

    if (showLanguageSelector) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showLanguageSelector]);

  // Function to show interruption message for 5+ seconds
  const showInterruptionMessage = (message: string) => {
    // Clear any existing timeout
    if (interruptionTimeoutRef.current) {
      clearTimeout(interruptionTimeoutRef.current);
    }
    
    setInterruptionMessage(message);
    setShowInterruption(true);
    
    // Hide after 6 seconds
    interruptionTimeoutRef.current = setTimeout(() => {
      setShowInterruption(false);
      setInterruptionMessage("");
    }, 10000);
  };

  // Calculate checklist progress
  const completedCount = checklist.filter((item) => item.completed).length;
  const progress = checklist.length > 0 ? completedCount / checklist.length : 0;
  const progressPercent = Math.round(progress * 100);

  // Check if all items are completed
  const allItemsCompleted = checklist.length > 0 && completedCount === checklist.length && checklist.length === 5;

  // Phase B: 8-field structured progress (0-100)
  const structuredFields: Array<keyof StructuredChecklist> = [
    "work_summary",
    "changes_today",
    "hazards",
    "risk_scenarios",
    "mitigations",
    "ppe",
    "special_notes",
    "attendance_confirmed",
  ];
  const structuredFilledCount = structuredFields.reduce((acc, key) => {
    const v = structured[key];
    if (typeof v === "string") return acc + (v.trim().length > 0 ? 1 : 0);
    if (Array.isArray(v)) return acc + (v.length > 0 ? 1 : 0);
    if (typeof v === "boolean") return acc + (v ? 1 : 0);
    return acc;
  }, 0);
  const structuredProgressPercent = Math.round((structuredFilledCount / structuredFields.length) * 100);

  // Auto-scroll to bottom when chat log is opened or messages change
  useEffect(() => {
    if (showChatLog && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [showChatLog, messages]);

  // Cleanup interruption timeout on unmount
  useEffect(() => {
    return () => {
      if (interruptionTimeoutRef.current) {
        clearTimeout(interruptionTimeoutRef.current);
      }
      if (questionRotationRef.current) {
        clearInterval(questionRotationRef.current);
      }
    };
  }, []);

  // Add function to call retrieve-keywords endpoint
  const retrieveDocumentsByKeywords = async (keywords: string[]): Promise<RetrieveResponse | null> => {
    try {
      const response = await fetch('/api/retrieve-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keywords }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error retrieving documents by keywords:', error);
      return null;
    }
  };

  // Add function to call retrieve endpoint
  const retrieveDocuments = async (query: string): Promise<RetrieveResponse | null> => {
    try {
      const response = await fetch('/api/retrieve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: RetrieveResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error retrieving documents:', error);
      return null;
    }
  };

  function onFunctionCall(event: unknown) {
    const e = event as { name?: string; arguments?: string; call_id?: string };
    const functionName = e.name;
    const args = JSON.parse(e.arguments as string) ?? {};
    const callId = e.call_id ?? "";

    console.log("======== onFunctionCall ========");
    console.log(functionName, args, callId);

    // Handle retrieve_documents tool for both TBM and EHS modes
    if (functionName === "retrieve_documents") {
      const keywords = args.keywords as string[];
      if (keywords && Array.isArray(keywords) && keywords.length > 0) {
        console.log("🔍 Retrieving documents for keywords:", keywords);
        
        // Call backend API with keywords
        retrieveDocumentsByKeywords(keywords).then((retrieveResult) => {
          if (retrieveResult) {
            console.log("📄 Retrieved documents for keywords:", retrieveResult);
            console.log(`Found ${retrieveResult.total_found} documents for keywords: [${keywords.join(', ')}]`);
            
            // Format results for OpenAI
            const toolResult = {
              success: true,
              documents_found: retrieveResult.total_found,
              keywords_searched: keywords,
              documents: retrieveResult.documents.map(doc => ({
                title: doc.title,
                id: doc.id,
                url: doc.url,
                content: doc.content.substring(0, 500),
                relevance_score: doc.score,
                keywords: doc.keywords
              })),
              instruction: "Use the retrieved documents to provide helpful information. Analyze the documents and if relevant, use the display_document_citations tool to show users where they can find additional detailed information. Create concise summaries explaining why each document is relevant."
            };
            
            if (retrieveResult.documents.length > 0) {
              console.log("📋 Top documents:");
              retrieveResult.documents.forEach((doc, index) => {
                console.log(`${index + 1}. ${doc.title} (Score: ${doc.score.toFixed(2)})`);
                console.log(`   ID: ${doc.id}`);
                console.log(`   URL: ${doc.url}`);
                console.log(`   Content: ${doc.content?.substring(0, 100)}...`);
                console.log(`   Keywords: ${doc.keywords.join(', ')}`);
                console.log("---");
              });
            } else {
              console.log("❌ No documents found for the keywords");
            }
            
            // Return results to OpenAI
            sessionRef.current?.sendToolResult(callId, toolResult);
          } else {
            console.log("❌ Failed to retrieve documents for keywords");
            sessionRef.current?.sendToolResult(callId, {
              success: false,
              error: "Failed to retrieve documents",
              documents_found: 0,
              keywords_searched: keywords,
              documents: []
            });
          }
        });
      } else {
        console.log("❌ Invalid keywords for document retrieval");
        sessionRef.current?.sendToolResult(callId, {
          success: false,
          error: "Invalid keywords provided",
          documents_found: 0,
          keywords_searched: [],
          documents: []
        });
      }
      return;
    }

    // Handle display_document_citations tool for both TBM and EHS modes
    if (functionName === "display_document_citations") {
      const citationData = args.citations as Citation[];
      const context = args.context as string;
      
      if (citationData && Array.isArray(citationData)) {
        console.log("📚 Displaying document citations:", citationData);
        
        // Add citations to state
        const newCitation: CitationDisplay = {
          citations: citationData,
          context: context,
          timestamp: Date.now()
        };
        
        setCitations((prev) => [...prev, newCitation]);
        sessionRef.current?.sendToolResult(callId, { result: "success" });
      } else {
        console.log("❌ Invalid citation data");
        sessionRef.current?.sendToolResult(callId, { result: "error", message: "Invalid citation data" });
      }
      return;
    }

    // Only handle TBM-specific functions in TBM mode
    if (currentMode === "TBM") {
      switch (functionName) {
        case "complete_checklist_item":
          // Mark checklist item as complete in state
          setChecklist((prev) =>
            prev.map((item) =>
              item.index === Number(args.index)
                ? {
                    ...item,
                    completed: true,
                    utterance: args.utterance as string,
                    checkedAt: new Date().toISOString(),
                  }
                : item
            )
          );
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "collect_prior_information":
          // Update prior information state
          setPriorInfo((prev) => ({
            ...prev,
            ...(args.work_location && { workLocation: args.work_location }),
            ...(args.work_content_details && { workContentDetails: args.work_content_details }),
            ...(args.number_of_workers && { numberOfWorkers: args.number_of_workers }),
            ...(args.equipment_details && { equipmentDetails: args.equipment_details }),
          }));
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "create_dynamic_checklist":
          // Create dynamic checklist from AI-generated items
          if (args.items && Array.isArray(args.items)) {
            const newChecklist = createChecklistItems(args.items as string[]);
            setChecklist(newChecklist);
          }
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "display_cue":
          // Display cue message
          setCueMessage((args.cue as string) || "");
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "interrupt_for_safety": {
          // Handle safety interruption - display urgent interruption message
          const interruptMessage = "잠깐만요! " + (args.safety_message as string || "안전을 위해 순서대로 진행해 주세요.");
          showInterruptionMessage(interruptMessage);
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "update_session_field": {
          // Phase B: progressive structured 8-field update
          const field = args.field as keyof StructuredChecklist;
          const stringValue = args.string_value as string | undefined;
          const arrayValue = args.array_value as string[] | undefined;
          const booleanValue = args.boolean_value as boolean | undefined;
          const mode = ((args.mode as string) || "append") === "replace" ? "replace" : "append";
          setStructured((prev) => {
            const next: StructuredChecklist = { ...prev };
            const arrayFields: Array<keyof StructuredChecklist> = [
              "hazards",
              "risk_scenarios",
              "mitigations",
              "ppe",
            ];
            if (arrayFields.includes(field) && arrayValue) {
              const existing = (prev[field] as string[] | undefined) || [];
              const merged = mode === "append" ? [...existing, ...arrayValue] : arrayValue;
              (next[field] as unknown) = Array.from(new Set(merged));
            } else if (field === "attendance_confirmed" && typeof booleanValue === "boolean") {
              next.attendance_confirmed = booleanValue;
            } else if (
              (field === "work_summary" || field === "changes_today" || field === "special_notes") &&
              typeof stringValue === "string"
            ) {
              (next[field] as unknown) = stringValue;
            }
            return next;
          });
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "suggest_hazards": {
          const suggestions = (args.suggestions as { hazard: string; rationale: string }[]) || [];
          setHazardSuggestions(suggestions);
          sessionRef.current?.sendToolResult(callId, { result: "success", count: suggestions.length });
          return;
        }

        case "finalize_tbm": {
          const summary = (args.final_summary as string) || "";
          setFinalSummary(summary);
          setShowSummaryDrawer(true);
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "request_permit": {
          // v0.2.0 — domain-specific (construction/heavy_industry/semiconductor)
          const VALID_PERMIT_TYPES: PermitType[] = [
            "HOT_WORK", "CONFINED_SPACE", "WORKING_AT_HEIGHT", "LOTO",
            "EXCAVATION", "LIFTING", "CHEMICAL_LINE_BREAK", "LASER",
            "RADIATION", "ELECTRICAL", "OTHER",
          ];
          const rawType = (args.permit_type as string) || "OTHER";
          const permitType: PermitType = (VALID_PERMIT_TYPES as string[]).includes(rawType)
            ? (rawType as PermitType)
            : "OTHER";
          const scope = (args.scope as string) || "";
          const validityHours = Number(args.validity_hours) || 8;
          const prereq = (args.checklist_items_before_issue as string[]) || [];
          const permit: PermitRecord = {
            permit_id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            permit_type: permitType,
            scope,
            validity_hours: validityHours,
            checklist_items_before_issue: prereq,
            status: "pending",
            requested_at: new Date().toISOString(),
          };
          setPermits((prev) => [...prev, permit]);
          showInterruptionMessage(`허가서 요청: ${permitType} (${scope})`);
          sessionRef.current?.sendToolResult(callId, {
            result: "success",
            permit_id: permit.permit_id,
          });
          return;
        }

        case "log_measurement": {
          // v0.2.0 — domain-specific (heavy_industry/semiconductor)
          const metric = (args.metric as string) || "unknown";
          const value = Number(args.value);
          const unit = (args.unit as string) || "";
          const location = (args.location as string) || undefined;
          const exceeds = Boolean(args.exceeds_threshold);
          const measurement = {
            metric,
            value,
            unit,
            location,
            taken_at: (args.taken_at as string) || new Date().toISOString(),
            exceeds_threshold: exceeds,
            instrument_id: (args.instrument_id as string) || undefined,
          };
          setStructured((prev) => {
            const prior = prev.hazard_measurements ?? [];
            return { ...prev, hazard_measurements: [...prior, measurement] };
          });
          if (exceeds) {
            showInterruptionMessage(
              `임계 초과: ${metric} ${value}${unit}${location ? ` @ ${location}` : ""}. 작업 중단을 검토하세요.`
            );
          }
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        default:
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
      }
    } else {
      // EHS mode - no function calls supported except retrieve_documents, just return success
      sessionRef.current?.sendToolResult(callId, { result: "success" });
      return;
    }
  }

  function onEvent(event: unknown) {
    const e = event as Event;

    // Log all function calling events
    if (!e.type.endsWith("delta")) {
      console.log(e);
    }

    switch (e.type) {
      case "output_audio_buffer.started":
        setTalking("assistant");
        return;
      case "output_audio_buffer.stopped":
        setTalking("idle");
        return;
      case "input_audio_buffer.speech_started":
        setTalking("user");
        return;
      case "input_audio_buffer.speech_stopped":
        setTalking("idle");
        return;
      case "conversation.item.input_audio_transcription.completed": {
        const userTranscript = e.transcript as string;
        setMessages((prev) => [
          ...prev,
          {
            role: "user",
            text: userTranscript,
          },
        ]);
        
        // In EHS mode, call retrieve endpoint for voice messages
        // if (currentMode === "EHS" && userTranscript.trim()) {
        //   console.log("🎤 EHS Mode: Retrieving documents for voice query:", userTranscript);
        //   retrieveDocuments(userTranscript).then((retrieveResult) => {
        //     if (retrieveResult) {
        //       console.log("📄 Retrieved documents for voice query:", retrieveResult);
        //       console.log(`Found ${retrieveResult.total_found} documents for voice query: "${retrieveResult.query}"`);
        //       if (retrieveResult.documents.length > 0) {
        //         console.log("📋 Top documents:");
        //         retrieveResult.documents.forEach((doc, index) => {
        //           console.log(`${index + 1}. ${doc.title} (Score: ${doc.score.toFixed(2)})`);
        //           console.log(`   ID: ${doc.id}`);
        //           console.log(`   URL: ${doc.url}`);
        //           console.log(`   Content: ${doc.content?.substring(0, 100)}...`);
        //           console.log(`   Keywords: ${doc.keywords.join(', ')}`);
        //           console.log("---");
        //         });
        //       } else {
        //         console.log("❌ No documents found for the voice query");
        //       }
        //     } else {
        //       console.log("❌ Failed to retrieve documents for voice query");
        //     }
        //   });
        // }
        return;
      }
      case "response.audio_transcript.done":
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: e.transcript as string,
          },
        ]);
        return;

      case "response.text.done":
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: e.text as string,
          },
        ]);
        return;

      case "response.function_call_arguments.done":
        onFunctionCall(e);
        return;
    }
  }

  // Start a new session
  const startSession = async (
    initialMessage: string | null,
    initialMessageRole: 'user' | 'assistant' | 'system' | null
  ) => {
    if (sessionActive || connecting) return;

    setConnecting(true);
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const session = new WebRTCSession({
      onSessionEnd: () => {
        setSessionActive(false);
        setTalking("idle");
      },
      onEvent: onEvent,
      mode: currentMode === "TBM" ? "tbm" : "ehs",
      language: currentLanguage,
      domain: currentDomain,
    });

    sessionRef.current = session;
    if (initialMessage && initialMessageRole) {
      await session.start(audioRef.current!, micStream, initialMessage, initialMessageRole);
    } else {
      await session.start(audioRef.current!, micStream);
    }

    setSessionActive(true);
    setMessages([]);
    setChecklist(DEFAULT_CHECKLIST); // Reset checklist on new session
    setPriorInfo({}); // Reset prior information on new session
    setShowInterruption(false); // Reset interruption flag on new session
    setInterruptionMessage(""); // Clear interruption message
    setCueMessage("");
    setCitations([]);

    setTimeout(() => {
      setConnecting(false);
    }, 2000);
  };

  // Stop session and cleanup
  const stopSession = () => {
    sessionRef.current?.stop();
    setSessionActive(false);
    setConnecting(false);
    setTalking("idle");
    setCueMessage(getInitialCueMessage());
    setShowInterruption(false);
    setInterruptionMessage("");
    if (interruptionTimeoutRef.current) {
      clearTimeout(interruptionTimeoutRef.current);
    }
    setPriorInfo({});
    setChecklist(DEFAULT_CHECKLIST);
    setMessages([]);
    setInput("");
    setCitations([]);
  };

  // Toggle checklist item completion manually
  const toggleChecklistItem = (index: number) => {
    setChecklist((prev) => {
      const updatedChecklist = prev.map((item) =>
        item.index === index
          ? {
              ...item,
              completed: !item.completed,
              utterance: item.completed ? "" : "수동으로 체크됨",
              checkedAt: !item.completed ? new Date().toISOString() : undefined,
            }
          : item
      );
      
      // Notify AI about manual toggle and current checklist status
      const toggledItem = updatedChecklist.find(item => item.index === index);
      if (toggledItem && sessionRef.current) {
        const action = toggledItem.completed ? "checked" : "unchecked";
        
        // Get current status of all items
        const completedItems = updatedChecklist.filter(item => item.completed);
        const incompleteItems = updatedChecklist.filter(item => !item.completed);
        
        let message = `User manually ${action} checklist item: "${toggledItem.content}"\n\n`;
        message += `Current checklist status:\n`;
        message += `Completed items (${completedItems.length}/${updatedChecklist.length}):\n`;
        completedItems.forEach(item => {
          message += `✅ ${item.index}. ${item.content}\n`;
        });
        
        if (incompleteItems.length > 0) {
          message += `\nIncomplete items (${incompleteItems.length}/${updatedChecklist.length}):\n`;
          incompleteItems.forEach(item => {
            message += `⬜ ${item.index}. ${item.content}\n`;
          });
        }
        
        console.log('system message', message);
        sessionRef.current.sendTextMessage(message, "user", true); // Audio response for system updates
      }
      
      return updatedChecklist;
    });
  };

  // Send a text message to the AI
  const sendTextMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage = input.trim();
    
    // Start session if not active
    if (!sessionActive) {
      await startSession(userMessage, "user");
      setInput("");
      return;
    }
    
    // Interrupt any ongoing audio response before sending text
    if (talking === "assistant" && sessionRef.current) {
      sessionRef.current.interruptResponse();
    }
    
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setTalking("user"); // User is talking
    
    // In EHS mode, call retrieve endpoint and log results
    if (currentMode === "EHS") {
      console.log("🔍 EHS Mode: Retrieving documents for query:", userMessage);
      const retrieveResult = await retrieveDocuments(userMessage);
      
      if (retrieveResult) {
        console.log("📄 Retrieved documents:", retrieveResult);
        console.log(`Found ${retrieveResult.total_found} documents for query: "${retrieveResult.query}"`);
        
        if (retrieveResult.documents.length > 0) {
          console.log("📋 Top documents:");
          retrieveResult.documents.forEach((doc, index) => {
            console.log(`${index + 1}. ${doc.title} (Score: ${doc.score.toFixed(2)})`);
            console.log(`   ID: ${doc.id}`);
            console.log(`   URL: ${doc.url}`);
            console.log(`   Content: ${doc.content?.substring(0, 100)}...`);
            console.log(`   Keywords: ${doc.keywords.join(', ')}`);
            console.log("---");
          });
        } else {
          console.log("❌ No documents found for the query");
        }
      } else {
        console.log("❌ Failed to retrieve documents");
      }
    }
    
    sessionRef.current?.sendTextMessage(userMessage, "user", false); // Text-only response
    setInput("");
  };

  // Function to switch between modes
  const switchMode = (newMode: AppMode) => {
    if (newMode === currentMode) return;
    
    // Stop current session if active
    if (sessionActive) {
      stopSession();
    }
    
    // Reset relevant state when switching modes
    setMessages([]);
    setShowChatLog(false);
    setShowInterruption(false);
    setInterruptionMessage("");
    setShowLanguageSelector(false); // Close language selector
    setCitations([]); // Clear citations
    
    // Clear recommended questions state
    setShowRecommendedQuestions(false);
    setDisplayedQuestions([]);
    setRemainingQuestions([]);
    setAnimatingOut(false);
    
    setChecklist(DEFAULT_CHECKLIST);
    setPriorInfo({});
    setCueMessage(getInitialCueMessage());
    setCurrentMode(newMode);
  };

  return (
    <div
      className="w-full h-full flex flex-col bg-pwc-bg-soft text-pwc-ink p-0 overflow-hidden relative"
      style={{
        height: "100dvh",
        width: "100vw",
        position: "fixed",
        top: 0,
        left: 0,
      }}
    >
      <audio ref={audioRef} autoPlay hidden />

      {/* Phase B: 8-field progress bar (TBM only) */}
      {currentMode === "TBM" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-pwc-border z-30 pointer-events-none">
          <div
            className="h-full bg-pwc-orange transition-all duration-300"
            style={{ width: `${structuredProgressPercent}%` }}
          />
        </div>
      )}

      {/* Phase B: Summary peek drawer toggle (TBM only) */}
      {currentMode === "TBM" && (
        <button
          onClick={() => setShowSummaryDrawer(true)}
          className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-white text-pwc-ink px-3 py-1.5 rounded-pwc text-[11px] font-bold uppercase tracking-wider border border-pwc-border-strong hover:border-pwc-orange hover:text-pwc-orange transition"
          aria-label="정리본 보기"
        >
          <IconDoc size={14} />
          <span>정리본</span>
          <span className="text-pwc-orange">{structuredProgressPercent}%</span>
        </button>
      )}

      {/* Phase B: Summary peek drawer (LIGHT sheet over DARK voice shell) */}
      {showSummaryDrawer && currentMode === "TBM" && (
        <div
          className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm flex justify-end"
          onClick={() => setShowSummaryDrawer(false)}
        >
          <div
            className="w-full max-w-md h-full bg-pwc-bg text-pwc-ink border-l border-pwc-border overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-pwc-bg border-b border-pwc-border px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                  지금까지 정리본
                </div>
                <div className="font-serif-display text-[22px] leading-tight mt-0.5">
                  {structuredProgressPercent}% 완성
                </div>
              </div>
              <button
                onClick={() => setShowSummaryDrawer(false)}
                className="w-9 h-9 flex items-center justify-center text-pwc-ink-soft hover:text-pwc-orange"
                aria-label="close"
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className="p-5">
              {finalSummary && (
                <section className="mb-5 border-l-4 border-pwc-orange bg-pwc-orange-wash p-4">
                  <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-2">
                    최종 요약 · AI 생성
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed text-pwc-ink">
                    {finalSummary}
                  </div>
                </section>
              )}

              <div className="flex flex-col">
                <SummaryRow label="오늘 작업 내용" value={structured.work_summary} />
                <SummaryRow label="평소와 달라진 점" value={structured.changes_today} />
                <SummaryRow label="주요 위험요인" value={structured.hazards} />
                <SummaryRow label="위험 시나리오" value={structured.risk_scenarios} />
                <SummaryRow label="대응/예방 조치" value={structured.mitigations} />
                <SummaryRow label="보호구/장비 확인" value={structured.ppe} />
                <SummaryRow label="특이사항" value={structured.special_notes} />
                <SummaryRow
                  label="참석 확인"
                  value={structured.attendance_confirmed ? "확인됨" : undefined}
                />
              </div>

              {hazardSuggestions.length > 0 && (
                <section className="mt-6 border-l-4 border-pwc-orange bg-pwc-orange-wash p-4">
                  <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold mb-2">
                    AI 추가 확인 제안
                  </div>
                  <ul className="flex flex-col gap-3">
                    {hazardSuggestions.map((s, i) => (
                      <li key={i} className="text-sm">
                        <div className="font-semibold text-pwc-ink">• {s.hazard}</div>
                        <div className="text-pwc-ink-soft text-xs mt-0.5">{s.rationale}</div>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setHazardSuggestions([])}
                    className="mt-3 w-full text-xs py-2 rounded-pwc bg-white text-pwc-ink-soft border border-pwc-border hover:text-pwc-orange hover:border-pwc-orange transition"
                  >
                    제안 닫기
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Centered Circle.gif - Clickable */}
      <div className="absolute inset-0 flex items-center justify-center z-0">
        <button
          onClick={sessionActive ? undefined : isInputFocused ? undefined : () => startSession(null, null)}
          disabled={connecting || isInputFocused}
          className={`p-0 border-none bg-transparent cursor-pointer focus:outline-none rounded-full transition-transform duration-150 active:scale-110 disabled:cursor-not-allowed disabled:active:scale-100 ${
            talking === "user" || talking === "assistant"
              ? "animate-pulse-boom"
              : ""
          }`}
          aria-label={
            connecting
              ? "Connecting..."
              : isInputFocused
              ? "Microphone disabled while typing"
              : sessionActive
              ? "Stop session"
              : "Start session"
          }
        >
          <img
            src="/circle.gif"
            alt="Animated Circle - Click to start/stop"
            className="w-96 h-96 object-contain transition-all duration-300"
            style={{
              filter:
                talking === "user"
                  ? // Vivid PwC orange (user voice)
                    "sepia(1) saturate(5) hue-rotate(-25deg) brightness(1) contrast(1.08) drop-shadow(0 10px 28px rgba(224,48,30,0.22))"
                  : talking === "assistant"
                  ? // Deeper burgundy-red (assistant voice)
                    "sepia(1) saturate(7) hue-rotate(-40deg) brightness(0.9) contrast(1.15) drop-shadow(0 10px 28px rgba(173,31,20,0.25))"
                  : // Muted PwC warm (idle) — sits on cream bg without glare
                    "sepia(0.7) saturate(2.5) hue-rotate(-20deg) brightness(0.95) contrast(1.05) drop-shadow(0 8px 20px rgba(224,48,30,0.10))",
            }}
          />
        </button>
      </div>

      {/* Interruption Message Overlay - High priority, centered on screen */}
      {showInterruption && interruptionMessage && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="px-6 py-4 text-center text-2xl font-bold bg-pwc-orange text-white border-l-4 border-pwc-orange-deep shadow-lg animate-pulse rounded-pwc-lg max-w-md mx-4">
            {interruptionMessage}
          </div>
        </div>
      )}

      {/* Cue Message Overlay - Midpoint between top bar and circle north border */}
      {cueMessage && (currentMode === "EHS" || (checklist.length === 0 || !allItemsCompleted)) && (
        <div
          className="absolute left-0 right-0 bg-transparent text-pwc-ink px-4 py-3 text-center font-serif-display text-[26px] leading-tight animate-fade-in"
          style={{
            top: "calc(25vh - 72px)",
            minHeight: "0",
          }}
        >
          {cueMessage}
        </div>
      )}

      {/* Complete Button - Shows when all checklist items are completed in TBM mode */}
      {currentMode === "TBM" && allItemsCompleted && (
        <div
          className="absolute left-0 right-0 px-4 py-3 text-center animate-fade-in"
          style={{
            top: "calc(25vh - 72px)",
            minHeight: "0",
          }}
        >
          <button
            onClick={() => setShowChecklistPanel(true)}
            className="bg-pwc-orange hover:bg-pwc-orange-deep text-white font-bold py-4 px-8 rounded-pwc text-lg shadow-pwc-card transition-all duration-200 transform active:scale-[0.99] border-l-4 border-pwc-orange-deep"
          >
            <div className="flex items-center gap-3">
              <IconShield size={22} />
              <span>체크리스트 완료</span>
            </div>
          </button>
        </div>
      )}

      {/* Main Top Bar */}
      <div
        className="w-full flex items-center bg-pwc-bg h-12 justify-between relative z-20 border-b border-pwc-border px-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Compact Voice Button in Upper Left */}
        <div className="mr-6">
          <button
            className={`compact-voice-btn ${sessionActive ? "active" : ""} ${
              connecting ? "connecting" : ""
            } ${
              talking === "user"
                ? "talking-user"
                : talking === "assistant"
                ? "talking-assistant"
                : ""
            }`}
            onClick={sessionActive ? stopSession : () => startSession(null, null)}
            disabled={connecting}
          >
            <span className="compact-voice-btn-text">
              {connecting ? (
                <span className="compact-spinner">
                  <svg viewBox="0 0 50 50" style={{ width: 16, height: 16 }}>
                    <circle
                      cx="25"
                      cy="25"
                      r="20"
                      fill="none"
                      stroke="#E0301E"
                      strokeWidth="5"
                      strokeDasharray="31.4 31.4"
                      strokeLinecap="round"
                    >
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 25 25"
                        to="360 25 25"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  </svg>
                </span>
              ) : (
                <svg className="compact-mic-icon" viewBox="0 0 24 24">
                  <path d="M12 16a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4zm5-4a1 1 0 1 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 1 1-2 0v-2.08A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0z" />
                </svg>
              )}
              <span className="ml-1 text-xs">
                {connecting ? "..." : sessionActive ? "중지" : "시작"}
              </span>
            </span>
          </button>
        </div>
        {/* Mode Toggle Button */}
        <div className="mr-6">
          <div className="flex bg-pwc-bg-card rounded-full p-1 border border-pwc-border">
            <button
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                currentMode === "TBM"
                  ? "bg-pwc-orange text-white shadow-pwc-card"
                  : "text-pwc-ink-soft hover:text-pwc-orange"
              }`}
              onClick={() => switchMode("TBM")}
              disabled={connecting}
            >
              TBM
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                currentMode === "EHS"
                  ? "bg-pwc-orange text-white shadow-pwc-card"
                  : "text-pwc-ink-soft hover:text-pwc-orange"
              }`}
              onClick={() => switchMode("EHS")}
              disabled={connecting}
            >
              EHS
            </button>
          </div>
        </div>
        {/* Language Selector */}
        <div className="mr-6 relative" onClick={(e) => e.stopPropagation()}>
          <button
            className="flex items-center gap-2 px-3 py-1 bg-pwc-bg-card rounded-full border border-pwc-border text-pwc-ink-soft hover:text-pwc-orange transition-colors text-xs"
            onClick={() => setShowLanguageSelector(!showLanguageSelector)}
            disabled={connecting}
          >
            <span>{LANGUAGE_CONFIG[currentLanguage].flag}</span>
            <span>{LANGUAGE_CONFIG[currentLanguage].name}</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {/* Language Dropdown */}
          {showLanguageSelector && (
            <div className="absolute top-full mt-1 right-0 bg-white border border-pwc-border rounded-lg shadow-lg z-[100] min-w-[140px]">
              {Object.entries(LANGUAGE_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-pwc-orange-wash transition-colors flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg ${
                    currentLanguage === key ? "bg-pwc-orange/20 text-pwc-ink" : "text-pwc-ink-soft"
                  }`}
                  onClick={() => {
                    // Stop current session if active when changing language
                    if (sessionActive) {
                      stopSession();
                    }
                    setCurrentLanguage(key as Language);
                    setShowLanguageSelector(false);
                  }}
                  disabled={connecting}
                >
                  <span>{config.flag}</span>
                  <span>{config.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Spacer */}
        <div className="flex-1"></div>
      </div>

      {/* TBM Progress Bar - Only visible in TBM mode */}
      {currentMode === "TBM" && (
        <div className="w-full flex items-center bg-pwc-bg h-10 justify-between relative z-10 border-b border-pwc-border px-4">
          <div className="flex-1 flex items-center">
            <div className="w-full h-1.5 bg-pwc-border overflow-hidden">
              <div
                className="h-full bg-pwc-orange transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <span className="ml-4 font-bold text-pwc-orange text-[11px] min-w-[40px] text-right tracking-wider">
            {completedCount}/{checklist.length}
          </span>
          <button
            className={`ml-4 p-2 rounded-pwc transition-colors focus:outline-none ${
              showChecklistPanel
                ? "text-pwc-orange bg-pwc-orange-wash border border-pwc-orange"
                : "text-pwc-ink-mute hover:text-pwc-orange hover:bg-pwc-orange-wash"
            }`}
            onClick={() => setShowChecklistPanel((v) => !v)}
            aria-label="Toggle checklist"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
        </div>
      )}

      {/* Chat Log Panel */}
      {showChatLog && (
        <div
          className="absolute left-0 right-0 bg-pwc-bg border-y border-pwc-border z-10 overflow-hidden dynamic-panel-height shadow-pwc-card"
        >
          <div className="h-full flex flex-col">
            {/* Chat Header */}
            <div className="px-5 py-3 border-b border-pwc-border bg-pwc-bg flex items-center justify-between">
              <div className="flex items-center gap-2 text-pwc-orange">
                <IconChat size={18} />
                <span className="font-bold text-pwc-ink text-[15px]">대화 로그</span>
              </div>
              <button
                className="text-pwc-ink-soft hover:text-pwc-orange transition-colors p-2"
                onClick={() => setShowChatLog(false)}
                aria-label="Close chat log"
              >
                <IconClose size={18} />
              </button>
            </div>
            
            {/* Scrollable Messages Container */}
            <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ scrollBehavior: 'smooth' }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-pwc-ink-mute">
                  <div className="text-center">
                    <IconChat size={40} gradient className="mx-auto mb-3" />
                    <p className="text-sm">
                      {currentMode === "EHS"
                        ? "음성 채팅을 시작하면 대화가 여기에 표시됩니다"
                        : "대화를 시작하면 여기에 표시됩니다"}
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.role === "assistant" ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`px-4 py-3 rounded-pwc-lg text-sm max-w-[85%] break-words transition-all duration-200 ${
                        msg.role === "assistant"
                          ? "bg-pwc-bg-card text-pwc-ink border border-pwc-border"
                          : "bg-pwc-orange text-white"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checklist Panel - Full Screen (TBM Mode Only) */}
      {currentMode === "TBM" && showChecklistPanel && (
        <div
          className="absolute left-0 right-0 bg-pwc-bg border-y border-pwc-border z-30 overflow-hidden dynamic-panel-height shadow-pwc-card"
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-pwc-border bg-pwc-bg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IconShield size={20} gradient />
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                    TBM
                  </div>
                  <div className="font-serif-display text-[18px] leading-tight">작업 현황</div>
                </div>
              </div>
              <button
                className="text-pwc-ink-soft hover:text-pwc-orange transition-colors p-2"
                onClick={() => setShowChecklistPanel(false)}
                aria-label="Close checklist panel"
              >
                <IconClose size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto"  style={{ scrollBehavior: 'smooth' }}>
            {/* Prior Information Section */}
            <div className="px-6 py-4 border-b border-pwc-border">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-pwc-orange" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="font-semibold text-pwc-orange text-lg">사전 정보</h3>
              </div>
                             <div className="grid grid-cols-1 gap-3">
                 <div className={`p-3 rounded-xl border transition-colors ${priorInfo.workLocation ? 'bg-pwc-orange/10 border-pwc-orange/30' : 'bg-pwc-bg-card border-pwc-border'}`}>
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-pwc-ink-soft">작업장소</span>
                     <span className={`w-2 h-2 rounded-full ${priorInfo.workLocation ? 'bg-pwc-orange' : 'bg-pwc-border-strong'}`}></span>
                   </div>
                   <div className={`mt-1 text-sm ${priorInfo.workLocation ? 'text-pwc-ink' : 'text-pwc-ink-mute'}`}>
                     {priorInfo.workLocation || '미입력'}
                   </div>
                 </div>
                 <div className={`p-3 rounded-xl border transition-colors ${priorInfo.workContentDetails ? 'bg-pwc-orange/10 border-pwc-orange/30' : 'bg-pwc-bg-card border-pwc-border'}`}>
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-pwc-ink-soft">작업내용</span>
                     <span className={`w-2 h-2 rounded-full ${priorInfo.workContentDetails ? 'bg-pwc-orange' : 'bg-pwc-border-strong'}`}></span>
                   </div>
                   <div className={`mt-1 text-sm ${priorInfo.workContentDetails ? 'text-pwc-ink' : 'text-pwc-ink-mute'}`}>
                     {priorInfo.workContentDetails || '미입력'}
                   </div>
                 </div>
                 <div className={`p-3 rounded-xl border transition-colors ${priorInfo.numberOfWorkers ? 'bg-pwc-orange/10 border-pwc-orange/30' : 'bg-pwc-bg-card border-pwc-border'}`}>
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-pwc-ink-soft">작업자수</span>
                     <span className={`w-2 h-2 rounded-full ${priorInfo.numberOfWorkers ? 'bg-pwc-orange' : 'bg-pwc-border-strong'}`}></span>
                   </div>
                   <div className={`mt-1 text-sm ${priorInfo.numberOfWorkers ? 'text-pwc-ink' : 'text-pwc-ink-mute'}`}>
                     {priorInfo.numberOfWorkers ? `${priorInfo.numberOfWorkers}명` : '미입력'}
                   </div>
                 </div>
                 <div className={`p-3 rounded-xl border transition-colors ${priorInfo.equipmentDetails ? 'bg-pwc-orange/10 border-pwc-orange/30' : 'bg-pwc-bg-card border-pwc-border'}`}>
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-pwc-ink-soft">장비정보</span>
                     <span className={`w-2 h-2 rounded-full ${priorInfo.equipmentDetails ? 'bg-pwc-orange' : 'bg-pwc-border-strong'}`}></span>
                   </div>
                   <div className={`mt-1 text-sm ${priorInfo.equipmentDetails ? 'text-pwc-ink' : 'text-pwc-ink-mute'}`}>
                     {priorInfo.equipmentDetails || '미입력'}
                   </div>
                 </div>
               </div>
            </div>

            {/* Safety Checklist Section */}
            <div className="px-6 py-4">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-pwc-orange" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h3 className="font-semibold text-pwc-orange text-lg">안전 체크리스트</h3>
                <div className="ml-auto bg-pwc-orange/20 px-3 py-1 rounded-full border border-pwc-orange/30">
                  <span className="text-xs font-semibold text-pwc-ink">{completedCount}/{checklist.length} 완료</span>
                </div>
              </div>
              <ul className="space-y-3">
                {checklist.map((item) => (
                  <li 
                    key={item.index} 
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                      item.completed 
                        ? 'bg-pwc-orange/10 border-pwc-orange/30 shadow-lg shadow-pwc-orange/5 hover:bg-pwc-orange/15' 
                        : 'bg-pwc-bg-card border-pwc-border hover:border-pwc-orange/50 hover:bg-pwc-orange-wash'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleChecklistItem(item.index);
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 w-7 h-7 flex items-center justify-center rounded-full border-2 transition-all ${
                        item.completed
                          ? "bg-pwc-orange border-pwc-orange text-white"
                          : "bg-transparent border-pwc-border text-pwc-ink-mute hover:border-pwc-orange/50 hover:bg-pwc-orange/10"
                      }`}>
                        {item.completed ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-xs font-bold">{item.index}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium block ${
                          item.completed ? "text-pwc-ink" : "text-pwc-ink-soft"
                        }`}>
                          {item.content}
                        </span>
                        {item.completed && item.utterance && (
                          <div className="mt-2 p-2 bg-pwc-bg-card rounded border-l-2 border-pwc-orange">
                            <div className="text-[10px] uppercase tracking-wider text-pwc-orange font-bold mb-1">
                              응답
                            </div>
                            <div className="text-sm text-pwc-ink">"{item.utterance}"</div>
                          </div>
                        )}
                        {item.completed && item.checkedAt && (
                          <div className="text-xs text-pwc-ink-mute mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {new Date(item.checkedAt).toLocaleString('ko-KR', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Recommended Questions Panel - Shows when in EHS mode */}
      {currentMode === "EHS" && showRecommendedQuestions && displayedQuestions.length > 0 && (
        <div className="absolute left-4 right-4 bottom-20 z-30">
          <div className="max-w-2xl mx-auto">
            <div className="space-y-2">
              {displayedQuestions.map((question, index) => (
                <button
                  key={`${question}-${index}`}
                  className={`w-full text-left p-3 rounded-pwc bg-pwc-bg border border-pwc-border hover:border-pwc-orange hover:bg-pwc-orange-wash transition-all duration-300 shadow-pwc-card ${
                    index === 0 && animatingOut
                      ? 'opacity-40 transform scale-95'
                      : ''
                  }`}
                  onClick={() => handleRecommendedQuestionClick(question)}
                  disabled={index === 0 && animatingOut}
                >
                  <span className="text-pwc-ink text-sm leading-relaxed">{question}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Citations Panel - Shows when citations are available */}
      {citations.length > 0 && (
        <div className="absolute left-4 right-4 bottom-20 max-h-40 overflow-y-auto bg-pwc-bg border border-pwc-border rounded-pwc-lg shadow-pwc-card z-10">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <IconDoc size={16} />
              <span className="text-[11px] uppercase tracking-wider text-pwc-orange font-bold">
                관련 문서
              </span>
              <button
                className="ml-auto text-pwc-ink-soft hover:text-pwc-orange transition-colors p-1"
                onClick={() => setCitations([])}
                aria-label="Clear citations"
              >
                <IconClose size={14} />
              </button>
            </div>

            {citations[citations.length - 1].context && (
              <p className="text-pwc-ink-soft text-xs mb-3">{citations[citations.length - 1].context}</p>
            )}

            <div className="space-y-2">
              {citations[citations.length - 1].citations.map((citation, index) => (
                <div key={index} className="p-3 bg-pwc-bg-card border-l-2 border-pwc-orange">
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pwc-ink hover:text-pwc-orange font-semibold text-sm transition-colors duration-200 block mb-1"
                  >
                    {citation.title}
                  </a>
                  <p className="text-pwc-ink-soft text-xs leading-relaxed">{citation.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
              )}

      {/* Input Area */}
      <div
        className="w-full flex items-center gap-2 px-3 py-3 bg-pwc-bg border-t border-pwc-border fixed bottom-0 left-0 z-20"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <button
          className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-pwc transition-colors focus:outline-none ${
            showChatLog
              ? "text-pwc-orange bg-pwc-orange-wash border border-pwc-orange"
              : "text-pwc-ink-mute hover:text-pwc-orange hover:bg-pwc-orange-wash"
          }`}
          onClick={() => setShowChatLog((v) => !v)}
          aria-label="Toggle chat log"
        >
          <IconChat size={18} />
        </button>
        <input
          className="flex-1 min-w-0 px-4 py-2.5 rounded-pwc bg-white text-pwc-ink text-sm focus:outline-none focus:ring-2 focus:ring-pwc-orange border border-pwc-border placeholder-pwc-ink-mute"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendTextMessage();
              if (talking === "assistant" && sessionRef.current) {
                sessionRef.current.interruptResponse();
              }
            }
          }}
          placeholder="메시지 입력..."
        />
        <button
          className="px-5 py-2.5 rounded-pwc bg-pwc-orange hover:bg-pwc-orange-deep text-white font-bold text-sm transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={sendTextMessage}
          disabled={!input.trim()}
        >
          전송
        </button>
      </div>
    </div>
  );
}

export default App;
