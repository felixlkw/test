// useWebRTCEvents — App.tsx L452-810 이전.
// 핸들러 맵 + onEvent dispatcher. 동작 변경 0.
import { useCallback } from "react";
import type { Dispatch, SetStateAction, MutableRefObject } from "react";
import type { WebRTCSession } from "../../services/webrtc";
import type { ChecklistItem } from "../../services/checklist";
import type {
  StructuredChecklist,
  PermitRecord,
  PermitType,
} from "../../services/sessionModel";
import type {
  Citation,
  CitationDisplay,
  PriorInformation,
  WebRTCEvent,
  AppMode,
  ChatMessage,
} from "./types";
import {
  retrieveDocumentsByKeywords,
  retrieveDocuments,
} from "../../services/retrieve";
import { recordSpeechStopped, recordFirstToken } from "../../services/sttMetrics";

export interface UseWebRTCEventsArgs {
  sessionRef: MutableRefObject<WebRTCSession | null>;
  currentMode: AppMode;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setTalking: Dispatch<SetStateAction<"idle" | "user" | "assistant">>;
  setChecklist: Dispatch<SetStateAction<ChecklistItem[]>>;
  setPriorInfo: Dispatch<SetStateAction<PriorInformation>>;
  setCueMessage: Dispatch<SetStateAction<string>>;
  setStructured: Dispatch<SetStateAction<StructuredChecklist>>;
  setHazardSuggestions: Dispatch<
    SetStateAction<{ hazard: string; rationale: string }[]>
  >;
  setFinalSummary: Dispatch<SetStateAction<string>>;
  setShowSummaryDrawer: Dispatch<SetStateAction<boolean>>;
  setPermits: Dispatch<SetStateAction<PermitRecord[]>>;
  setCitations: Dispatch<SetStateAction<CitationDisplay[]>>;
  showInterruptionMessage: (message: string) => void;
  // Phase 2.x PR-4 — LLM이 종료 게이트를 인지했음을 알리는 신호. VoiceShell에서
  // setBroadcastPulsing(true)로 펄스 트리거. 옵셔널 — 미전달 시 no-op.
  // 사용자 통제권 보존 (felix Q5=A) — 자동 모달은 호출하지 않음.
  onBroadcastReady?: (summary?: string) => void;
}

const VALID_PERMIT_TYPES: PermitType[] = [
  "HOT_WORK",
  "CONFINED_SPACE",
  "WORKING_AT_HEIGHT",
  "LOTO",
  "EXCAVATION",
  "LIFTING",
  "CHEMICAL_LINE_BREAK",
  "LASER",
  "RADIATION",
  "ELECTRICAL",
  "OTHER",
];

