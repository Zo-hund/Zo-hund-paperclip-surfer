using System;
using System.Linq;
using AMX.XR.Contracts;
using UnityEngine;

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

}
