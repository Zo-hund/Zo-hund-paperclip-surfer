using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxQuestLocomotion : MonoBehaviour
    {
        private const int ArcPointCount = 28;
        private const float TeleportAimThreshold = 0.68f;
        private const float TeleportReleaseThreshold = 0.24f;

        [SerializeField] private OVRCameraRig cameraRig;
        [SerializeField] private OVRPlayerController playerController;
        [SerializeField] private CharacterController characterController;
        [SerializeField] private Transform teleportSource;
        [SerializeField] private LineRenderer teleportArc;
        [SerializeField] private Transform teleportReticle;
        [SerializeField] private Renderer teleportReticleRenderer;
        [SerializeField] private Material validTeleportMaterial;
        [SerializeField] private Material invalidTeleportMaterial;
        [SerializeField] private Renderer comfortVignette;
        [SerializeField] private TextMesh locomotionStatus;
        [SerializeField] private LayerMask teleportMask = ~0;
        [SerializeField] private float teleportSpeed = 7.4f;
        [SerializeField] private float teleportLift = 2.4f;
        [SerializeField] private float teleportStepSeconds = 0.065f;
        [SerializeField] private float maximumSlope = 42f;
        [SerializeField] private float sprintMultiplier = 1.55f;

        private readonly Vector3[] arcPoints = new Vector3[ArcPointCount];
        private readonly Collider[] clearanceHits = new Collider[24];
        private MaterialPropertyBlock vignetteProperties;
        private Vector3 teleportDestination;
        private bool teleportValid;
        private bool teleportAiming;
        private float recenterHoldSeconds;
        private float vignetteAlpha;
        private float hapticStopTime;
        private OVRInput.Controller hapticController;
        private int comfortProfile = 1;

        public string ComfortProfileName => comfortProfile switch
        {
            0 => "COMFORT",
            2 => "DIRECT",
            _ => "BALANCED"
        };

        private void Awake()
        {
            vignetteProperties = new MaterialPropertyBlock();
        }

        private void Start()
        {
            if (OVRManager.display != null) OVRManager.display.RecenterPose();
            ApplyComfortProfile(comfortProfile);
            SetTeleportVisuals(false);
            SetVignetteAlpha(0f);
            Debug.Log("AMX Locomotion: smooth movement, snap turn, teleport, sprint, grab, rays, and recenter ready", this);
        }

        private void Update()
        {
            var moveAxis = OVRInput.Get(OVRInput.Axis2D.PrimaryThumbstick);
            var turnAxis = OVRInput.Get(OVRInput.Axis2D.SecondaryThumbstick);
            var sprinting = OVRInput.Get(OVRInput.Button.PrimaryThumbstick) && moveAxis.sqrMagnitude > 0.1f;
            playerController.SetMoveScaleMultiplier(ProfileMoveScale() * (sprinting ? sprintMultiplier : 1f));

            if (OVRInput.GetDown(OVRInput.Button.Start)) CycleComfortProfile();
            UpdateRecenter();
            UpdateTeleport(turnAxis);
            UpdateComfortVignette(moveAxis, turnAxis, sprinting);

            if (hapticStopTime > 0f && Time.unscaledTime >= hapticStopTime)
            {
                OVRInput.SetControllerVibration(0f, 0f, hapticController);
                hapticStopTime = 0f;
            }
        }

        public void CycleComfortProfile()
        {
            comfortProfile = (comfortProfile + 1) % 3;
            ApplyComfortProfile(comfortProfile);
            Pulse(OVRInput.Controller.LTouch, 0.22f);
        }

        public void Recenter()
        {
            if (OVRManager.display != null) OVRManager.display.RecenterPose();
            playerController.Stop();
            Pulse(OVRInput.Controller.Touch, 0.35f);
            Debug.Log("AMX Locomotion: tracking recentered", this);
        }

        private void ApplyComfortProfile(int profile)
        {
            playerController.SnapRotation = profile != 2;
            playerController.RotationRatchet = profile == 0 ? 30f : 45f;
            playerController.RotationAmount = profile == 2 ? 1.35f : 1.05f;
            UpdateStatus();
            Debug.Log($"AMX Locomotion: {ComfortProfileName} profile active", this);
        }

        private float ProfileMoveScale()
        {
            return comfortProfile switch
            {
                0 => 0.72f,
                2 => 1.16f,
                _ => 0.94f
            };
        }

        private void UpdateStatus()
        {
            if (!locomotionStatus) return;
            var turn = playerController.SnapRotation ? $"SNAP {playerController.RotationRatchet:0}" : "SMOOTH TURN";
            locomotionStatus.text = $"{ComfortProfileName}  |  {turn}  |  TELEPORT READY";
        }

        private void UpdateRecenter()
        {
            var bothSticks = OVRInput.Get(OVRInput.Button.PrimaryThumbstick) &&
                             OVRInput.Get(OVRInput.Button.SecondaryThumbstick);
            recenterHoldSeconds = bothSticks ? recenterHoldSeconds + Time.unscaledDeltaTime : 0f;
            if (recenterHoldSeconds < 1.15f) return;
            recenterHoldSeconds = -10f;
            Recenter();
        }

        private void UpdateTeleport(Vector2 turnAxis)
        {
            var wantsAim = turnAxis.y > TeleportAimThreshold &&
                           Mathf.Abs(turnAxis.y) > Mathf.Abs(turnAxis.x) + 0.12f;

            if (wantsAim)
            {
                teleportAiming = true;
                playerController.EnableLinearMovement = false;
                playerController.EnableRotation = false;
                DrawTeleportArc();
                return;
            }

            if (!teleportAiming) return;
            if (turnAxis.y > TeleportReleaseThreshold)
            {
                DrawTeleportArc();
                return;
            }

            teleportAiming = false;
            playerController.EnableLinearMovement = true;
            playerController.EnableRotation = true;
            SetTeleportVisuals(false);
            if (teleportValid) CommitTeleport();
        }

        private void DrawTeleportArc()
        {
            var origin = teleportSource.position;
            var velocity = teleportSource.forward * teleportSpeed + Vector3.up * teleportLift;
            var previous = origin;
            var pointCount = 1;
            arcPoints[0] = origin;
            teleportValid = false;

            for (var index = 1; index < ArcPointCount; index++)
            {
                var time = index * teleportStepSeconds;
                var next = origin + velocity * time + Physics.gravity * (0.5f * time * time);
                if (Physics.SphereCast(previous, 0.035f, next - previous, out var hit,
                        Vector3.Distance(previous, next), teleportMask, QueryTriggerInteraction.Ignore))
                {
                    arcPoints[pointCount++] = hit.point;
                    teleportDestination = hit.point;
                    teleportValid = Vector3.Angle(hit.normal, Vector3.up) <= maximumSlope && HasPlayerClearance(hit.point);
                    break;
                }

                arcPoints[pointCount++] = next;
                previous = next;
            }

            teleportArc.positionCount = pointCount;
            teleportArc.SetPositions(arcPoints);
            teleportArc.sharedMaterial = teleportValid ? validTeleportMaterial : invalidTeleportMaterial;
            teleportArc.enabled = true;
            teleportReticle.gameObject.SetActive(pointCount < ArcPointCount || teleportValid);
            teleportReticle.position = teleportDestination + Vector3.up * 0.012f;
            teleportReticle.rotation = Quaternion.identity;
            teleportReticleRenderer.sharedMaterial = teleportValid ? validTeleportMaterial : invalidTeleportMaterial;
        }

        private bool HasPlayerClearance(Vector3 floorPoint)
        {
            var radius = Mathf.Max(0.1f, characterController.radius - characterController.skinWidth);
            var bottom = floorPoint + Vector3.up * (radius + characterController.skinWidth + 0.02f);
            var top = floorPoint + Vector3.up * (characterController.height - radius + 0.02f);
            var count = Physics.OverlapCapsuleNonAlloc(bottom, top, radius, clearanceHits, teleportMask,
                QueryTriggerInteraction.Ignore);
            for (var index = 0; index < count; index++)
            {
                var hit = clearanceHits[index];
                if (!hit || hit.transform.IsChildOf(transform)) continue;
                return false;
            }
            return true;
        }

        private void CommitTeleport()
        {
            var eyeOffset = cameraRig.centerEyeAnchor.position - transform.position;
            eyeOffset.y = 0f;
            characterController.enabled = false;
            transform.position = teleportDestination - eyeOffset + Vector3.up * 0.035f;
            characterController.enabled = true;
            playerController.Teleported = true;
            playerController.Stop();
            Pulse(OVRInput.Controller.RTouch, 0.42f);
            Debug.Log($"AMX Locomotion: teleported to {teleportDestination:F2}", this);
        }

        private void UpdateComfortVignette(Vector2 moveAxis, Vector2 turnAxis, bool sprinting)
        {
            var movement = Mathf.Max(moveAxis.magnitude, Mathf.Abs(turnAxis.x));
            var profileStrength = comfortProfile switch
            {
                0 => 0.68f,
                2 => 0.18f,
                _ => 0.42f
            };
            var target = teleportAiming ? 0f : Mathf.Clamp01(movement) * profileStrength * (sprinting ? 1.15f : 1f);
            vignetteAlpha = Mathf.MoveTowards(vignetteAlpha, target,
                Time.unscaledDeltaTime * (target > vignetteAlpha ? 3.8f : 2.4f));
            SetVignetteAlpha(vignetteAlpha);
        }

        private void SetVignetteAlpha(float alpha)
        {
            if (!comfortVignette) return;
            comfortVignette.GetPropertyBlock(vignetteProperties);
            vignetteProperties.SetColor("_Color", new Color(0.002f, 0.004f, 0.008f, alpha));
            comfortVignette.SetPropertyBlock(vignetteProperties);
        }

        private void SetTeleportVisuals(bool visible)
        {
            if (teleportArc) teleportArc.enabled = visible;
            if (teleportReticle) teleportReticle.gameObject.SetActive(visible);
        }

        private void Pulse(OVRInput.Controller controller, float amplitude)
        {
            OVRInput.SetControllerVibration(0.18f, amplitude, controller);
            hapticController = controller;
            hapticStopTime = Time.unscaledTime + 0.07f;
        }

        private void OnDisable()
        {
            OVRInput.SetControllerVibration(0f, 0f, OVRInput.Controller.Touch);
        }
    }
}
