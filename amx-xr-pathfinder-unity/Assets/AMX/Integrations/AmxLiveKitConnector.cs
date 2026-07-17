using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using AMX.XR.Realtime;
using LiveKit;
using UnityEngine;

namespace AMX.XR.Integrations
{
    public sealed class AmxLiveKitConnector : MonoBehaviour, IAmxLiveKitConnector
    {
        [SerializeField] private Renderer videoSurface;
        [SerializeField, Range(0f, 1f)] private float remoteAudioSpatialBlend = 0.7f;

        private readonly List<RemoteMediaBinding> bindings = new List<RemoteMediaBinding>();
        private Room room;

        public bool IsConnected => room != null && room.IsConnected;

        public async Task ConnectAsync(string serverUrl, string participantToken, CancellationToken cancellationToken)
        {
            if (IsConnected) return;
            if (string.IsNullOrWhiteSpace(serverUrl) || string.IsNullOrWhiteSpace(participantToken))
                throw new ArgumentException("LiveKit server URL and participant token are required.");

            CleanupRoom();
            room = new Room();
            room.TrackSubscribed += OnTrackSubscribed;

            using var registration = cancellationToken.Register(() => room?.Disconnect());
            var connect = room.Connect(serverUrl, participantToken, new RoomOptions
            {
                AutoSubscribe = true,
                AdaptiveStream = true,
                Dynacast = true,
                JoinRetries = 3
            });
            await connect;
            cancellationToken.ThrowIfCancellationRequested();
            if (connect.IsError || !room.IsConnected)
            {
                CleanupRoom();
                throw new InvalidOperationException("LiveKit rejected the room connection.");
            }
        }

        public Task DisconnectAsync()
        {
            CleanupRoom();
            return Task.CompletedTask;
        }

        private void OnTrackSubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant participant)
        {
            if (track is RemoteVideoTrack videoTrack)
            {
                var stream = new VideoStream(videoTrack);
                stream.TextureReceived += texture =>
                {
                    if (videoSurface) videoSurface.material.mainTexture = texture;
                };
                stream.Start();
                bindings.Add(new RemoteMediaBinding
                {
                    video = stream,
                    updateRoutine = StartCoroutine(stream.Update())
                });
                return;
            }

            if (track is RemoteAudioTrack audioTrack)
            {
                var audioObject = new GameObject($"LiveKit Audio - {participant.Identity}");
                audioObject.transform.SetParent(transform, false);
                var source = audioObject.AddComponent<AudioSource>();
                source.spatialBlend = remoteAudioSpatialBlend;
                source.playOnAwake = false;
                bindings.Add(new RemoteMediaBinding
                {
                    audio = new AudioStream(audioTrack, source),
                    audioObject = audioObject
                });
            }
        }

        private void CleanupRoom()
        {
            foreach (var binding in bindings)
            {
                if (binding.updateRoutine != null) StopCoroutine(binding.updateRoutine);
                binding.video?.Stop();
                binding.video?.Dispose();
                binding.audio?.Dispose();
                if (binding.audioObject) Destroy(binding.audioObject);
            }
            bindings.Clear();

            if (room != null)
            {
                room.TrackSubscribed -= OnTrackSubscribed;
                room.Dispose();
                room = null;
            }
        }

        private void OnDestroy()
        {
            CleanupRoom();
        }

        private sealed class RemoteMediaBinding
        {
            public VideoStream video;
            public Coroutine updateRoutine;
            public AudioStream audio;
            public GameObject audioObject;
        }
    }
}
