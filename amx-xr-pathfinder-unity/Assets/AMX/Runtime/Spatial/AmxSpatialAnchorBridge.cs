using System;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Contracts;
using AMX.XR.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Spatial
{
    public interface IAmxSpatialAnchorProvider
    {
        Task<string> CreatePersistentAnchorAsync(Transform target);
        Task<bool> RestorePersistentAnchorAsync(string handle, Transform target);
    }

    public sealed class AmxSpatialAnchorBridge : MonoBehaviour
    {
        [SerializeField] private AmxEnvironment environment;
        [SerializeField] private string roomCode = "AMX-QUEST";
        [SerializeField] private string anchorLabel = "Learning station";
        [SerializeField] private Transform anchorTarget;
        [SerializeField] private MonoBehaviour providerComponent;
        [SerializeField] private UnityEvent<string> statusChanged;

        private IAmxSpatialAnchorProvider provider;

        private void Awake()
        {
            provider = providerComponent as IAmxSpatialAnchorProvider;
            anchorTarget ??= transform;
        }

        public async void PublishAnchor()
        {
            if (!environment)
            {
                statusChanged?.Invoke("Spatial anchors require an AMX Environment asset.");
                return;
            }

            if (!environment.IsValid(out var environmentError))
            {
                statusChanged?.Invoke(environmentError);
                return;
            }

            if (provider == null)
            {
                statusChanged?.Invoke("Spatial anchor provider is not configured. Install MRUK and assign its adapter.");
                return;
            }

            try
            {
                var handle = await provider.CreatePersistentAnchorAsync(anchorTarget);
                var position = anchorTarget.localPosition;
                var rotation = anchorTarget.localRotation;
                var anchor = new AmxSpatialAnchor
                {
                    id = $"quest-{Guid.NewGuid():N}",
                    roomCode = roomCode,
                    label = anchorLabel,
                    ownerId = environment.LearnerId,
                    localPosition = new[] { position.x, position.y, position.z },
                    orientation = new[] { rotation.x, rotation.y, rotation.z, rotation.w },
                    source = "camera",
                    persistentHandle = handle,
                    createdAt = DateTime.UtcNow.ToString("O")
                };
                await new AmxApiClient(environment).SaveAnchorAsync(anchor);
                statusChanged?.Invoke("Spatial anchor synchronized");
            }
            catch (Exception error)
            {
                statusChanged?.Invoke($"Anchor synchronization failed: {error.Message}");
            }
        }
    }
}
