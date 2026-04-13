import type { UIAdapterModule } from "../types";
import { HermesAdvancedConfigFields } from "./config-fields";

export const hermesAdvancedUIAdapter: UIAdapterModule = {
  type: "hermes_advanced",
  label: "Hermes Advanced (Nous)",
  parseStdoutLine: (line, ts) => [{ kind: "stdout", ts, text: line }],
  ConfigFields: HermesAdvancedConfigFields,
  buildAdapterConfig: (values) => ({
    instructionsFilePath: values.instructionsFilePath,
    model: values.model || "anthropic/claude-3-5-sonnet",
  }),
};
