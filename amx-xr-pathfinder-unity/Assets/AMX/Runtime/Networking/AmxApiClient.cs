using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Contracts;
using UnityEngine;
using UnityEngine.Networking;

namespace AMX.XR.Networking
{
    public sealed class AmxApiClient
    {
        private readonly AmxEnvironment environment;

        public AmxApiClient(AmxEnvironment environment)
        {
            this.environment = environment ? environment : throw new ArgumentNullException(nameof(environment));
            if (!environment.IsValid(out var error)) throw new InvalidOperationException(error);
        }

        public Task<AmxAgentResponse> RespondAsync(AmxAgentRequest request, CancellationToken cancellationToken = default)
        {
            request.tenantId = environment.TenantId;
            return SendJsonAsync<AmxAgentResponse>("POST", "/api/agents/respond", request, cancellationToken);
        }

        public Task<AmxToolResponse> InvokeToolAsync(AmxToolRequest request, CancellationToken cancellationToken = default)
        {
            return SendJsonAsync<AmxToolResponse>("POST", "/api/agents/tools/invoke", request, cancellationToken);
        }

        public Task<AmxLiveKitTokenResponse> RequestLiveKitTokenAsync(string roomCode, CancellationToken cancellationToken = default)
        {
            var request = new AmxLiveKitTokenRequest
            {
                room = roomCode,
                identity = environment.LearnerId,
                name = environment.ParticipantName
            };
            return SendJsonAsync<AmxLiveKitTokenResponse>("POST", "/api/livekit/token", request, cancellationToken);
        }

        public Task<AmxSpatialAnchor> SaveAnchorAsync(AmxSpatialAnchor anchor, CancellationToken cancellationToken = default)
        {
            anchor.tenantId = environment.TenantId;
            return SaveAnchorInternalAsync(anchor, cancellationToken);
        }

        public Task<AmxAnchorListResponse> GetAnchorsAsync(string roomCode, CancellationToken cancellationToken = default)
        {
            var path = $"/api/anchors?tenantId={UnityWebRequest.EscapeURL(environment.TenantId)}&room={UnityWebRequest.EscapeURL(roomCode)}";
            return SendJsonAsync<AmxAnchorListResponse>("GET", path, null, cancellationToken);
        }

        public Task<AmxProofRecord> SubmitCompletedProofAsync(AmxProofRecord proof, CancellationToken cancellationToken = default)
        {
            var envelope = new AmxSyncEnvelope { id = Guid.NewGuid().ToString("N"), type = "proof:complete", payload = proof };
            return SendProofEnvelopeAsync(envelope, cancellationToken);
        }

        private async Task<AmxProofRecord> SendProofEnvelopeAsync(AmxSyncEnvelope envelope, CancellationToken cancellationToken)
        {
            await SendJsonAsync<AmxSyncAck>("POST", "/api/sync", envelope, cancellationToken);
            envelope.payload.syncStatus = "synced";
            return envelope.payload;
        }

        private async Task<AmxSpatialAnchor> SaveAnchorInternalAsync(AmxSpatialAnchor anchor, CancellationToken cancellationToken)
        {
            var response = await SendJsonAsync<AmxAnchorItemResponse>("POST", "/api/anchors", anchor, cancellationToken);
            if (response == null || response.item == null) throw new AmxApiException("AMX API returned no anchor.");
            return response.item;
        }

        private async Task<T> SendJsonAsync<T>(string method, string path, object body, CancellationToken cancellationToken)
        {
            using var request = new UnityWebRequest(environment.ApiBaseUrl + path, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Accept", "application/json");
            request.SetRequestHeader("X-AMX-Tenant", environment.TenantId);

            if (body != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(JsonUtility.ToJson(body)));
                request.SetRequestHeader("Content-Type", "application/json");
            }

            using var registration = cancellationToken.Register(request.Abort);
            await request.SendWebRequest().AsTask();

            if (request.result != UnityWebRequest.Result.Success)
            {
                var message = request.error;
                if (!string.IsNullOrWhiteSpace(request.downloadHandler.text))
                {
                    var apiError = JsonUtility.FromJson<AmxApiError>(request.downloadHandler.text);
                    if (apiError != null && !string.IsNullOrWhiteSpace(apiError.error)) message = apiError.error;
                }
                throw new AmxApiException(message, request.responseCode);
            }

            return JsonUtility.FromJson<T>(request.downloadHandler.text);
        }
    }

    public sealed class AmxApiException : Exception
    {
        public long StatusCode { get; }

        public AmxApiException(string message, long statusCode = 0) : base(message)
        {
            StatusCode = statusCode;
        }
    }

    internal static class AmxUnityWebRequestExtensions
    {
        public static Task AsTask(this UnityWebRequestAsyncOperation operation)
        {
            var completion = new TaskCompletionSource<bool>();
            operation.completed += _ => completion.TrySetResult(true);
            return completion.Task;
        }
    }
}
