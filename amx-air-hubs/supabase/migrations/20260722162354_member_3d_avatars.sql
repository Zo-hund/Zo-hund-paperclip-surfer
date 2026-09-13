alter table public.member_profiles
add column if not exists avatar_model_url text
check (
  avatar_model_url is null
  or (
    char_length(avatar_model_url) <= 500
    and (
      avatar_model_url ~ '^/models/(zohund-avatar[.]glb|avatars/[a-z0-9-]+/avatar[.]gltf)$'
      or avatar_model_url ~ '^https://models[.]readyplayer[.]me/[A-Za-z0-9_-]+[.]glb([?][A-Za-z0-9_.,=&%-]+)?$'
    )
  )
);

grant update (avatar_model_url) on public.member_profiles to authenticated;
