using AMX.XR.Configuration;
using AMX.XR.Missions;
using AMX.XR.Realtime;
using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxQuestStatusPanel : MonoBehaviour
    {
        [SerializeField] private AmxEnvironment environment;
        [SerializeField] private AmxMissionRuntime missionRuntime;
        [SerializeField] private AmxLiveKitRoomBridge roomBridge;
        [SerializeField] private TextMesh statusText;
        [SerializeField, Min(0.6f)] private float viewDistance = 1.35f;
        [SerializeField] private Vector2 viewOffset = new Vector2(-0.43f, 0.26f);

        private Transform headsetView;

        private void OnEnable()
        {
            if (roomBridge) roomBridge.StatusUpdated += HandleRoomStatus;
            Refresh();
        }

        private void OnDisable()
        {
            if (roomBridge) roomBridge.StatusUpdated -= HandleRoomStatus;
        }

        private void HandleRoomStatus(string _)
        {
            Refresh();
        }

        private void LateUpdate()
        {
            if (!headsetView)
            {
                var mainCamera = Camera.main;
                if (!mainCamera) return;
                headsetView = mainCamera.transform;
            }

            transform.position = headsetView.position + headsetView.forward * viewDistance +
                                 headsetView.right * viewOffset.x + headsetView.up * viewOffset.y;
            transform.rotation = Quaternion.LookRotation(headsetView.forward, headsetView.up);
        }

        private void Refresh()
        {
            if (!statusText) return;
            var tenant = environment ? environment.TenantId.ToUpperInvariant() : "UNBOUND";
            var mission = missionRuntime && missionRuntime.Mission != null
                ? missionRuntime.Mission.title.ToUpperInvariant()
                : environment ? environment.DefaultMissionId.ToUpperInvariant() : "UNAVAILABLE";
            var room = roomBridge ? FormatRoomStatus(roomBridge.Status) : "ROOM UNAVAILABLE";
            statusText.text = $"AMX XR PATH FINDER\n\nTENANT   {Fit(tenant)}\nMISSION  {Fit(mission)}\nROOM     {Fit(room)}";
        }

        private static string FormatRoomStatus(string status)
        {
            return status.IndexOf("authentication required", System.StringComparison.OrdinalIgnoreCase) >= 0
                ? "AUTH REQUIRED"
                : status.ToUpperInvariant();
        }

        private static string Fit(string value)
        {
            const int maxLength = 30;
            return value.Length <= maxLength ? value : value.Substring(0, maxLength - 3) + "...";
        }
    }
}
