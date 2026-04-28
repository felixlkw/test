import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomeScreen from "./screens/HomeScreen";
import TBMScreen from "./screens/TBMScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";

const basename = "/static";

export default function Router() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/tbm/:sessionId" element={<TBMScreen />} />
        <Route path="/ehs" element={<TBMScreen forceMode="EHS" />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
