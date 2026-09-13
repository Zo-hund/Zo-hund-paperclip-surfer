using AMX.XR.Simulation;
using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxQuestSimulationInput : MonoBehaviour
    {
        [SerializeField] private AmxDataCenterSimulation simulation;
        [SerializeField] private OVRPassthroughLayer passthroughLayer;

        private bool immersive;

        private void Start()
        {
            ApplyWorldMode(false);
        }

        private void Update()
        {
            if (!simulation) return;
            if (OVRInput.GetDown(OVRInput.Button.One)) simulation.NextScenario();
            if (OVRInput.GetDown(OVRInput.Button.Two)) simulation.PreviousScenario();
            if (OVRInput.GetDown(OVRInput.Button.Three)) simulation.RunNextSkill();
            if (OVRInput.GetDown(OVRInput.Button.Four)) ToggleWorldMode();
            if (OVRInput.GetDown(OVRInput.Button.SecondaryThumbstick) &&
                !OVRInput.Get(OVRInput.Button.PrimaryThumbstick)) simulation.AskAgentForScenario();
        }

        public void ToggleWorldMode()
        {
            ApplyWorldMode(!immersive);
        }

        private void ApplyWorldMode(bool useImmersiveMode)
        {
            immersive = useImmersiveMode;
            if (passthroughLayer) passthroughLayer.hidden = immersive;
            if (simulation) simulation.SetImmersiveMode(immersive);
        }
    }
}
