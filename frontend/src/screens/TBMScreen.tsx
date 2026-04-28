import { useParams } from "react-router-dom";
import App from "../App";

interface TBMScreenProps {
  forceMode?: "TBM" | "EHS";
}

export default function TBMScreen({ forceMode }: TBMScreenProps) {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <App sessionId={sessionId} initialMode={forceMode} />;
}
