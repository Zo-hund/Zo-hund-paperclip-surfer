using AMX.XR.Simulation;
using UnityEngine;

namespace AMX.XR.Integrations
{
    public enum AmxQuestControlAction
    {
        NextScenario,
        PreviousScenario,
        RunSkill,
        AskAgent,
        ToggleWorld,
        CycleComfort,
        Recenter
    }

    public sealed class AmxQuestControlTarget : MonoBehaviour
    {
        [SerializeField] private AmxQuestControlAction action;
        [SerializeField] private AmxDataCenterSimulation simulation;
        [SerializeField] private AmxQuestSimulationInput simulationInput;
        [SerializeField] private AmxQuestLocomotion locomotion;
        [SerializeField] private Renderer targetRenderer;
        [SerializeField] private Color idleColor = new(0.04f, 0.3f, 0.42f);
        [SerializeField] private Color hoverColor = new(0.12f, 0.9f, 1f);

        private MaterialPropertyBlock properties;

        private void Awake()
        {
            properties = new MaterialPropertyBlock();
        }

        private void Start()
        {
            SetHovered(false);
        }

        public void Activate()
        {
            switch (action)
            {
                case AmxQuestControlAction.NextScenario:
                    simulation.NextScenario();
                    break;
                case AmxQuestControlAction.PreviousScenario:
                    simulation.PreviousScenario();
                    break;
                case AmxQuestControlAction.RunSkill:
                    simulation.RunNextSkill();
                    break;
                case AmxQuestControlAction.AskAgent:
                    simulation.AskAgentForScenario();
                    break;
                case AmxQuestControlAction.ToggleWorld:
                    simulationInput.ToggleWorldMode();
                    break;
                case AmxQuestControlAction.CycleComfort:
                    locomotion.CycleComfortProfile();
                    break;
                case AmxQuestControlAction.Recenter:
                    locomotion.Recenter();
                    break;
            }
            Debug.Log($"AMX Controller: {action} activated", this);
        }

        public void SetHovered(bool hovered)
        {
            if (!targetRenderer) return;
            var color = hovered ? hoverColor : idleColor;
            targetRenderer.GetPropertyBlock(properties);
            properties.SetColor("_Color", color);
            properties.SetColor("_EmissionColor", color * (hovered ? 2.2f : 0.7f));
            targetRenderer.SetPropertyBlock(properties);
        }
    }
}
