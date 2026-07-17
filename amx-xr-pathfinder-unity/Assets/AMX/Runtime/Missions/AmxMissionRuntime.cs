using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Contracts;
using AMX.XR.Networking;
using AMX.XR.Proof;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Missions
{
    public sealed class AmxMissionRuntime : MonoBehaviour
    {
        [SerializeField] private AmxEnvironment environment;
        [SerializeField] private TextAsset missionJson;
        [SerializeField] private UnityEvent<string> statusChanged;
        [SerializeField] private UnityEvent<string> agentResponded;
        [SerializeField] private UnityEvent missionCompleted;

        private readonly HashSet<string> completedSteps = new HashSet<string>();
        private readonly Stopwatch stopwatch = new Stopwatch();
        private AmxApiClient api;

        public AmxMissionDefinition Mission { get; private set; }
        public string RunId { get; private set; }
        public bool IsRunning { get; private set; }

        private void Awake()
        {
            if (!environment) throw new InvalidOperationException("Assign an AMX Environment asset.");
            if (!environment.IsValid(out var environmentError)) throw new InvalidOperationException(environmentError);
            if (!missionJson) throw new InvalidOperationException("Assign an AMX mission JSON asset.");

            Mission = JsonUtility.FromJson<AmxMissionDefinition>(missionJson.text);
            if (Mission == null || string.IsNullOrWhiteSpace(Mission.id)) throw new InvalidOperationException("Mission JSON is invalid.");
            api = new AmxApiClient(environment);
            statusChanged?.Invoke($"{Mission.title} ready");
        }

        public void BeginMission()
        {
            if (IsRunning) return;
            completedSteps.Clear();
            RunId = Guid.NewGuid().ToString("N");
            IsRunning = true;
            stopwatch.Restart();
            statusChanged?.Invoke("Mission running");
        }

        public void CompleteStep(string stepId)
        {
            if (!IsRunning || Mission.steps.All(step => step.id != stepId)) return;
            if (completedSteps.Add(stepId)) statusChanged?.Invoke($"Step complete: {stepId}");
        }

        public async void AskAgent(string prompt)
        {
            try
            {
                var response = await api.RespondAsync(new AmxAgentRequest
                {
                    agentId = Mission.agentId,
                    agentName = Mission.agentId.ToUpperInvariant(),
                    text = prompt,
                    contentKind = "text"
                });
                agentResponded?.Invoke(response.text);
            }
            catch (Exception error)
            {
                statusChanged?.Invoke($"Agent unavailable: {error.Message}");
            }
        }

        public async Task<AmxToolResponse> InvokeToolAsync(string toolName)
        {
            return await api.InvokeToolAsync(new AmxToolRequest
            {
                toolName = toolName,
                agentId = Mission.agentId,
                context = new AmxToolContext
                {
                    missionId = Mission.id,
                    tenantId = environment.TenantId,
                    runId = RunId
                }
            });
        }

        public async void CompleteMission()
        {
            if (!IsRunning) return;
            if (completedSteps.Count < Mission.steps.Length)
            {
                statusChanged?.Invoke("Complete every required mission step before issuing proof.");
                return;
            }

            IsRunning = false;
            stopwatch.Stop();
            var proof = BuildProof();
            try
            {
                await api.SubmitCompletedProofAsync(proof);
                statusChanged?.Invoke("Mission proof synchronized");
                missionCompleted?.Invoke();
            }
            catch (Exception error)
            {
                proof.syncStatus = "queued";
                AmxProofQueue.Enqueue(proof);
                statusChanged?.Invoke($"Proof queued on device: {error.Message}");
            }
        }

        private AmxProofRecord BuildProof()
        {
            var timestamp = DateTime.UtcNow.ToString("O");
            var id = $"opprrc-{Guid.NewGuid().ToString("N").Substring(0, 8)}";
            return new AmxProofRecord
            {
                id = id,
                project = Mission.title,
                tenantId = environment.TenantId,
                learnerId = environment.LearnerId,
                agentId = Mission.agentId,
                missionId = Mission.id,
                report = new AmxProofReport
                {
                    completedSteps = completedSteps.ToArray(),
                    score = 100,
                    xp = Mission.xp,
                    durationSeconds = Math.Max(1, (int)stopwatch.Elapsed.TotalSeconds)
                },
                certificate = new AmxCertificate { badge = Mission.badge, issued = true, status = "ready" },
                status = "complete",
                timestamp = timestamp,
                signature = CreateClientSignature(id, timestamp)
            };
        }

        private string CreateClientSignature(string id, string timestamp)
        {
            var source = $"{id}:{environment.TenantId}:{environment.LearnerId}:{Mission.id}:{timestamp}:amx-unity-v1";
            unchecked
            {
                uint hash = 2166136261;
                foreach (var character in source) hash = (hash ^ character) * 16777619;
                return $"amx-{hash:x8}";
            }
        }
    }
}
