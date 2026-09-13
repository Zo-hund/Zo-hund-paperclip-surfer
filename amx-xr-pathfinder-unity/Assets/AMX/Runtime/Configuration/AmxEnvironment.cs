using UnityEngine;

namespace AMX.XR.Configuration
{
    [CreateAssetMenu(fileName = "AMX Environment", menuName = "AMX XR/Environment")]
    public sealed class AmxEnvironment : ScriptableObject
    {
        [SerializeField] private string apiBaseUrl = "https://amx-air-hubs-stage.zohund-ai.chatgpt.site";
        [SerializeField] private string tenantId = "tech-at-nite";
        [SerializeField] private string learnerId = "guest-user";
        [SerializeField] private string participantName = "AMX Explorer";
        [SerializeField] private string defaultMissionId = "xrt-green-mode";
        [SerializeField] private string defaultAgentId = "jaz";
        [SerializeField] private bool allowInsecureLocalhost;

        public string ApiBaseUrl => apiBaseUrl.TrimEnd('/');
        public string TenantId => tenantId;
        public string LearnerId => learnerId;
        public string ParticipantName => participantName;
        public string DefaultMissionId => defaultMissionId;
        public string DefaultAgentId => defaultAgentId;
        public bool AllowInsecureLocalhost => allowInsecureLocalhost;

        public bool IsValid(out string error)
        {
            if (!System.Uri.TryCreate(ApiBaseUrl, System.UriKind.Absolute, out var uri))
            {
                error = "AMX API base URL must be absolute.";
                return false;
            }

            var local = uri.Host == "localhost" || uri.Host == "127.0.0.1";
            if (uri.Scheme != System.Uri.UriSchemeHttps && !(local && allowInsecureLocalhost))
            {
                error = "AMX API must use HTTPS outside an explicitly enabled localhost session.";
                return false;
            }

            if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(learnerId))
            {
                error = "Tenant and learner IDs are required.";
                return false;
            }

            error = string.Empty;
            return true;
        }
    }
}
