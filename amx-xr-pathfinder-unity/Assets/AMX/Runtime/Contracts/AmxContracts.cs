using System;

namespace AMX.XR.Contracts
{
    [Serializable]
    public sealed class AmxMissionDefinition
    {
        public string id;
        public string title;
        public string domain;
        public string objective;
        public string agentId;
        public string badge;
        public int xp;
        public AmxMissionStep[] steps = Array.Empty<AmxMissionStep>();
    }

    [Serializable]
    public sealed class AmxMissionStep
    {
        public string id;
        public string title;
        public string prompt;
        public int xp;
    }

    [Serializable]
    public sealed class AmxAgentRequest
    {
        public string agentId;
        public string agentName;
        public string tenantId;
        public string text;
        public string contentKind = "text";
        public AmxAttachment[] attachments = Array.Empty<AmxAttachment>();
    }

    [Serializable]
    public sealed class AmxAttachment
    {
        public string id;
        public string kind;
        public string name;
        public string mimeType;
        public int size;
        public string transfer = "metadata";
        public string content;
    }

    [Serializable]
    public sealed class AmxAgentResponse
    {
        public string text;
        public string transport;
        public AmxToolTrace[] tools = Array.Empty<AmxToolTrace>();
        public string warning;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxToolRequest
    {
        public string toolName;
        public string agentId;
        public AmxToolContext context;
    }

    [Serializable]
    public sealed class AmxToolContext
    {
        public string missionId;
        public string roomCode;
        public string tenantId;
        public string runId;
    }

    [Serializable]
    public sealed class AmxToolResponse
    {
        public AmxToolTrace trace;
        public string output;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxToolTrace
    {
        public string id;
        public string name;
        public string source;
        public string status;
        public string detail;
        public string timestamp;
    }

    [Serializable]
    public sealed class AmxLiveKitTokenRequest
    {
        public string room;
        public string identity;
        public string name;
    }

    [Serializable]
    public sealed class AmxLiveKitTokenResponse
    {
        public string serverUrl;
        public string participantToken;
        public string room;
        public int expiresIn;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxSpatialAnchor
    {
        public string id;
        public string tenantId;
        public string roomCode;
        public string label;
        public string ownerId;
        public float[] localPosition = new float[3];
        public float[] orientation = { 0f, 0f, 0f, 1f };
        public string source = "camera";
        public string persistentHandle;
        public string createdAt;
        public string updatedAt;
    }

    [Serializable]
    public sealed class AmxAnchorListResponse
    {
        public AmxSpatialAnchor[] items = Array.Empty<AmxSpatialAnchor>();
        public bool persisted;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxAnchorItemResponse
    {
        public AmxSpatialAnchor item;
        public bool persisted;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxProofReport
    {
        public string[] completedSteps = Array.Empty<string>();
        public int score;
        public int xp;
        public int durationSeconds;
    }

    [Serializable]
    public sealed class AmxCertificate
    {
        public string badge;
        public bool issued;
        public string status;
    }

    [Serializable]
    public sealed class AmxProofRecord
    {
        public string id;
        public string org = "AMX AIR Hubs";
        public string program = "AMX XR Path Finder";
        public string project;
        public string resource = "Meta Quest XR Mission";
        public string tenantId;
        public string learnerId;
        public string role = "Learner";
        public string agentId;
        public string missionId;
        public string device = "meta-quest";
        public AmxProofReport report;
        public AmxCertificate certificate;
        public string status;
        public string signature;
        public string timestamp;
        public string syncStatus = "queued";
    }

    [Serializable]
    public sealed class AmxSyncEnvelope
    {
        public string id;
        public string type;
        public AmxProofRecord payload;
    }

    [Serializable]
    public sealed class AmxSyncAck
    {
        public bool synced;
        public bool persisted;
        public string id;
        public string requestId;
    }

    [Serializable]
    public sealed class AmxQueuedProofCollection
    {
        public AmxProofRecord[] records = Array.Empty<AmxProofRecord>();
    }

    [Serializable]
    public sealed class AmxApiError
    {
        public string error;
        public string requestId;
    }
}
