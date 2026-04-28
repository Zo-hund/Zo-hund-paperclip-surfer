/**
 * usePageAgent
 *
 * Executes Page Agent commands dispatched by the Gemini AI:
 *   - navigate_to  → React Router navigation
 *   - fill_form    → custom DOM event for form components to listen to
 *   - open_modal   → custom DOM event
 *   - submit_form  → custom DOM event
 *
 * Returns a commandLog of recent executions and an execute() function
 * compatible with ToolCallHandler.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";

export interface PageAgentCommand {
  ts: Date;
  command: string;
  result: string;
}

export function usePageAgent() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [commandLog, setCommandLog] = useState<PageAgentCommand[]>([]);

  function log(command: string, result: string) {
    setCommandLog((prev) => [{ ts: new Date(), command, result }, ...prev].slice(0, 10));
  }

  const execute = useCallback(async (
    name: string,
    _callId: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    switch (name) {
      case "navigate_to": {
        const path = String(args.path ?? "/");
        navigate(path);
        pushToast({ title: "Navigating", body: path, tone: "success" });
        log(`navigate_to ${path}`, "ok");
        return { success: true, message: `Navigated to ${path}` };
      }

      case "fill_form": {
        const formType = String(args.formType ?? "");
        const fields = (args.fields ?? {}) as Record<string, string>;
        window.dispatchEvent(new CustomEvent("page-agent:fill", { detail: { formType, fields } }));
        pushToast({ title: "Form filled", body: formType });
        log(`fill_form ${formType}`, JSON.stringify(fields).slice(0, 80));
        return { success: true, message: `Filled ${formType} form` };
      }

      case "open_modal": {
        const modal = String(args.modal ?? "");
        const params = (args.params ?? {}) as Record<string, unknown>;
        window.dispatchEvent(new CustomEvent("page-agent:modal", { detail: { modal, params } }));
        pushToast({ title: "Opening", body: modal });
        log(`open_modal ${modal}`, "dispatched");
        return { success: true, message: `Opened modal ${modal}` };
      }

      case "submit_form": {
        const formType = String(args.formType ?? "");
        window.dispatchEvent(new CustomEvent("page-agent:submit", { detail: { formType } }));
        pushToast({ title: "Form submitted", body: formType, tone: "success" });
        log(`submit_form ${formType}`, "dispatched");
        return { success: true, message: `Submitted ${formType}` };
      }

      default:
        log(name, "unknown command");
        return { success: false, message: `Unknown page agent command: ${name}` };
    }
  }, [navigate, pushToast]);

  return { commandLog, execute };
}