export function useWebRTCEvents(args: UseWebRTCEventsArgs) {
  const {
    sessionRef,
    currentMode,
    setMessages,
    setTalking,
    setChecklist,
    setPriorInfo,
    setCueMessage,
    setStructured,
    setHazardSuggestions,
    setFinalSummary,
    setShowSummaryDrawer,
    setPermits,
    setCitations,
    showInterruptionMessage,
    onBroadcastReady,
  } = args;

  const onFunctionCall = useCallback(
    (event: unknown) => {
      const e = event as { name?: string; arguments?: string; call_id?: string };
      const functionName = e.name;
      const args = (JSON.parse(e.arguments as string) ?? {}) as Record<string, unknown>;
      const callId = e.call_id ?? "";

      console.log("======== onFunctionCall ========");
      console.log(functionName, args, callId);

      // retrieve_documents — TBM/EHS 공통
      if (functionName === "retrieve_documents") {
        const keywords = args.keywords as string[];
        if (keywords && Array.isArray(keywords) && keywords.length > 0) {
          console.log("🔍 Retrieving documents for keywords:", keywords);
          retrieveDocumentsByKeywords(keywords).then((retrieveResult) => {
            if (retrieveResult) {
              console.log("📄 Retrieved documents for keywords:", retrieveResult);
              console.log(
                `Found ${retrieveResult.total_found} documents for keywords: [${keywords.join(", ")}]`,
              );
              const toolResult = {
                success: true,
                documents_found: retrieveResult.total_found,
                keywords_searched: keywords,
                documents: retrieveResult.documents.map((doc) => ({
                  title: doc.title,
                  id: doc.id,
                  url: doc.url,
                  content: doc.content.substring(0, 500),
                  relevance_score: doc.score,
                  keywords: doc.keywords,
                })),
                instruction:
                  "Use the retrieved documents to provide helpful information. Analyze the documents and if relevant, use the display_document_citations tool to show users where they can find additional detailed information. Create concise summaries explaining why each document is relevant.",
              };
              if (retrieveResult.documents.length > 0) {
                console.log("📋 Top documents:");
                retrieveResult.documents.forEach((doc, index) => {
                  console.log(`${index + 1}. ${doc.title} (Score: ${doc.score.toFixed(2)})`);
                  console.log(`   ID: ${doc.id}`);
                  console.log(`   URL: ${doc.url}`);
                  console.log(`   Content: ${doc.content?.substring(0, 100)}...`);
                  console.log(`   Keywords: ${doc.keywords.join(", ")}`);
                  console.log("---");
                });
              } else {
                console.log("❌ No documents found for the keywords");
              }
              sessionRef.current?.sendToolResult(callId, toolResult);
            } else {
              console.log("❌ Failed to retrieve documents for keywords");
              sessionRef.current?.sendToolResult(callId, {
                success: false,
                error: "Failed to retrieve documents",
                documents_found: 0,
                keywords_searched: keywords,
                documents: [],
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
            documents: [],
          });
        }
        return;
      }

      // display_document_citations — TBM/EHS 공통
      if (functionName === "display_document_citations") {
        const citationData = args.citations as Citation[];
        const context = args.context as string;
        if (citationData && Array.isArray(citationData)) {
          console.log("📚 Displaying document citations:", citationData);
          const newCitation: CitationDisplay = {
            citations: citationData,
            context: context,
            timestamp: Date.now(),
          };
          setCitations((prev) => [...prev, newCitation]);
          sessionRef.current?.sendToolResult(callId, { result: "success" });
        } else {
          console.log("❌ Invalid citation data");
          sessionRef.current?.sendToolResult(callId, {
            result: "error",
            message: "Invalid citation data",
          });
        }
        return;
      }

      // 이하 TBM 모드 한정
      if (currentMode !== "TBM") {
        sessionRef.current?.sendToolResult(callId, { result: "success" });
        return;
      }

      switch (functionName) {
        case "complete_checklist_item":
          setChecklist((prev) =>
            prev.map((item) =>
              item.index === Number(args.index)
                ? {
                    ...item,
                    completed: true,
                    utterance: args.utterance as string,
                    checkedAt: new Date().toISOString(),
                  }
                : item,
            ),
          );
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "collect_prior_information": {
          const update: PriorInformation = {};
          if (args.work_location) update.workLocation = args.work_location as string;
          if (args.work_content_details) update.workContentDetails = args.work_content_details as string;
          if (args.number_of_workers) update.numberOfWorkers = args.number_of_workers as number;
          if (args.equipment_details) update.equipmentDetails = args.equipment_details as string;
          setPriorInfo((prev) => ({ ...prev, ...update }));
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "create_dynamic_checklist":
          // PR A 보강: PrepareScreen이 prefill한 baseline 항목(is_baseline=true)은
          // 절대 잃어버리면 안 됨. LLM이 baseline content를 args에 같이 보낼 수도
          // 있어 dedup(content trim 일치) 후 baseline 우선 유지.
          if (args.items && Array.isArray(args.items)) {
            const llmItems = args.items as string[];
            setChecklist((prev) => {
              const baseline = prev.filter((it) => it.is_baseline);
              const baselineContents = new Set(
                baseline.map((b) => b.content.trim()),
              );
              const dynamicNew = llmItems
                .filter((c) => typeof c === "string" && !baselineContents.has(c.trim()))
                .map((content, i) => ({
                  index: baseline.length + i + 1,
                  content,
                  completed: false,
                }));
              return [...baseline, ...dynamicNew];
            });
          }
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "display_cue":
          setCueMessage((args.cue as string) || "");
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;

        case "interrupt_for_safety": {
          const interruptMessage =
            "잠깐만요! " + ((args.safety_message as string) || "안전을 위해 순서대로 진행해 주세요.");
          showInterruptionMessage(interruptMessage);
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "update_session_field": {
          // Phase 2.x PR-3 — op 파라미터 (set/append/replace) 도입.
          // backward compat: op 미지정 + array field는 기존 mode("append" 기본) 유지.
          //                  op 미지정 + non-array field는 set 동작 그대로.
          // op="append": 배열 dedup 추가.
          // op="replace": 배열은 replace_value={old, new}로 1개 항목 swap;
          //               비-배열은 string_value로 전체 교체.
          // op="set":     기존 set 동작(전체 교체).
          const field = args.field as keyof StructuredChecklist;
          const stringValue = args.string_value as string | undefined;
          const arrayValue = args.array_value as string[] | undefined;
          const booleanValue = args.boolean_value as boolean | undefined;
          const op = args.op as "set" | "append" | "replace" | undefined;
          const replaceValue = args.replace_value as
            | { old?: string; new?: string }
            | undefined;
          const legacyMode =
            ((args.mode as string) || "append") === "replace" ? "replace" : "append";
          setStructured((prev) => {
            const next: StructuredChecklist = { ...prev };
            const arrayFields: Array<keyof StructuredChecklist> = [
              "hazards",
              "risk_scenarios",
              "mitigations",
              "ppe",
            ];
            const isArrayField = arrayFields.includes(field);
            if (isArrayField) {
              const existing = (prev[field] as string[] | undefined) || [];
              if (op === "append" && arrayValue) {
                (next[field] as unknown) = Array.from(
                  new Set([...existing, ...arrayValue]),
                );
              } else if (op === "replace") {
                if (
                  replaceValue &&
                  typeof replaceValue.old === "string" &&
                  typeof replaceValue.new === "string"
                ) {
                  const oldVal = replaceValue.old;
                  const newVal = replaceValue.new;
                  (next[field] as unknown) = existing.map((v) =>
                    v === oldVal ? newVal : v,
                  );
                } else if (arrayValue) {
                  // op=replace + array_value (no replace_value) → set 의미 fallback.
                  (next[field] as unknown) = Array.from(new Set(arrayValue));
                }
              } else if (op === "set" && arrayValue) {
                (next[field] as unknown) = Array.from(new Set(arrayValue));
              } else if (arrayValue) {
                // op 미지정 — legacy mode 사용 (PR F era 회귀 0).
                const merged =
                  legacyMode === "append" ? [...existing, ...arrayValue] : arrayValue;
                (next[field] as unknown) = Array.from(new Set(merged));
              }
            } else if (
              field === "attendance_confirmed" &&
              typeof booleanValue === "boolean"
            ) {
              next.attendance_confirmed = booleanValue;
            } else if (
              (field === "work_summary" ||
                field === "changes_today" ||
                field === "special_notes") &&
              typeof stringValue === "string"
            ) {
              // op = "set" / "replace" / 미지정 모두 동일 — 비배열은 단일 값 교체.
              (next[field] as unknown) = stringValue;
            }
            return next;
          });
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "request_broadcast_attestation": {
          // Phase 2.x PR-4 — LLM이 종료 게이트(체크리스트 100% + structured 4필드 +
          // 사용자 readiness)를 모두 인지했을 때 호출. VoiceShell이 setBroadcastPulsing
          // (true)로 CTA 펄스를 트리거. 자동 모달 X — 사용자 통제권 보존(felix Q5=A).
          const summary =
            typeof args.summary === "string" ? (args.summary as string) : undefined;
          if (onBroadcastReady) onBroadcastReady(summary);
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        case "suggest_hazards": {
          const suggestions =
            (args.suggestions as { hazard: string; rationale: string }[]) || [];
          setHazardSuggestions(suggestions);
          sessionRef.current?.sendToolResult(callId, {
            result: "success",
            count: suggestions.length,
          });
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
              `임계 초과: ${metric} ${value}${unit}${location ? ` @ ${location}` : ""}. 작업 중단을 검토하세요.`,
            );
          }
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
        }

        default:
          sessionRef.current?.sendToolResult(callId, { result: "success" });
          return;
      }
    },
    [
      sessionRef,
      currentMode,
      setMessages,
      setChecklist,
      setPriorInfo,
      setCueMessage,
      setStructured,
      setHazardSuggestions,
      setFinalSummary,
      setShowSummaryDrawer,
      setPermits,
      setCitations,
      showInterruptionMessage,
      onBroadcastReady,
    ],
  );

  const onEvent = useCallback(
    (event: unknown) => {
      const e = event as WebRTCEvent;
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
          // PR B (c6 §3.III) — STT KPI 측정 시작 (speech_stopped → 첫 응답 토큰).
          recordSpeechStopped();
          return;
        case "conversation.item.input_audio_transcription.completed": {
          const userTranscript = e.transcript as string;
          setMessages((prev) => [...prev, { role: "user", text: userTranscript }]);
          return;
        }
        // PR B (c6 §3.III) — first response delta(audio or text). recordFirstToken은
        // pending이 없으면 no-op이라 같은 응답 내 두 번째 delta는 무시된다.
        case "response.audio_transcript.delta":
        case "response.text.delta":
          recordFirstToken();
          return;
        case "response.audio_transcript.done":
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: e.transcript as string },
          ]);
          return;
        case "response.text.done":
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: e.text as string },
          ]);
          return;
        case "response.function_call_arguments.done":
          onFunctionCall(e);
          return;
      }
    },
    [setTalking, setMessages, onFunctionCall],
  );

  // EHS 모드 텍스트 메시지에서 사용. App.tsx L941-965의 retrieve 로깅과 동일.
  const logRetrieveForUserMessage = useCallback(async (userMessage: string) => {
    console.log("🔍 EHS Mode: Retrieving documents for query:", userMessage);
    const retrieveResult = await retrieveDocuments(userMessage);
    if (retrieveResult) {
      console.log("📄 Retrieved documents:", retrieveResult);
      console.log(
        `Found ${retrieveResult.total_found} documents for query: "${retrieveResult.query}"`,
      );
      if (retrieveResult.documents.length > 0) {
        console.log("📋 Top documents:");
        retrieveResult.documents.forEach((doc, index) => {
          console.log(`${index + 1}. ${doc.title} (Score: ${doc.score.toFixed(2)})`);
          console.log(`   ID: ${doc.id}`);
          console.log(`   URL: ${doc.url}`);
          console.log(`   Content: ${doc.content?.substring(0, 100)}...`);
          console.log(`   Keywords: ${doc.keywords.join(", ")}`);
          console.log("---");
        });
      } else {
        console.log("❌ No documents found for the query");
      }
    } else {
      console.log("❌ Failed to retrieve documents");
    }
  }, []);

  return { onEvent, onFunctionCall, logRetrieveForUserMessage };
}
