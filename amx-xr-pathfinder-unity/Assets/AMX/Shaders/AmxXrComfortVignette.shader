Shader "AMX/XR Comfort Vignette"
{
    Properties
    {
        _Color ("Color", Color) = (0, 0, 0, 0)
        _Radius ("Clear Radius", Range(0.05, 0.7)) = 0.28
        _Feather ("Feather", Range(0.05, 0.5)) = 0.28
    }
    SubShader
    {
        Tags { "Queue"="Overlay" "RenderType"="Transparent" }
        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            fixed4 _Color;
            float _Radius;
            float _Feather;

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float distanceFromCenter = distance(input.uv, float2(0.5, 0.5));
                float edge = smoothstep(_Radius, _Radius + _Feather, distanceFromCenter);
                return fixed4(_Color.rgb, _Color.a * edge);
            }
            ENDCG
        }
    }
}
