using System;
using System.Collections.Generic;
using AMX.XR.Missions;
using AMX.XR.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Simulation
{
    public enum AmxDataCenterScenario
    {
        NormalOperations,
        TenantBurst,
        HotAisle,
        NetworkDegradation,
        UpsTransfer
    }

    public sealed class AmxDataCenterSimulation : MonoBehaviour
    {
        private static readonly string[] ToolSequence =
        {
            "dcim.inspect",
            "rack.thermal-map",
            "incident.runbook"
        };

        [SerializeField] private Transform nexusWorld;
        [SerializeField] private Transform digitalTwin;
        [SerializeField] private TextMesh telemetryText;
        [SerializeField] private AmxMissionRuntime missionRuntime;
        [SerializeField] private UnityEvent<string> statusChanged;

        private readonly List<Renderer>[] rackServers =
        {
            new List<Renderer>(), new List<Renderer>(), new List<Renderer>(), new List<Renderer>()
        };
        private readonly Renderer[] rackIndicators = new Renderer[4];
        private Transform coolingRotor;
        private Transform hologram;
        private int toolIndex;
        private bool toolCallInFlight;
        private string skillStatus = "SKILLS READY";
        private string agentStatus = "JAZ READY";
        private SimulationProfile activeProfile;

        public AmxDataCenterScenario Scenario { get; private set; }
        public bool ImmersiveMode { get; private set; }

        private void Start()
        {
            BindWorldObjects();
            if (missionRuntime)
            {
                missionRuntime.BeginMission();
                missionRuntime.CompleteStep("know-baseline");
            }
            SetScenario(AmxDataCenterScenario.NormalOperations);
        }

        private void Update()
        {
            if (coolingRotor) coolingRotor.Rotate(0f, 0f, activeProfile.coolingPercent * 1.9f * Time.deltaTime, Space.Self);
            if (hologram) hologram.Rotate(0f, 18f * Time.deltaTime, 0f, Space.Self);
        }

        public void NextScenario()
        {
            var count = Enum.GetValues(typeof(AmxDataCenterScenario)).Length;
            SetScenario((AmxDataCenterScenario)(((int)Scenario + 1) % count));
        }

        public void PreviousScenario()
        {
            var count = Enum.GetValues(typeof(AmxDataCenterScenario)).Length;
            SetScenario((AmxDataCenterScenario)(((int)Scenario + count - 1) % count));
        }

        public void ResetScenario()
        {
            SetScenario(AmxDataCenterScenario.NormalOperations);
        }

        public void SetImmersiveMode(bool immersive)
        {
            ImmersiveMode = immersive;
            if (nexusWorld) nexusWorld.gameObject.SetActive(immersive);
            if (digitalTwin) digitalTwin.gameObject.SetActive(!immersive);
            UpdateConsole(activeProfile);
            Report(immersive ? "Immersive control room active" : "Mixed-reality control room active");
        }

        public async void RunNextSkill()
        {
            if (toolCallInFlight) return;
            var toolName = ToolSequence[toolIndex++ % ToolSequence.Length];
            toolCallInFlight = true;
            skillStatus = $"RUNNING {toolName.ToUpperInvariant()}";
            UpdateConsole(activeProfile);

            if (!missionRuntime)
            {
                skillStatus = "LOCAL SIM COMPLETE";
                toolCallInFlight = false;
                UpdateConsole(activeProfile);
                return;
            }

            try
            {
                var response = await missionRuntime.InvokeToolAsync(toolName);
                var traceStatus = response?.trace?.status ?? "complete";
                skillStatus = $"{toolName.ToUpperInvariant()} {traceStatus.ToUpperInvariant()}";
                Report($"Simulation skill {toolName}: {traceStatus}");
            }
            catch (AmxApiException error) when (error.StatusCode == 401)
            {
                skillStatus = "LOCAL SIM / REMOTE AUTH REQUIRED";
                Report($"Simulation skill {toolName} completed locally; remote gateway requires authentication");
            }
            catch (Exception error)
            {
                skillStatus = "LOCAL SIM / REMOTE OFFLINE";
                Report($"Simulation skill {toolName} completed locally: {error.Message}");
            }
            finally
            {
                if (missionRuntime) missionRuntime.CompleteStep("be-governance");
                if (missionRuntime && toolIndex >= ToolSequence.Length)
                {
                    missionRuntime.CompleteStep("issue-proof");
                    missionRuntime.CompleteMission();
                }
                toolCallInFlight = false;
                UpdateConsole(activeProfile);
            }
        }

        public async void AskAgentForScenario()
        {
            if (!missionRuntime || toolCallInFlight) return;
            var profile = activeProfile;
            toolCallInFlight = true;
            agentStatus = "JAZ REVIEWING SCENARIO";
            UpdateConsole(profile);
            try
            {
                var response = await missionRuntime.AskAgentAsync(
                    $"Review {profile.label}: IT load {profile.itLoadKw:0.0} kW, PUE {profile.pue:0.00}, " +
                    $"temperature {profile.temperatureC:0.0} C, network {profile.networkGbps:0.0} Gbps, alarm {profile.alarm}. " +
                    "Recommend a reversible, human-governed next action.");
                agentStatus = $"JAZ {Fit(response, 38).ToUpperInvariant()}";
            }
            catch (AmxApiException error) when (error.StatusCode == 401)
            {
                agentStatus = "JAZ LOCAL: VERIFY, SIMULATE, APPROVE";
            }
            catch (Exception)
            {
                agentStatus = "JAZ LOCAL: PRESERVE SLA / NO ACTUATION";
            }
            finally
            {
                toolCallInFlight = false;
                UpdateConsole(profile);
            }
        }

        private void SetScenario(AmxDataCenterScenario scenario)
        {
            Scenario = scenario;
            var profile = ProfileFor(scenario);
            activeProfile = profile;
            if (scenario != AmxDataCenterScenario.NormalOperations && missionRuntime)
                missionRuntime.CompleteStep("do-scenarios");
            ApplyRackHealth(profile);
            skillStatus = scenario == AmxDataCenterScenario.NormalOperations ? "SKILLS READY" : "ANALYSIS READY";
            UpdateConsole(profile);
            Report($"Scenario active: {profile.label}");
        }

        private void BindWorldObjects()
        {
            if (!digitalTwin) return;
            coolingRotor = FindDeep(digitalTwin, "Actuator_Cooling_Rotor");
            hologram = nexusWorld ? FindDeep(nexusWorld, "Nexus_Hologram") : null;
            for (var rackIndex = 0; rackIndex < rackIndicators.Length; rackIndex++)
            {
                var rackName = $"Rack_{rackIndex + 1:00}";
                var status = FindDeep(digitalTwin, $"{rackName}_Status");
                rackIndicators[rackIndex] = status ? status.GetComponent<Renderer>() : null;
                foreach (var renderer in digitalTwin.GetComponentsInChildren<Renderer>(true))
                {
                    if (renderer.name.StartsWith($"{rackName}_Server_", StringComparison.Ordinal))
                        rackServers[rackIndex].Add(renderer);
                }
            }

            Debug.Log($"AMX Simulation: bound {rackIndicators.Length} racks, {CountServerRenderers()} server blades, cooling={BooleanLabel(coolingRotor)}, hologram={BooleanLabel(hologram)}", this);
        }

        private void ApplyRackHealth(SimulationProfile profile)
        {
            for (var index = 0; index < rackIndicators.Length; index++)
            {
                var health = profile.rackHealth[index];
                var color = health == 2 ? new Color(1f, 0.08f, 0.12f) : health == 1 ? new Color(1f, 0.62f, 0.08f) : new Color(0.12f, 1f, 0.48f);
                SetRendererColor(rackIndicators[index], color, 3.5f);
                foreach (var renderer in rackServers[index])
                    SetRendererColor(renderer, Color.Lerp(new Color(0.06f, 0.16f, 0.2f), color, health == 0 ? 0.12f : 0.42f), health == 0 ? 0.1f : 0.7f);
            }
        }

        private void UpdateConsole(SimulationProfile profile)
        {
            if (!telemetryText) return;
            var alarms = profile.alarm == "NONE" ? "NONE" : profile.alarm;
            telemetryText.text =
                $"AMX MINI DATA CENTER / FACILITY-CELL-01\n\n" +
                $"TENANT    TECH AT NITE\n" +
                $"MODE      {(ImmersiveMode ? "IMMERSIVE" : "MIXED REALITY")}\n" +
                $"SCENARIO  {profile.label}\n\n" +
                $"IT LOAD   {profile.itLoadKw:0.0} KW     PUE {profile.pue:0.00}\n" +
                $"THERMAL   {profile.temperatureC:0.0} C      COOLING {profile.coolingPercent:0}%\n" +
                $"NETWORK   {profile.networkGbps:0.0} GBPS   AVAIL {profile.availability:0.000}%\n\n" +
                $"ALARM     {alarms}\n" +
                $"SKILL     {Fit(skillStatus, 38)}\n" +
                $"AGENT     {Fit(agentStatus, 38)}";
        }

        private void Report(string message)
        {
            Debug.Log($"AMX Simulation: {message}", this);
            statusChanged?.Invoke(message);
        }

        private static Transform FindDeep(Transform root, string objectName)
        {
            foreach (var child in root.GetComponentsInChildren<Transform>(true))
                if (child.name.Equals(objectName, StringComparison.Ordinal)) return child;
            return null;
        }

        private static void SetRendererColor(Renderer renderer, Color color, float emissionStrength)
        {
            if (!renderer) return;
            var material = renderer.material;
            if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", color);
            if (material.HasProperty("_Color")) material.SetColor("_Color", color);
            if (!material.HasProperty("_EmissionColor")) return;
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", color * emissionStrength);
        }

        private int CountServerRenderers()
        {
            var count = 0;
            foreach (var renderers in rackServers) count += renderers.Count;
            return count;
        }

        private static string BooleanLabel(UnityEngine.Object value) => value ? "yes" : "no";

        private static string Fit(string value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value)) return "READY";
            return value.Length <= maxLength ? value : value.Substring(0, maxLength - 3) + "...";
        }

        private static SimulationProfile ProfileFor(AmxDataCenterScenario scenario)
        {
            return scenario switch
            {
                AmxDataCenterScenario.TenantBurst => new SimulationProfile("TENANT BURST", 92.6f, 1.38f, 27.4f, 82f, 43.8f, 99.980f, "RACK 03 CAPACITY WATCH", new[] { 0, 1, 2, 1 }),
                AmxDataCenterScenario.HotAisle => new SimulationProfile("HOT AISLE", 71.2f, 1.51f, 34.6f, 100f, 35.1f, 99.960f, "RACK 02 THERMAL CRITICAL", new[] { 1, 2, 1, 0 }),
                AmxDataCenterScenario.NetworkDegradation => new SimulationProfile("NETWORK LOSS", 58.4f, 1.31f, 24.1f, 76f, 8.7f, 99.910f, "RACK 04 EAST-WEST LOSS", new[] { 0, 0, 1, 2 }),
                AmxDataCenterScenario.UpsTransfer => new SimulationProfile("UPS TRANSFER", 44.8f, 1.42f, 25.2f, 91f, 29.5f, 99.950f, "PROTECTED POWER PATH", new[] { 0, 1, 1, 0 }),
                _ => new SimulationProfile("NORMAL OPERATIONS", 63.8f, 1.27f, 22.8f, 68f, 36.4f, 99.990f, "NONE", new[] { 0, 0, 0, 0 })
            };
        }

        private readonly struct SimulationProfile
        {
            public readonly string label;
            public readonly float itLoadKw;
            public readonly float pue;
            public readonly float temperatureC;
            public readonly float coolingPercent;
            public readonly float networkGbps;
            public readonly float availability;
            public readonly string alarm;
            public readonly int[] rackHealth;

            public SimulationProfile(string label, float itLoadKw, float pue, float temperatureC, float coolingPercent,
                float networkGbps, float availability, string alarm, int[] rackHealth)
            {
                this.label = label;
                this.itLoadKw = itLoadKw;
                this.pue = pue;
                this.temperatureC = temperatureC;
                this.coolingPercent = coolingPercent;
                this.networkGbps = networkGbps;
                this.availability = availability;
                this.alarm = alarm;
                this.rackHealth = rackHealth;
            }
        }
    }
}
