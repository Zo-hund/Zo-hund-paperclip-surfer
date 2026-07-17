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
        [SerializeField] private MonoBehaviour connectorComponent;
        [SerializeField] private UnityEvent<string> statusChanged;

        private IAmxLiveKitConnector connector;
        private CancellationTokenSource lifetime;

        private void Awake()
        {
            connector = connectorComponent as IAmxLiveKitConnector;
            connector ??= GetComponents<MonoBehaviour>().OfType<IAmxLiveKitConnector>().FirstOrDefault();
            lifetime = new CancellationTokenSource();
        }

        public async void JoinRoom()
        {
            if (connector == null)
            {
                statusChanged?.Invoke("LiveKit connector is not installed. Import a native Unity LiveKit adapter.");
                return;
            }

            try
            {
                var api = new AmxApiClient(environment);
                var token = await api.RequestLiveKitTokenAsync(roomCode, lifetime.Token);
                await connector.ConnectAsync(token.serverUrl, token.participantToken, lifetime.Token);
                statusChanged?.Invoke($"Connected to {token.room}");
            }
            catch (Exception error)
            {
                statusChanged?.Invoke($"LiveKit connection blocked: {error.Message}");
            }
        }

        public async void LeaveRoom()
        {
            if (connector == null || !connector.IsConnected) return;
            await connector.DisconnectAsync();
            statusChanged?.Invoke("LiveKit room disconnected");
        }

        private void OnDestroy()
        {
            lifetime?.Cancel();
            lifetime?.Dispose();
        }
    }
}
