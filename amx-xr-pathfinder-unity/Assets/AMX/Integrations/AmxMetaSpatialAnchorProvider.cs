using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using AMX.XR.Spatial;
using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxMetaSpatialAnchorProvider : MonoBehaviour, IAmxSpatialAnchorProvider
    {
        public async Task<string> CreatePersistentAnchorAsync(Transform target)
        {
            if (!target) throw new ArgumentNullException(nameof(target));

            var anchor = target.GetComponent<OVRSpatialAnchor>() ?? target.gameObject.AddComponent<OVRSpatialAnchor>();
            if (!await anchor.WhenLocalizedAsync())
                throw new InvalidOperationException("Meta could not create and localize the spatial anchor.");

            var saveResult = await anchor.SaveAnchorAsync();
            if (!saveResult.Success)
                throw new InvalidOperationException($"Meta could not persist the spatial anchor: {saveResult.Status}");

            return anchor.Uuid.ToString("D");
        }

        public async Task<bool> RestorePersistentAnchorAsync(string handle, Transform target)
        {
            if (!target || !Guid.TryParse(handle, out var uuid)) return false;
            var existing = target.GetComponent<OVRSpatialAnchor>();
            if (existing && existing.Created && existing.Uuid == uuid)
            {
                target.SetPositionAndRotation(existing.transform.position, existing.transform.rotation);
                return existing.Localized;
            }

            var unboundAnchors = new List<OVRSpatialAnchor.UnboundAnchor>();
            var loadResult = await OVRSpatialAnchor.LoadUnboundAnchorsAsync(new[] { uuid }, unboundAnchors);
            if (!loadResult.Success) return false;

            var unbound = unboundAnchors.FirstOrDefault(candidate => candidate.Uuid == uuid);
            if (unbound.Uuid == Guid.Empty || !await unbound.LocalizeAsync()) return false;

            var anchor = target.gameObject.AddComponent<OVRSpatialAnchor>();
            unbound.BindTo(anchor);
            return anchor.Localized;
        }
    }
}
