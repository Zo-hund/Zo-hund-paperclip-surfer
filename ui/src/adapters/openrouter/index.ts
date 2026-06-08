import type { UIAdapterModule } from "../types";
import { parseStdoutLine, buildAdapterConfig } from "@paperclipai/adapter-openrouter/ui";
import { OpenRouterConfigFields } from "./config-fields";

export const openRouterUIAdapter: UIAdapterModule = {
  type: "openrouter",
  label: "OpenRouter",
  parseStdoutLine,
  ConfigFields: OpenRouterConfigFields,
  buildAdapterConfig,
};
