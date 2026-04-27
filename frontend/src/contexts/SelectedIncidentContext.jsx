/**
 * Selected-incident context.
 * Lets the OctonVoiceWidget (rendered globally) know which incident the
 * user is staring at, and lets pages register a voice-action handler so
 * "Hey OCTON, confirm" can dispatch to the correct page.
 *
 * Also re-exports the module-level `frameCaptureRef` used by VideoStage to
 * expose its current annotated PNG dataURL for the PDF export pipeline.
 */
import { createContext, useContext, useRef, useState } from "react";

export const frameCaptureRef = { current: null };

const SelectedIncidentContext = createContext({
  id: null,
  setId: () => {},
  voiceActionHandler: { current: null },
});

export const SelectedIncidentProvider = ({ children }) => {
  const [id, setId] = useState(null);
  const voiceActionHandler = useRef(null);
  return (
    <SelectedIncidentContext.Provider value={{ id, setId, voiceActionHandler }}>
      {children}
    </SelectedIncidentContext.Provider>
  );
};

export const useSelectedIncidentId = () => useContext(SelectedIncidentContext);
