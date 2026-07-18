using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Realtime
{
    public interface IAmxLiveKitConnector
    {
        bool IsConnected { get; }
        Task ConnectAsync(string serverUrl, string participantToken, CancellationToken cancellationToken);
        Task DisconnectAsync();
    }

    public sealed class AmxLiveKitRoomBridge : MonoBehaviour
    {
        [SerializeField] private AmxEnvironment environment;
        [SerializeField] private string roomCode = "AMX-QUEST";
        [SerializeField] private bool joinOnStart = true;
        [SerializeField] private MonoBehaviour connectorComponent;
        [SerializeField] private UnityEvent<string> statusChanged;

        private IAmxLiveKitConnector connector;
        private CancellationTokenSource lifetime;

        public string Status { get; private set; } = "Initializing room";
        public event Action<string> StatusUpdated;

        private void Awake()
        {
            connector = connectorComponent as IAmxLiveKitConnector;
            connector ??= GetComponents<MonoBehaviour>().OfType<IAmxLiveKitConnector>().FirstOrDefault();
            lifetime = new CancellationTokenSource();
            ReportStatus(environment ? $"Room {roomCode} ready" : "AMX environment is unavailable");
        }

        private void Start()
        {
            if (joinOnStart) JoinRoom();
        }

        public async void JoinRoom()
        {
            if (!environment)
            {
                ReportStatus("LiveKit requires an AMX Environment asset.");
                return;
            }

            if (!environment.IsValid(out var environmentError))
            {
                ReportStatus(environmentError);
                return;
            }

            if (connector == null)
            {
                ReportStatus("LiveKit connector is not installed.");
                return;
            }

            if (connector.IsConnected)
            {
                ReportStatus($"Connected to {roomCode}");
                return;
            }

            try
            {
                ReportStatus($"Joining {roomCode}");
                var api = new AmxApiClient(environment);
                var token = await api.RequestLiveKitTokenAsync(roomCode, lifetime.Token);
                await connector.ConnectAsync(token.serverUrl, token.participantToken, lifetime.Token);
                ReportStatus($"Connected to {token.room}");
            }
            catch (Exception error)
            {
                var message = error is AmxApiException { StatusCode: 401 }
                    ? "Private stage authentication required"
                    : $"LiveKit blocked: {error.Message}";
                ReportStatus(message);
            }
        }

        public async void LeaveRoom()
        {
            if (connector == null || !connector.IsConnected) return;
            await connector.DisconnectAsync();
            ReportStatus("LiveKit room disconnected");
        }

        private void ReportStatus(string message)
        {
            Status = message;
            Debug.Log($"AMX LiveKit: {message}", this);
            statusChanged?.Invoke(message);
            StatusUpdated?.Invoke(message);
        }

        private void OnDestroy()
        {
            lifetime?.Cancel();
            lifetime?.Dispose();
        }
    }
}
