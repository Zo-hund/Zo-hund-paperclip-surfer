using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxQuestControllerRay : MonoBehaviour
    {
        [SerializeField] private OVRInput.Controller controller;
        [SerializeField] private LineRenderer beam;
        [SerializeField] private Transform reticle;
        [SerializeField] private float maximumDistance = 8f;
        [SerializeField] private LayerMask interactionMask = ~0;

        private AmxQuestControlTarget hoveredTarget;
        private float hapticStopTime;

        private void Start()
        {
            beam.positionCount = 2;
            SetVisible(false);
        }

        private void Update()
        {
            if (hapticStopTime > 0f && Time.unscaledTime >= hapticStopTime)
            {
                OVRInput.SetControllerVibration(0f, 0f, controller);
                hapticStopTime = 0f;
            }

            var trigger = OVRInput.Get(OVRInput.Axis1D.PrimaryIndexTrigger, controller);
            var pointing = trigger > 0.02f || OVRInput.Get(OVRInput.NearTouch.PrimaryIndexTrigger, controller);
            if (!pointing || !OVRInput.IsControllerConnected(controller))
            {
                ClearHover();
                SetVisible(false);
                return;
            }

            var ray = new Ray(transform.position, transform.forward);
            var end = ray.GetPoint(maximumDistance);
            AmxQuestControlTarget nextTarget = null;
            if (Physics.Raycast(ray, out var hit, maximumDistance, interactionMask, QueryTriggerInteraction.Collide))
            {
                end = hit.point;
                nextTarget = hit.collider.GetComponentInParent<AmxQuestControlTarget>();
            }

            SetHoveredTarget(nextTarget);
            beam.SetPosition(0, ray.origin);
            beam.SetPosition(1, end);
            beam.enabled = true;
            reticle.position = end;
            reticle.gameObject.SetActive(nextTarget);

            if (nextTarget && OVRInput.GetDown(OVRInput.Button.PrimaryIndexTrigger, controller))
            {
                nextTarget.Activate();
                OVRInput.SetControllerVibration(0.16f, 0.28f, controller);
                hapticStopTime = Time.unscaledTime + 0.055f;
            }
        }

        private void SetHoveredTarget(AmxQuestControlTarget target)
        {
            if (target == hoveredTarget) return;
            if (hoveredTarget) hoveredTarget.SetHovered(false);
            hoveredTarget = target;
            if (hoveredTarget) hoveredTarget.SetHovered(true);
        }

        private void ClearHover()
        {
            SetHoveredTarget(null);
        }

        private void SetVisible(bool visible)
        {
            if (beam) beam.enabled = visible;
            if (reticle) reticle.gameObject.SetActive(false);
        }

        private void OnDisable()
        {
            ClearHover();
            OVRInput.SetControllerVibration(0f, 0f, controller);
        }
    }
}
