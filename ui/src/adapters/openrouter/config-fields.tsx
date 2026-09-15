import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function OpenRouterConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const env = isCreate ? values?.envBindings ?? {} : eff("adapterConfig", "env", (config.env ?? {}) as Record<string, unknown>);
  const hasOverride = Object.prototype.hasOwnProperty.call(env, "OPENROUTER_API_KEY");
  return (
    <>
    <p className="text-sm text-muted-foreground">
      Manage your company default key in Company settings → OpenRouter access.
      An OPENROUTER_API_KEY environment override uses that agent's key instead.
      Remove the override to use the company default or operator-provisioned access.
      Use a company secret reference when adding an override.
    </p>
    {hasOverride && <button type="button" className="text-sm underline" onClick={() => {
      const next = { ...env };
      delete next.OPENROUTER_API_KEY;
      if (isCreate) set!({ envBindings: next, envVars: "" });
      else mark("adapterConfig", "env", next);
    }}>Use company default instead of this agent's key</button>}
    {!hideInstructionsFile &&
    <Field label="Agent instructions file" hint={instructionsFileHint}>
      <div className="flex items-center gap-2">
        <DraftInput
          value={
            isCreate
              ? values!.instructionsFilePath ?? ""
              : eff(
                  "adapterConfig",
                  "instructionsFilePath",
                  String(config.instructionsFilePath ?? ""),
                )
          }
          onCommit={(v) =>
            isCreate
              ? set!({ instructionsFilePath: v })
              : mark("adapterConfig", "instructionsFilePath", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="/absolute/path/to/AGENTS.md"
        />
        <ChoosePathButton />
      </div>
    </Field>
    }
    </>
  );
}
