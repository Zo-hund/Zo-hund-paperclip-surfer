import { buildAdapterEnvConfig } from "@paperclipai/adapter-utils";
import { parseOpenCodeStdoutLine } from "@paperclipai/adapter-opencode-local/ui";
import type { AdapterConfigFieldsProps, UIAdapterModule } from "./types";
import { Field, DraftInput } from "../components/agent-config-primitives";

function OpenRouterConfigFields({ isCreate, values, set, config, eff, mark, hideInstructionsFile, managedSandboxOnly }: AdapterConfigFieldsProps) {
  return <>
    <p className="text-muted-foreground">
      Choose a managed environment and bind your OpenRouter key in Secrets.
      An owner-provided key must be explicitly assigned to this company.
      Runs require an active sandbox lease and keep tool approval checks enabled.
    </p>
    {!hideInstructionsFile && !managedSandboxOnly && <Field label="Workspace instructions file" hint="A file within this agent’s assigned workspace. Files outside that workspace cannot be read.">
      <DraftInput
        value={isCreate ? values!.instructionsFilePath ?? "" : eff("adapterConfig", "instructionsFilePath", String(config.instructionsFilePath ?? ""))}
        onCommit={(value) => isCreate ? set!({ instructionsFilePath: value }) : mark("adapterConfig", "instructionsFilePath", value || undefined)}
        placeholder="AGENTS.md"
        immediate
      />
    </Field>}
  </>;
}

export const openRouterUIAdapter: UIAdapterModule = {
  type: "openrouter", label: "OpenRouter", parseStdoutLine: parseOpenCodeStdoutLine,
  ConfigFields: OpenRouterConfigFields,
  buildAdapterConfig: (values) => ({
    model: values.model,
    instructionsFilePath: values.instructionsFilePath || undefined,
    env: buildAdapterEnvConfig(values.envBindings, values.envVars),
    dangerouslySkipPermissions: false, timeoutSec: 300, graceSec: 20,
  }),
};
