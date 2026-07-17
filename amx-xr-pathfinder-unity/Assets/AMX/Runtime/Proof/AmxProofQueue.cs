using System;
using System.Linq;
using System.Threading.Tasks;
using AMX.XR.Configuration;
using AMX.XR.Contracts;
using AMX.XR.Networking;
using UnityEngine;
using UnityEngine.Events;

namespace AMX.XR.Proof
{
    public static class AmxProofQueue
    {
        private const string QueueKey = "amx.xr.proof.queue.v1";

        public static AmxProofRecord[] Read()
        {
            var json = PlayerPrefs.GetString(QueueKey, string.Empty);
            if (string.IsNullOrWhiteSpace(json)) return Array.Empty<AmxProofRecord>();
            var collection = JsonUtility.FromJson<AmxQueuedProofCollection>(json);
            return collection?.records ?? Array.Empty<AmxProofRecord>();
        }

        public static void Enqueue(AmxProofRecord proof)
        {
            var records = Read().Where(item => item.id != proof.id).Append(proof).ToArray();
            Write(records);
        }

        public static void Remove(string proofId)
        {
            Write(Read().Where(item => item.id != proofId).ToArray());
        }

        private static void Write(AmxProofRecord[] records)
        {
            PlayerPrefs.SetString(QueueKey, JsonUtility.ToJson(new AmxQueuedProofCollection { records = records }));
            PlayerPrefs.Save();
        }
    }

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
