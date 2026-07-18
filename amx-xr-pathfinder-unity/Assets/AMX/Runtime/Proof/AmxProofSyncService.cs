using System;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Proof
{
    public sealed class AmxProofSyncService : MonoBehaviour
    {
        [SerializeField] private AmxEnvironment environment;
        [SerializeField] private bool syncOnStart = true;
        [SerializeField] private UnityEvent<string> statusChanged;

        private async void Start()
        {
            if (syncOnStart) await SyncQueuedProofsAsync();
        }

        public async void SyncQueuedProofs()
        {
            await SyncQueuedProofsAsync();
        }

        private async Task SyncQueuedProofsAsync()
        {
            if (!environment)
            {
                statusChanged?.Invoke("Proof sync requires an AMX Environment asset.");
                return;
            }

            var queued = AmxProofQueue.Read();
            if (queued.Length == 0)
            {
                statusChanged?.Invoke("Proof queue is clear");
                return;
            }

            var api = new AmxApiClient(environment);
            var synced = 0;
            foreach (var proof in queued)
            {
                try
                {
                    await api.SubmitCompletedProofAsync(proof);
                    AmxProofQueue.Remove(proof.id);
                    synced += 1;
                }
                catch (Exception error)
                {
                    statusChanged?.Invoke($"Proof sync paused: {error.Message}");
                    break;
                }
            }

            statusChanged?.Invoke($"Synchronized {synced} queued proof record(s)");
        }
    }
}
